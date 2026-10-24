import type { Tx } from '../data/index.ts'
import type { Held } from './held.ts'
import type { RunRow } from './rows.ts'
import { changeRun, readRun, readStep, writeStep } from './rows.ts'
import { isWritten } from '../core/internal.ts'

/** The count of a `step.many`, as it stands in `many` of its step's row. */
export interface Many {
  flow: string
  next: { after?: string | number; n: number }
  read: boolean
  entries: number
  done: number
  failed: number
  stopped: number
  // What the step states: entries to one run, runs at one time, and how many entries may fail.
  chunk?: number
  atOnce?: number
  mayFail?: number | string
  // The moment its try began: a run of an earlier try that ends now counts for that try alone.
  since: number
  // Set by the write that passed `mayFail`, with the error of the run that passed it.
  passed?: boolean
  error?: Record<string, unknown>
}

/** The count of a step's row, or nothing for a step that is no `step.many`. */
export function manyOf(stored: unknown): Many | undefined {
  if (!isWritten(stored) || typeof stored.flow !== 'string') return undefined
  const next = isWritten(stored.next) ? stored.next : {}
  const after = typeof next.after === 'string' || typeof next.after === 'number' ? next.after : undefined
  const count = (value: unknown): number => (typeof value === 'number' ? value : 0)
  return {
    flow: stored.flow,
    next: { ...(after === undefined ? {} : { after }), n: count(next.n) },
    read: stored.read === true,
    entries: count(stored.entries),
    done: count(stored.done),
    failed: count(stored.failed),
    stopped: count(stored.stopped),
    ...(typeof stored.chunk === 'number' ? { chunk: stored.chunk } : {}),
    ...(typeof stored.atOnce === 'number' ? { atOnce: stored.atOnce } : {}),
    ...(typeof stored.mayFail === 'number' || typeof stored.mayFail === 'string' ? { mayFail: stored.mayFail } : {}),
    since: count(stored.since),
    ...(stored.passed === true ? { passed: true } : {}),
    ...(isWritten(stored.error) ? { error: stored.error } : {}),
  }
}

/**
 * Whether more entries failed than `mayFail` allows. A count holds at once; a share is held against all entries,
 * once all were read, and `'all'` never stops anything.
 */
export function pastMayFail(many: Many): boolean {
  const stated = many.mayFail ?? 0
  if (stated === 'all') return false
  if (typeof stated === 'number') return many.failed > stated
  const share = Number.parseFloat(stated)
  if (!many.read || Number.isNaN(share)) return false
  return many.failed > (many.entries * share) / 100
}

/** Whether every entry that was read has ended, once all were read. */
export const allEnded = (many: Many): boolean => many.read && many.done + many.failed + many.stopped >= many.entries

/** How many entries a run of a `step.many` carries: those of its chunk, or one. */
export function entriesOfRun(run: RunRow, chunk: number | undefined): number {
  if (chunk === undefined) return 1
  const list = isWritten(run.input) ? run.input.entries : undefined
  return Array.isArray(list) ? list.length : 0
}

/**
 * Wakes the run of a `step.many` in the write that moved its count: a pass that is under way goes on with
 * another pass when it ends, and a run that waits is queued.
 */
function wakeMany(held: Held, tx: Tx, id: string): void {
  const work = held.atWork.get(id)
  if (work) {
    work.again = true
    return
  }
  const run = readRun(tx, id)
  if (run?.state !== 'waiting' || run.wakeAt !== undefined) return
  changeRun(tx, id, { state: 'queued' })
  held.later(id)
}

/**
 * Takes a run that ended, in the write that ends it. Where it is a run of a `step.many`, moves the count of that
 * step on by its entries, and wakes the step's run once every run ended or `mayFail` was passed; the rest is then
 * stopped. Answers whether the run was one of a `step.many`.
 */
export function endedInMany(held: Held, tx: Tx, run: RunRow, state: 'done' | 'failed' | 'stopped'): boolean {
  if (!run.parent || !run.parentStep) return false
  const row = readStep(tx, run.parent, run.parentStep)
  const many = manyOf(row?.many)
  if (!row || !many) return false
  if (row.state !== 'waiting' || run.createdAt < many.since) return true
  const n = entriesOfRun(run, many.chunk)
  const moved: Many = { ...many, [state]: many[state] + n }
  const wasPast = many.passed === true
  if (!wasPast && state === 'failed' && pastMayFail(moved)) {
    moved.passed = true
    const ended = readRun(tx, run.id)
    if (ended?.error) moved.error = ended.error
  }
  writeStep(tx, run.parent, run.parentStep, { many: { ...moved } }, false)
  if (moved.passed && !wasPast) {
    // The rest is stopped once this write has ended.
    const parent = run.parent
    setImmediate(() => held.stopMany(parent, run.parentStep ?? { name: '', repeat: 0 }))
  }
  if (allEnded(moved) || (moved.passed && !wasPast)) wakeMany(held, tx, run.parent)
  return true
}
