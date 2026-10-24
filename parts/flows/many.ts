import type { Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import { checkValue, isPlan, isWritten } from '../core/internal.ts'
import type { Tx } from '../data/index.ts'
import { addRunWith } from './adding.ts'
import { never, noteEnded } from './branches.ts'
import { flowOf } from './flowOf.ts'
import { isTriedAgain, keptError, thrownOf } from './kept.ts'
import type { Many } from './manyCount.ts'
import { allEnded, entriesOfRun, manyOf, pastMayFail } from './manyCount.ts'
import type { Pass, Reached } from './pass.ts'
import { answered, atOf, beganAt, endedAt, park, reach, saveStep, tellStep } from './pass.ts'
import { readIn } from './places.ts'
import { projectLimit } from './projectLimit.ts'
import type { RunRow, StepRow } from './rows.ts'
import { readRunRows, readStep, writeStep } from './rows.ts'

/** What `step.many` takes last. */
export interface ManyOptions {
  chunk?: number
  atOnce?: number
  mayFail?: number | string
}

/** One entry as it was read, with its place: the id of its row for a plan, and its place in the list for a list. */
interface Entry {
  place: string | number
  value: unknown
}

/** A limit of the project of the run's version, or its default. */
const limitOf = (pass: Pass, name: 'workPage' | 'manyOrdered'): number =>
  projectLimit(pass.of.held, pass.of.run.version, name)

/** Whether a value is a stored plan: a record that names the table it reads. */

/** The stored plan of what `step.many` is handed: a plan that a table made, or its record. Nothing for a list. */
function planIn(entries: unknown): Plan | undefined {
  if (Array.isArray(entries) || !isWritten(entries)) return undefined
  const plan = isWritten(entries.plan) ? entries.plan : entries
  return isPlan(plan) ? plan : undefined
}

/**
 * Reads the next entries: a page of a list, or of a plan with neither an order nor a `limit`, in the order of
 * its ids, after the place where the count stands; and a plan that states either whole, once. Answers the entries
 * and where the next page begins, or nothing where none follows. Throws T5101 for an ordered plan past `manyOrdered`.
 */
async function pageOf(
  pass: Pass,
  entries: unknown,
  many: Many,
): Promise<{ entries: Entry[]; after?: string | number }> {
  const size = limitOf(pass, 'workPage')
  const plan = planIn(entries)
  if (!plan) {
    const list = Array.isArray(entries) ? entries : []
    const from = many.next.n
    const page = list.slice(from, from + size).map((value, i) => ({ place: from + i, value }))
    return { entries: page, ...(from + size < list.length ? { after: from + size } : {}) }
  }
  const db = pass.of.held.env.db(atOf(pass))
  const picked = plan.pick && !plan.pick.includes('id') ? { pick: [...plan.pick, 'id'] } : {}
  const entryOf = (row: unknown): Entry => {
    const { id, ...rest } = Object(row)
    return { place: String(id), value: plan.pick && !plan.pick.includes('id') ? rest : Object(row) }
  }
  if (plan.sort?.length || plan.limit !== undefined) {
    const most = limitOf(pass, 'manyOrdered')
    const limit = typeof plan.limit === 'number' ? Math.min(plan.limit, most + 1) : most + 1
    const rows: unknown = await db.read({ ...plan, ...picked, limit })
    const list = Array.isArray(rows) ? rows : []
    if (list.length > most)
      throw new TentError(
        'T5101',
        `The plan of the step.many answers more than ${most} rows, past \`limits.manyOrdered\`.`,
        { fix: 'Leave the order and the `limit` out, so that the plan is read page by page, or raise `manyOrdered`.' },
      )
    return { entries: list.map(entryOf) }
  }
  const read: unknown = await db.read({ ...plan, ...picked, after: many.next.after ?? null, limit: size })
  const rows: unknown = Reflect.get(Object(read), 'rows')
  const next: unknown = Reflect.get(Object(read), 'next')
  return {
    entries: (Array.isArray(rows) ? rows : []).map(entryOf),
    ...(typeof next === 'string' ? { after: next } : {}),
  }
}

/** The misfit of an entry against the input of the flow, or nothing where it fits. */
function misfitOf(fields: unknown, value: unknown): string | undefined {
  const shape: Record<string, Type> = {}
  for (const [name, type] of Object.entries(Object(fields))) if (isWritten(type)) shape[name] = Object(type)
  const [found] = checkValue({ kind: 'object', shape }, value ?? {})
  return found?.message
}

/** The run of a flow that the step's run is the parent of, for one entry or one chunk. */
interface Adding {
  place: string | number
  input: unknown
  entries: number
}

/**
 * Adds the runs of one page in one write, which also moves the count on: past the page, by its entries, and to
 * `read` where it was the last. An entry that does not fit the flow's input counts as failed, with T0002, and is
 * left out. A run that ended well on an earlier try is not added again; it was counted when the try began.
 */
function addPage(pass: Pass, reached: Reached, many: Many, page: { entries: Entry[]; after?: string | number }): Many {
  const { held, run } = pass.of
  const flow = flowOf(held, run.version, many.flow)
  const fields = flow.record.input
  const listField = isWritten(fields) && isWritten(fields.entries) ? fields.entries.of : undefined
  const adding: Adding[] = []
  let failed = 0
  if (many.chunk === undefined)
    for (const entry of page.entries) {
      if (misfitOf(fields, entry.value) !== undefined) failed += 1
      else adding.push({ place: entry.place, input: entry.value, entries: 1 })
    }
  else
    for (let i = 0; i < page.entries.length; i += many.chunk) {
      const chunk = page.entries.slice(i, i + many.chunk)
      const fitting = chunk.filter(
        (entry) => misfitOf(isWritten(listField) ? listField.shape : {}, entry.value) === undefined,
      )
      failed += chunk.length - fitting.length
      if (fitting.length && chunk[0])
        adding.push({
          place: chunk[0].place,
          input: { entries: fitting.map((one) => one.value) },
          entries: fitting.length,
        })
    }
  const at = atOf(pass, reached.at)
  let moved = many
  readIn(held.env, run.id).write((tx: Tx) => {
    const now = manyOf(readStep(tx, run.id, reached.at)?.many) ?? many
    let entries = now.entries + failed
    for (const one of adding) {
      const added = addRunWith(
        held,
        {
          flow: many.flow,
          version: run.version,
          input: one.input,
          startedBy: run.startedBy,
          parent: at,
          call: `many\n${typeof one.place === 'number' ? `#${one.place}` : one.place}`,
          ...(run.leave ? { leave: run.leave } : {}),
          ...(many.atOnce === undefined ? {} : { given: { atOnce: many.atOnce } }),
        },
        tx,
        (id) => held.stop(id),
      )
      // A run that ended well on an earlier try of this step was counted when this try began.
      if (added.there !== 'done') entries += one.entries
    }
    moved = {
      ...now,
      entries,
      failed: now.failed + failed,
      next: { ...(page.after === undefined ? {} : { after: page.after }), n: now.next.n + page.entries.length },
      ...(page.after === undefined ? { read: true } : {}),
    }
    if (!moved.passed && pastMayFail(moved)) {
      moved.passed = true
      moved.error = keptError(new TentError('T0002', 'An entry of the step.many does not fit the input of its flow.'))
    }
    writeStep(tx, run.id, reached.at, { many: { ...moved } }, false)
  })
  return moved
}

/** The entries of the runs of this step that ended well: where a second try begins its count. */
function endedWell(pass: Pass, reached: Reached, chunk: number | undefined): number {
  const runs = readRunRows(readIn(pass.of.held.env, pass.of.run.id), {
    all: [
      { col: 'parent', is: pass.of.run.id },
      { col: 'state', is: 'done' },
    ],
  })
  const ours = (one: RunRow): boolean =>
    one.parentStep?.name === reached.at.name && one.parentStep.repeat === reached.at.repeat
  return runs.filter(ours).reduce((sum, one) => sum + entriesOfRun(one, chunk), 0)
}

/** Ends the step: done with its counts, or failed with the error of the run that passed `mayFail`, tried again as tries allow. */
function ending(pass: Pass, reached: Reached, row: StepRow, many: Many): Promise<unknown> {
  const { at, branch } = reached
  const { clock } = pass.of.held.env
  if (!many.passed) {
    const result = { entries: many.entries, done: many.done, failed: many.failed + many.stopped }
    const done = saveStep(pass, at, {
      state: 'done',
      result,
      size: JSON.stringify(result).length,
      endedAt: endedAt(pass),
    })
    tellStep(pass, at, { state: 'done' })
    noteEnded(branch, done.endedAt)
    return Promise.resolve(answered(pass, result))
  }
  // The runs that are still at work end with the step.
  pass.of.held.stopMany(pass.of.run.id, at)
  const error = thrownOf(many.error)
  const failed = row.tries + 1
  if (!isTriedAgain(error) || failed >= pass.of.tries.max) {
    const gone = saveStep(pass, at, { state: 'failed', tries: failed, error: keptError(error), endedAt: endedAt(pass) })
    tellStep(pass, at, { state: 'failed' })
    noteEnded(branch, gone.endedAt)
    pass.failedBy.set(error, reached.name)
    answered(pass, undefined)
    return Promise.reject(error)
  }
  const wakeAt = clock.now() + pass.of.tries.wait * 6 ** (failed - 1)
  saveStep(pass, at, { state: 'waiting', tries: failed, error: keptError(error), wakeAt })
  tellStep(pass, at, { state: 'waiting' })
  return park(pass, branch, wakeAt)
}

/**
 * `step.many`: a run of `flow` for each entry, or each chunk of entries, of a list or of a plan, with the step's
 * run as its parent, and the step's run waits for all of them. The runs are added a page in one write, with the
 * count, so a restart adds none twice. Answers `{ entries, done, failed }`, each a count of entries.
 */
export async function manyTool(
  pass: Pass,
  name: string,
  entries: unknown,
  flow: unknown,
  o: ManyOptions = {},
): Promise<unknown> {
  const reached = reach(pass, name)
  if (!reached) return never()
  const { at, branch } = reached
  const { clock } = pass.of.held.env
  let row = reached.row
  if (row?.state === 'done') {
    noteEnded(branch, row.endedAt)
    return answered(pass, row.result)
  }
  if (row?.state === 'failed') {
    noteEnded(branch, row.endedAt)
    const thrown = thrownOf(row.error)
    pass.failedBy.set(thrown, reached.name)
    answered(pass, undefined)
    throw thrown
  }
  // A try that failed waits for its time, and then the step is tried again from a count of what ended well.
  if (row?.state === 'waiting' && row.wakeAt !== undefined && clock.now() < row.wakeAt)
    return park(pass, branch, row.wakeAt)
  let many = manyOf(row?.many)
  if (!row || !many || row.wakeAt !== undefined) {
    const named = typeof flow === 'string' ? flow : String(Reflect.get(Object(flow), 'definition') ?? '')
    const stated = {
      ...(o.chunk === undefined ? {} : { chunk: o.chunk }),
      ...(o.atOnce === undefined ? {} : { atOnce: o.atOnce }),
      ...(o.mayFail === undefined ? {} : { mayFail: o.mayFail }),
    }
    const well = row ? endedWell(pass, reached, o.chunk) : 0
    many = {
      flow: named,
      next: { n: 0 },
      read: false,
      entries: well,
      done: well,
      failed: 0,
      stopped: 0,
      since: clock.now(),
      ...stated,
    }
    row = saveStep(pass, at, {
      state: 'waiting',
      startedAt: row?.startedAt ?? beganAt(pass),
      wakeAt: null,
      tries: row?.tries ?? 0,
      many: { ...many },
    })
    tellStep(pass, at, { state: 'waiting' })
  }
  while (!many.read && !many.passed) {
    const page = await pageOf(pass, entries, many)
    if (pass.over) return never()
    many = addPage(pass, reached, many, page)
  }
  // The count as the writes of the runs moved it.
  const now = readStep(readIn(pass.of.held.env, pass.of.run.id), pass.of.run.id, at)
  many = manyOf(now?.many) ?? many
  if (many.passed || allEnded(many)) return ending(pass, reached, now ?? row, many)
  return park(pass, branch)
}
