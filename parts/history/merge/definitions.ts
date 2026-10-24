import type { Description } from '../../core/internal.ts'
import { definitionSource, notInRecord } from '../../core/internal.ts'
import type { Described } from '../compare/definitions.ts'
import { textOf } from '../compare/records.ts'
import { mergeBody } from './bodies.ts'
import type { Defined } from './defined.ts'
import { definedAs, definitionNames, isCode, placesIn, rawAt } from './defined.ts'
import { addImports } from './imports.ts'
import type { LinesApart } from './lines.ts'
import { endOf, linesOf, mergeLines } from './lines.ts'
import type { FieldApart } from './values.ts'
import { mergeValue } from './values.ts'

/** Why a definition that both sides changed is left as ours, with what the clash file shows of it. */
export type DefinitionApart =
  | { kind: 'fields'; fields: FieldApart[] }
  | { kind: 'code'; lines: LinesApart[] }
  | { kind: 'removed'; changed: 'ours' | 'theirs' }
  | { kind: 'unwritable'; why: string }

/** One definition of a file that the merge leaves as ours, and why. */
export interface DefinitionClash {
  what: string
  name: string
  apart: DefinitionApart
}

/** One side of a merge, for one file: its text, or nothing where it holds none, and the description of its point. */
export interface Side {
  text?: string
  described?: Described
}

// What nobody wrote, which the build worked out: it is taken from ours and never merged.
const workedOut = [
  'stepNames',
  'module',
  'export',
  'tiedTo',
  'reads',
  'touches',
  'reaches',
  'uses',
  'opens',
  'needs',
  'sends',
]
const bodies = ['body', 'onFail']

/** A span of a text that one statement of definitions holds, from its first character to the one after its last. */
interface Span {
  key: string
  names: string[]
  start: number
  end: number
}

/** The statements of definitions of a file, each with the names it gives, in the order they stand. */
function spansOf(side: Side, path: string): Span[] {
  const text = side.text
  if (text === undefined) return []
  const byStart = new Map<number, Span>()
  for (const [name, place] of placesIn(side.described, path)) {
    const [start, end] = [rawAt(text, place.from), rawAt(text, place.to) + 1]
    const span = byStart.get(start)
    if (span) {
      span.names.push(name)
      span.end = Math.max(span.end, end)
    } else byStart.set(start, { key: name, names: [name], start, end })
  }
  for (const span of byStart.values()) span.key = [...span.names].sort()[0]
  return [...byStart.values()].sort((a, b) => a.start - b.start)
}

// A mark of a statement is a character of the private area of Unicode, which no text of a project holds.
const mark = (key: string): string => `${key}`

/** The text of a file with each statement of definitions in the place of a mark of its own, as lines. */
function skeletonOf(text: string | undefined, spans: Span[]): string[] {
  if (text === undefined) return []
  let out = ''
  let at = 0
  for (const span of spans) {
    out += text.slice(at, span.start) + mark(span.key)
    at = span.end
  }
  return linesOf(out + text.slice(at))
}

/** What one side holds of one definition: its text with one line ending, its definition, and whether it shares its statement. */
interface Held {
  text?: string
  defined?: Defined
  shared: boolean
}

function heldBy(side: Side, spans: Span[], name: string): Held {
  const span = spans.find((one) => one.names.includes(name))
  if (!span || side.text === undefined || !side.described) return { shared: false }
  return {
    text: side.text.slice(span.start, span.end).replace(/\r\n/g, '\n'),
    defined: definedAs(side.described, name),
    shared: span.names.length > 1,
  }
}

/** A side changed a definition where its text or its record differs, line ends aside. */
const sameHeld = (a: Held, b: Held): boolean =>
  a.text === b.text && textOf(a.defined?.record) === textOf(b.defined?.record)

/** A description with one record of it in the place of its own. */
function withRecord(description: Described, defined: Defined, name: string, record: unknown): Description {
  const copy: Record<string, unknown> = { ...description }
  if (defined.part === 'project') copy.project = record
  else copy[defined.part] = { ...Object(description[defined.part]), [name]: record }
  return Object(copy)
}

/** What becomes of one definition: ours or theirs as they stand, text written anew, or nothing. */
type Taken = { take: 'ours' | 'theirs' } | { text: string; description?: Description } | { removed: true }

/**
 * Merges the records of a plain definition that both sides changed, field by field, and its bodies by their
 * steps. Answers the merged record, or nothing where a field clashes, which `apart` then names.
 */
function mergedRecord(name: string, b: Defined | undefined, m: Defined, y: Defined, apart: FieldApart[]): unknown {
  const strip = (record: Record<string, unknown> | undefined): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(record ?? {}).filter(([key]) => !workedOut.includes(key) && !bodies.includes(key)),
    )
  const merged = Object(mergeValue(strip(b?.record), strip(m.record), strip(y.record), apart))
  for (const key of workedOut) if (m.record[key] !== undefined) merged[key] = m.record[key]
  for (const option of bodies) {
    const [was, mine, yours] = [b?.record[option], m.record[option], y.record[option]]
    if (mine === undefined && yours === undefined) continue
    const front = option === 'onFail' ? 'onFail.' : ''
    const body = mergeBody(was, mine, yours, apart, { option, owner: name, front })
    if (body !== undefined) merged[option] = body
  }
  return apart.length ? undefined : merged
}

/** Decides what becomes of one definition that both sides hold apart from the shared point. */
function bothChanged(name: string, b: Held, m: Held, y: Held, ours: Side, clashes: DefinitionClash[]): Taken {
  const what = (m.defined ?? y.defined ?? b.defined)?.what ?? 'definition'
  if (m.text === undefined || y.text === undefined) {
    clashes.push({ what, name, apart: { kind: 'removed', changed: m.text === undefined ? 'theirs' : 'ours' } })
    return m.text === undefined ? { removed: true } : { take: 'ours' }
  }
  if (!m.defined || !y.defined || isCode(m.defined) || isCode(y.defined)) {
    const merged = mergeLines(linesOf(b.text ?? ''), linesOf(m.text), linesOf(y.text))
    if (!merged.apart.length) return { text: merged.lines.join('\n') }
    clashes.push({ what, name, apart: { kind: 'code', lines: merged.apart } })
    return { take: 'ours' }
  }
  const fields: FieldApart[] = []
  const record = mergedRecord(name, b.defined, m.defined, y.defined, fields)
  if (record === undefined) {
    clashes.push({ what, name, apart: { kind: 'fields', fields } })
    return { take: 'ours' }
  }
  const why = m.shared
    ? 'ours shares its statement with another definition'
    : notInRecord(m.text, ours.text ?? '', definitionNames(ours.described), name)
  if (why === undefined)
    try {
      const description = withRecord(Object(ours.described), m.defined, name, record)
      return { text: definitionSource(description, name), description }
    } catch (error) {
      clashes.push({
        what,
        name,
        apart: {
          kind: 'unwritable',
          why: `it cannot be written anew: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
      return { take: 'ours' }
    }
  clashes.push({ what, name, apart: { kind: 'unwritable', why } })
  return { take: 'ours' }
}

/**
 * Merges one file that both sides changed and whose definitions the descriptions place: each definition that only
 * one side changed is taken from it whole, a plain definition that both changed is merged by its fields and
 * written anew at its place, a code definition that both changed is merged line by line, and the text between the
 * definitions is merged line by line. Answers the text, every definition that is left as ours with why, and the
 * places of the text between definitions that both changed.
 */
export function mergeDefinitions(
  path: string,
  sides: { base: Side; ours: Side; theirs: Side },
): { text: string; clashes: DefinitionClash[]; between: LinesApart[] } {
  const spans = {
    base: spansOf(sides.base, path),
    ours: spansOf(sides.ours, path),
    theirs: spansOf(sides.theirs, path),
  }
  const names = new Set([...spans.base, ...spans.ours, ...spans.theirs].flatMap((span) => span.names))
  const clashes: DefinitionClash[] = []
  const taken = new Map<string, Taken>()
  for (const name of names) {
    const b = heldBy(sides.base, spans.base, name)
    const m = heldBy(sides.ours, spans.ours, name)
    const y = heldBy(sides.theirs, spans.theirs, name)
    if (sameHeld(b, y) || sameHeld(m, y)) taken.set(name, m.text === undefined ? { removed: true } : { take: 'ours' })
    else if (sameHeld(b, m)) taken.set(name, y.text === undefined ? { removed: true } : { take: 'theirs' })
    else taken.set(name, bothChanged(name, b, m, y, sides.ours, clashes))
  }
  return { ...laidOut(path, sides, spans, taken), clashes }
}

/**
 * Lays the merged file out: the text between the definitions merged line by line, with each statement of
 * definitions put back in the place of its mark as the merge took it. A statement that the merge keeps and the
 * text between no longer holds, since the other side removed it, stands after the statement before it.
 */
function laidOut(
  path: string,
  sides: { base: Side; ours: Side; theirs: Side },
  spans: { base: Span[]; ours: Span[]; theirs: Span[] },
  taken: Map<string, Taken>,
): { text: string; between: LinesApart[] } {
  const end = endOf(sides.ours.text ?? sides.theirs.text ?? '')
  const merged = mergeLines(
    skeletonOf(sides.base.text, spans.base),
    skeletonOf(sides.ours.text, spans.ours),
    skeletonOf(sides.theirs.text, spans.theirs),
  )
  const lines = [...merged.lines]
  const has = (key: string): boolean => lines.some((line) => line.includes(mark(key)))
  for (const [k, span] of spans.ours.entries()) {
    const kept = span.names.some((name) => !('removed' in (taken.get(name) ?? { removed: true })))
    if (!kept || has(span.key)) continue
    const before = spans.ours
      .slice(0, k)
      .reverse()
      .find((one) => has(one.key))
    const at = before ? lines.findIndex((line) => line.includes(mark(before.key))) + 1 : lines.length
    lines.splice(at, 0, '', mark(span.key))
  }
  const spanText = (side: Side, list: Span[], key: string): string | undefined => {
    const span = list.find((one) => one.key === key)
    return span && side.text !== undefined ? side.text.slice(span.start, span.end) : undefined
  }
  const written: { name: string; description: Description }[] = []
  const put = (key: string): string => {
    const names = [...spans.ours, ...spans.theirs, ...spans.base].find((one) => one.key === key)?.names ?? [key]
    const choices = names.map((name) => taken.get(name) ?? { take: 'ours' as const })
    if (choices.every((one) => 'removed' in one)) return ''
    let raw: string | undefined
    for (const [k, one] of choices.entries())
      if ('text' in one) {
        raw = one.text
        if (one.description) written.push({ name: names[k], description: one.description })
      }
    if (raw === undefined && choices.every((one) => 'take' in one && one.take === 'theirs'))
      raw = spanText(sides.theirs, spans.theirs, key)
    raw ??= spanText(sides.ours, spans.ours, key) ?? spanText(sides.theirs, spans.theirs, key) ?? ''
    return raw.replace(/\r\n/g, '\n').split('\n').join(end)
  }
  const text = lines.join(end).replace(/([^]*)/g, (_, key: string) => put(key))
  return { text: addImports(text, path, written), between: merged.apart }
}
