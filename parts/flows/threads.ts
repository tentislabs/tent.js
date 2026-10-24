import { TentError } from '../core/index.ts'
import type { TableLayout, Tx } from '../data/index.ts'
import type { Held } from './held.ts'
import { storeOf } from './places.ts'
import type { RunRow, Source } from './rows.ts'
import { readOf, readRunRows, system } from './rows.ts'

/**
 * `_t_threads`: for each conversation that has an unfinished run, the run that holds it; and for one that was
 * handed over, the agent that holds it, and those that handed it on, whose starts go to that agent.
 */
export const threadsTable: TableLayout = {
  name: '_t_threads',
  columns: {
    thread: { kind: 'text' },
    run: { kind: 'text' },
    agent: { kind: 'text', optional: true },
    from: { kind: 'json', optional: true },
  },
  key: ['thread'],
  indexes: [],
  unique: [],
  search: [],
}

/** Whether a source holds the table of the conversations: an app with no agent that remembers holds none. */
const holdsThreads = (source: Source): boolean =>
  !('layout' in source) || source.layout().some((one) => one.name === threadsTable.name)

/** The row of a conversation, where it has one. */
function threadRow(source: Source, thread: string): Record<string, unknown> | undefined {
  if (!holdsThreads(source)) return undefined
  const row: unknown = readOf(source, { from: threadsTable.name, one: 'get', id: thread })
  return typeof row === 'object' && row !== null ? Object(row) : undefined
}

/** The run that holds a conversation, or nothing where none does: a conversation held by an agent alone has none. */
function holderOf(source: Source, thread: string): string | undefined {
  const run: unknown = threadRow(source, thread)?.run
  return typeof run === 'string' && run !== '' ? run : undefined
}

/**
 * The agent that a conversation was handed over to, and those that handed it on, where it was: a start of one
 * of those on that conversation is a start of the one that holds it.
 */
export function heldBy(source: Source, thread: string): { agent: string; from: string[] } | undefined {
  const row = threadRow(source, thread)
  if (typeof row?.agent !== 'string') return undefined
  return { agent: row.agent, from: Array.isArray(row.from) ? row.from.map(String) : [] }
}

/** The runs that stand in the queue of a conversation, the oldest first. */
const queuedOn = (tx: Tx, thread: string, but: string): RunRow[] =>
  readRunRows(tx, {
    all: [
      { col: 'thread', is: thread },
      { col: 'state', is: 'queued' },
    ],
  })
    .filter((one) => one.id !== but)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))

/**
 * Takes a runner, the write a run is added in, the run with its conversation, and what happens to a start over
 * it. Settles inside that one write who holds the conversation, so that two starts at once cannot both work on it:
 * with no holder the run holds it; with `'refuse'` the start fails with T7103; with `'wait'` the run stands in the
 * queue behind the holder, `queued` at most, as `limits.queued` of the project says; with `'stop'` it holds the
 * conversation, and the holder is stopped. Answers whether the run may be taken up now, and the run that is to be
 * stopped.
 */
export function holdThread(
  tx: Tx,
  run: { id: string; thread: string; then?: 'refuse' | 'wait' | 'stop' },
  queued: number,
): { now: boolean; stop?: string } {
  const holder = holderOf(tx, run.thread)
  if (holder === undefined || holder === run.id) {
    // A conversation that an agent holds keeps its row: the run takes it up beside that.
    if (holder === undefined && threadRow(tx, run.thread))
      tx.change(threadsTable.name, run.thread, { run: run.id }, system)
    else if (holder === undefined) tx.add(threadsTable.name, { thread: run.thread, run: run.id }, system)
    return { now: true }
  }
  const then = run.then ?? 'refuse'
  if (then === 'stop') {
    tx.change(threadsTable.name, run.thread, { run: run.id }, system)
    return { now: true, stop: holder }
  }
  // The run that holds the conversation may not have been taken up yet: it stands in no queue.
  const behind = queuedOn(tx, run.thread, run.id).filter((one) => one.id !== holder)
  if (then === 'refuse' || behind.length >= queued)
    throw new TentError('T7103', `The conversation ${run.thread} has a run that works on it now.`, {
      fix:
        then === 'refuse'
          ? "Start again when it has ended, or state `then: 'wait'` in `together`."
          : 'Start again once the runs in its queue have ended.',
    })
  return { now: false }
}

/** Whether a run stands in the queue of a conversation behind the run that holds it, and is not to be taken up. */
export function behindHolder(held: Held, run: RunRow): boolean {
  if (run.thread === undefined) return false
  const source = storeOf(held.env, run.id) ?? held.env.store
  const holder = holderOf(source, run.thread)
  return holder !== undefined && holder !== run.id
}

/**
 * In the write that ends a run: where it holds its conversation, the oldest run in the queue of that conversation
 * holds it from here on and is taken up once the write has ended, and with none in the queue the row is removed,
 * but where an agent holds the conversation. A run that handed it over to `handedTo` leaves it held by that
 * agent, with the flow of the run among those whose starts go to it.
 */
export function releaseThread(held: Held, tx: Tx, run: RunRow, handedTo?: string): void {
  if (run.thread === undefined || holderOf(tx, run.thread) !== run.id) return
  const row = threadRow(tx, run.thread)
  const before = Array.isArray(row?.from) ? row.from.map(String) : []
  const kept =
    handedTo === undefined
      ? typeof row?.agent === 'string'
        ? { agent: row.agent, from: before }
        : undefined
      : { agent: handedTo, from: [...new Set([...before, run.flow])].filter((one) => one !== handedTo) }
  const [next] = queuedOn(tx, run.thread, run.id)
  if (next) {
    tx.change(threadsTable.name, run.thread, { run: next.id, ...(kept ?? {}) }, system)
    held.later(next.id)
  } else if (kept) tx.change(threadsTable.name, run.thread, { run: '', ...kept }, system)
  else tx.remove(threadsTable.name, run.thread, system)
}
