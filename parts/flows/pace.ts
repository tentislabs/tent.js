import type { Plan } from '../core/internal.ts'
import type { Tx } from '../data/index.ts'
import type { FlowOf } from './flowOf.ts'
import { flowOf } from './flowOf.ts'
import { eventOf, inputOf } from './handed.ts'
import type { Held } from './held.ts'
import type { RunRow, Source } from './rows.ts'
import { changeRun, inWrite, readRunRows } from './rows.ts'
import { isWritten } from '../core/internal.ts'

/** A count over a stretch of time, as `pace` states it: so many runs in so many milliseconds. */
interface Window {
  max: number
  per: number
}

/** What `pace` of a flow says, each part held per key. */
export interface PaceOf {
  debounce?: number
  // So many runs in a minute, counted as a window of a minute.
  perMinute?: Window
  drop?: Window
  batch?: { max: number; wait: number }
  order: boolean
  turns: boolean
}

const numberOf = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

// How long the first start of a batch waits where `batch` states no `wait`: ten seconds.
const batchWait = 10_000

// The stretch of time that `perMinute` counts the runs in.
const minute = 60_000

/** A part of `pace` that counts runs in a stretch of time, or nothing where it is not stated whole. */
function windowOf(stated: unknown): Window | undefined {
  if (!isWritten(stated)) return undefined
  const [max, per] = [numberOf(stated.max), numberOf(stated.per)]
  return max === undefined || per === undefined ? undefined : { max, per }
}

/** What `pace` of a flow says, or nothing for a flow that states none. */
export function paceOf(flow: FlowOf): PaceOf | undefined {
  const stated = flow.record.pace
  if (!isWritten(stated)) return undefined
  const debounce = numberOf(stated.debounce)
  const inMinute = numberOf(stated.perMinute)
  const drop = windowOf(stated.drop)
  const batch = isWritten(stated.batch) ? stated.batch : undefined
  const [most, wait] = [numberOf(batch?.max), numberOf(batch?.wait)]
  return {
    ...(debounce === undefined ? {} : { debounce }),
    ...(inMinute === undefined ? {} : { perMinute: { max: inMinute, per: minute } }),
    ...(drop ? { drop } : {}),
    ...(most === undefined ? {} : { batch: { max: most, wait: wait ?? batchWait } }),
    order: stated.order !== undefined,
    turns: stated.turns === 'key',
  }
}

/** Whether a row of `_t_runs` is a start that waits for its pace: queued, with the moment it may go. */
export const isWaitingStart = (run: RunRow): boolean => run.state === 'queued' && run.wakeAt !== undefined

/** One test of the plan of a read of the runs. */
type Where = NonNullable<Plan['where']>

/**
 * The runs of a flow and a key in one file that the tests of the read fit: the read is narrowed in the store,
 * so that a start reads no run that ended long ago.
 */
function ofKey(source: Source, flow: string, key: string | undefined, fit: Where[]): RunRow[] {
  const where = {
    all: [{ col: 'flow', is: flow }, ...(key === undefined ? [] : [{ col: 'key', is: key }]), ...fit],
  }
  return readRunRows(source, where).filter((run) => run.key === key)
}

// The starts that wait for their pace: queued, with the moment each may go.
const waitingStarts: Where[] = [
  { col: 'state', is: 'queued' },
  { col: 'wakeAt', atLeast: new Date(0) },
]

/** How many runs of a flow and a key went in the stretch of time that ends now: a start that waits did not go yet. */
function wentIn(source: Source, flow: string, key: string | undefined, window: Window, now: number): RunRow[] {
  const stretch = [
    { col: 'createdAt', above: new Date(now - window.per) },
    { col: 'createdAt', atMost: new Date(now) },
  ]
  return ofKey(source, flow, key, stretch)
    .filter((run) => !isWaitingStart(run))
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** The start of a flow and a key that waits for its pace, the oldest first, where there is one. */
function waitingStartOf(source: Source, flow: string, key: string | undefined): RunRow | undefined {
  return ofKey(source, flow, key, waitingStarts)
    .filter(isWaitingStart)
    .sort((a, b) => a.createdAt - b.createdAt)[0]
}

/** The events that a start that waits under `batch` has gathered, or nothing for a run of another kind. */
export function batchOf(event: unknown): unknown[] | undefined {
  return isWritten(event) && event.kind === 'batch' && Array.isArray(event.events) ? event.events : undefined
}

/** What becomes of a start of a flow that states `pace`. */
export type Paced =
  | { kind: 'dropped' }
  | { kind: 'into'; run: string }
  | { kind: 'new'; wakeAt?: number; event?: unknown }

/**
 * Takes where the runs of a start are read and written, the start, and the pace of its flow. Answers what becomes
 * of it, in the write it is handed: dropped under `drop`; gathered into the start of its key that waits, under
 * `batch` and `debounce`, which it moves on; or a new run, which waits until `wakeAt` where it has one.
 */
export function pacedStart(
  source: Source,
  start: { flow: string; key?: string; input?: unknown; event?: unknown; now: number },
  pace: PaceOf,
): Paced {
  const { flow, key, now } = start
  if (pace.drop && wentIn(source, flow, key, pace.drop, now).length >= pace.drop.max) return { kind: 'dropped' }
  const handed = start.input === undefined ? {} : { input: start.input }
  if (pace.batch) {
    const { max, wait } = pace.batch
    // A start of no event is gathered as what it was handed.
    const entry = start.event ?? { kind: 'start', ...handed }
    // A batch that is full goes at its moment: the next start begins a batch of its own.
    const waiting = ofKey(source, flow, key, waitingStarts)
      .filter((run) => isWaitingStart(run) && (batchOf(run.event)?.length ?? max) < max)
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    const gathered = waiting ? batchOf(waiting.event) : undefined
    if (waiting && gathered) {
      const events = [...gathered, entry]
      const full = events.length >= max
      inWrite(source, (tx) =>
        changeRun(tx, waiting.id, { ...handed, event: { kind: 'batch', events }, ...(full ? { wakeAt: now } : {}) }),
      )
      return { kind: 'into', run: waiting.id }
    }
    return { kind: 'new', event: { kind: 'batch', events: [entry] }, wakeAt: max <= 1 ? now : now + wait }
  }
  if (pace.debounce !== undefined) {
    const waiting = waitingStartOf(source, flow, key)
    const wakeAt = now + pace.debounce
    if (waiting) {
      inWrite(source, (tx) =>
        changeRun(tx, waiting.id, {
          wakeAt,
          input: start.input === undefined ? null : start.input,
          event: start.event === undefined ? null : start.event,
        }),
      )
      return { kind: 'into', run: waiting.id }
    }
    return { kind: 'new', wakeAt }
  }
  if (pace.perMinute) {
    const went = wentIn(source, flow, key, pace.perMinute, now)
    // A start waits behind the starts of its key that wait already, so that they go in their order.
    const ahead = waitingStartOf(source, flow, key)
    if (went.length >= pace.perMinute.max || ahead)
      return { kind: 'new', wakeAt: Math.max(ahead?.wakeAt ?? now, nextFree(went, pace.perMinute, now)) }
  }
  return { kind: 'new' }
}

/** The moment at which one more run of a count may go: once the oldest of those that went leaves the stretch. */
function nextFree(went: RunRow[], window: Window, now: number): number {
  const oldest = went[went.length - window.max]
  return oldest === undefined ? now : Math.max(now, oldest.createdAt + window.per)
}

/**
 * Takes the write of a start that waited and whose moment came. Answers whether it goes now: where `perMinute`
 * leaves room, it goes, as a run that is added at this moment; and else it waits on, to the moment that one more
 * may go, in the same row.
 */
export function letGo(held: Held, tx: Tx, run: RunRow, pace: PaceOf): boolean {
  const now = held.env.clock.now()
  if (pace.perMinute) {
    const went = wentIn(tx, run.flow, run.key, pace.perMinute, now)
    if (went.length >= pace.perMinute.max) {
      changeRun(tx, run.id, { wakeAt: nextFree(went, pace.perMinute, now) })
      return false
    }
  }
  changeRun(tx, run.id, { wakeAt: null, createdAt: now })
  return true
}

/** The pace of the flow of each run, read once for each flow and version: nothing where it states none. */
function pacesOf(held: Held): (run: RunRow) => { flow: FlowOf; pace: PaceOf } | undefined {
  const read = new Map<string, { flow: FlowOf; pace: PaceOf } | undefined>()
  return (run) => {
    const at = `${run.version}\n${run.flow}`
    if (!read.has(at))
      try {
        const flow = flowOf(held, run.version, run.flow)
        const pace = paceOf(flow)
        read.set(at, pace ? { flow, pace } : undefined)
      } catch {
        // A run whose flow cannot be read is ordered by nothing: its pass fails it with its own error.
        read.set(at, undefined)
      }
    return read.get(at)
  }
}

/** Whether the flow of a run orders the starts that wait by `order` or by `turns`. */
export function ordersTurns(held: Held, run: RunRow): boolean {
  const pace = pacesOf(held)(run)?.pace
  return pace?.order === true || pace?.turns === true
}

/**
 * Takes the starts that wait under one count, and when each key was last let go there. Answers them in the order
 * they go: the higher `order` first; among equals, with `turns`, the key that went longest ago, so one key's
 * backlog never holds the others up; and then the oldest first. Runs whose flows state neither stand as they came.
 */
export function inTurn(held: Held, runs: RunRow[], served: Map<string, number> | undefined): RunRow[] {
  const paced = pacesOf(held)
  if (!runs.some((run) => paced(run)?.pace.order || paced(run)?.pace.turns)) return runs
  const ranked = runs.map((run) => {
    const found = paced(run)
    const arrow = found?.pace.order ? held.env.arrow?.(run.version, run.flow, 'pace.order') : undefined
    let rank = 0
    if (found && arrow) {
      const description = held.env.description(run.version)
      const answered = arrow({ input: inputOf(found.flow.record, run.input), event: eventOf(description, run.event) })
      if (typeof answered === 'number' && Number.isFinite(answered)) rank = answered
    }
    return { run, rank, key: run.key ?? '', turns: found?.pace.turns === true }
  })
  const left = ranked.sort((a, b) => b.rank - a.rank || a.run.createdAt - b.run.createdAt)
  const turns = new Map(served)
  const ordered: RunRow[] = []
  let seq = Math.max(0, ...turns.values())
  while (left.length) {
    const top = left[0].rank
    const equals = left.filter((one) => one.rank === top)
    const pick = equals[0].turns
      ? equals.reduce((best, one) => ((turns.get(one.key) ?? -1) < (turns.get(best.key) ?? -1) ? one : best))
      : equals[0]
    left.splice(left.indexOf(pick), 1)
    seq += 1
    turns.set(pick.key, seq)
    ordered.push(pick.run)
  }
  return ordered
}
