import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import { createDb } from '../../data/index.ts'
import type { At } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import type { Opened } from '../opened.ts'
import { sealed } from '../values/seal.ts'

import { byFingerprints, filesNamed, givenFiles } from './answerFiles.ts'
import type { Fed, KeptRead } from './kept.ts'
import { answerFiles, given, keep, rowOf } from './kept.ts'
import { fingerprintOfText, keyOf, rememberOf } from './keyOf.ts'
import { readsDue, readsOfStep } from './stepReads.ts'

// The work that is under way for each key, so that two same calls at one moment are carried out once.
const making = new WeakMap<Opened, Map<string, Promise<unknown>>>()

const fingerprintOf = (value: unknown): string => fingerprintOfText(JSON.stringify(value ?? null))

/** A db that reads as a caller, as a remembered answer's reads are made again: by the seal an action is handed. */
const readerOf = (o: Opened, caller: Caller) =>
  createDb(o.files ?? o.store, o.description, caller, 'read', o.rules, { now: () => o.clock.now(), ...sealed(o) })

/** Whether each read that the work made answers the same now, for the caller who asks: only then is the answer theirs. */
function readsHold(o: Opened, reads: unknown, caller: Caller): boolean {
  const db = readerOf(o, caller)
  const kept: KeptRead[] = Array.isArray(reads) ? reads.map((one) => Object(one)) : []
  try {
    return kept.every((one) => fingerprintOf(db.read(one.plan)) === one.answer)
  } catch {
    return false
  }
}

/** The rows of an answer that has some: each by its table, its id, and the tenant whose file it was read in. */
function fedBy(table: string, answer: unknown, of?: string): Fed[] {
  const list = Array.isArray(answer) ? answer : answer && typeof answer === 'object' ? [answer] : []
  return list.flatMap((row) => {
    const id: unknown = Reflect.get(Object(row), 'id')
    return typeof id === 'string' ? [{ tableName: table, rowId: id, ...(of === undefined ? {} : { of }) }] : []
  })
}

/**
 * The rows that travel with the work of a definition that states `rows`, read for this caller: their fingerprint
 * is part of what its answer rests on, and each of them fed it.
 */
function travelling(o: Opened, record: Record<string, unknown>, caller: Caller): { print: string; fed: Fed[] } {
  const rows: unknown = record.rows
  if (typeof rows !== 'object' || rows === null) return { print: '', fed: [] }
  const db = readerOf(o, caller)
  const read: Record<string, unknown> = {}
  const fed: Fed[] = []
  for (const [name, plan] of Object.entries(rows)) {
    const answer = db.read(Object(Reflect.get(Object(plan), 'plan') ?? plan))
    read[name] = answer
    fed.push(...fedBy(String(Reflect.get(Object(plan), 'from')), answer))
  }
  return { print: fingerprintOf(read), fed }
}

/** The kind of worker that a definition's work runs on, for a key that states `kind`. */
const kindOfWork = (record: Record<string, unknown>): string | undefined =>
  typeof record.worker === 'string' ? record.worker : record.background !== undefined ? 'any' : undefined

/**
 * Takes an app, the name and record of what remembers, the call context of its work, its input, and what carries
 * the work out. Answers the remembered answer where one holds for this caller - its own, or one that is shared
 * where each read of the work answers this caller the same - with each file it names as a loose file of the
 * caller's own; and otherwise carries the work out, noting what it read, and keeps its answer. A failure is never
 * kept. Two same calls at one moment are one making: the second waits for the first, and is then answered by the
 * same rules.
 */
export async function remembered(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  cx: CallContext,
  input: unknown,
  carry: () => Promise<unknown>,
): Promise<unknown> {
  const stated = rememberOf(record.remember)
  if (!stated) return carry()
  const rows = travelling(o, record, cx.caller)
  const restsOn = { input: byFingerprints(o, { kind: 'object', shape: record.input ?? {} }, input), rows: rows.print }
  const key = keyOf(o, name, record, stated, restsOn, cx.caller, kindOfWork(record))
  const under = making.get(o) ?? new Map<string, Promise<unknown>>()
  making.set(o, under)
  const before = under.get(key)
  if (before) await before.catch(() => undefined)
  const row = rowOf(o, key)
  const endsAt = row ? Date.parse(String(row.endsAt)) : 0
  const theirs = row && (row.caller === '' || row.caller === callerText(cx.caller))
  if (row && theirs && endsAt > o.clock.now() && readsHold(o, row.reads, cx.caller)) {
    given(o, key)
    return givenFiles(o, record.output, row.answer ?? undefined, answerFiles(row), cx.caller)
  }
  const reads: KeptRead[] = []
  const fed: Fed[] = [...rows.fed]
  cx.noting = notingInto(reads, fed)
  const work = carry()
  under.set(key, work)
  try {
    const answer = await work
    keep(o, key, name, cx.caller, stated, { answer, files: filesNamed(o, record.output, answer), reads, fed })
    return answer
  } finally {
    if (under.get(key) === work) under.delete(key)
  }
}

/** What notes each read of a piece of work into the reads and the rows that its answer is kept with. */
function notingInto(reads: KeptRead[], fed: Fed[]): NonNullable<CallContext['noting']> {
  return (plan, answer, file) => {
    reads.push({ plan, answer: fingerprintOf(answer) })
    fed.push(...fedBy(String(plan.from), answer, file?.id))
  }
}

/**
 * The remembered answer of a step that states `remember`, by its key, for the caller of its run, where each read
 * that its work made answers that caller the same now. Nothing where none holds: the step's work is then carried
 * out, and what it reads is noted for its answer.
 */
export function rememberedStep(
  o: Opened,
  at: At,
  stated: unknown,
  record: Record<string, unknown>,
): { answer: unknown } | undefined {
  const told = rememberOf(stated)
  if (!told || !at.step) return undefined
  const key = keyOf(o, `${at.flow}.${at.step.name}`, record, told, Reflect.get(Object(stated), 'key'), at.as)
  const row = rowOf(o, key)
  const theirs = row && (row.caller === '' || row.caller === callerText(at.as))
  if (row && theirs && Date.parse(String(row.endsAt)) > o.clock.now() && readsHold(o, row.reads, at.as)) {
    given(o, key)
    return { answer: row.answer ?? undefined }
  }
  const reads: KeptRead[] = []
  const fed: Fed[] = []
  readsDue(o, at, { reads, fed, noting: notingInto(reads, fed) })
  return undefined
}

/** Keeps the answer of a step that states `remember`, under its key, with what its work read and the rows that fed it. */
export function keepStep(o: Opened, at: At, stated: unknown, record: Record<string, unknown>, answer: unknown): void {
  const told = rememberOf(stated)
  if (!told || !at.step) return
  const key = keyOf(o, `${at.flow}.${at.step.name}`, record, told, Reflect.get(Object(stated), 'key'), at.as)
  const worked = readsOfStep(at)
  keep(o, key, `${at.flow}.${at.step.name}`, at.as, told, {
    answer,
    files: [],
    reads: worked?.reads ?? [],
    fed: worked?.fed ?? [],
  })
}
