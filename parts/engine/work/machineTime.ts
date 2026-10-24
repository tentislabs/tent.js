import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Tx } from '../../data/index.ts'
import type { Ended, StepAt } from '../../flows/index.ts'
import type { Booked } from '../counts/book.ts'
import { book } from '../counts/book.ts'
import { dayOf } from '../counts/day.ts'
import { gather, ownWrite } from '../counts/gather.ts'
import { callerOfBy } from '../flows/words.ts'
import { failureOf } from '../door/failure.ts'
import type { Opened } from '../opened.ts'

import { batchOf } from './batches.ts'
import { leftTask } from './shares.ts'
import type { Joined, OutTask } from './state.ts'

/** What the runner says of one entry of a task, in the write that settles its try. */
export interface Settled {
  task: string
  run: string
  step: StepAt
  entry: number
  entries: number
  end: Ended
  // Whether the run lives in the shared file, which holds the counts: one of a tenant's file is booked right after.
  shared: boolean
}

/** Whether a kind is counted for the app as a whole, with the caller empty: one that states `countBy: 'app'`. */
function kindForApp(o: Opened, kind: string): boolean {
  const workers: unknown = o.description.project.workers
  return Reflect.get(Object(Reflect.get(Object(workers), kind)), 'countBy') === 'app'
}

/** The caller of a count as its column keeps one, and the user it is, or nothing where callers are not counted. */
/** Carries work out once the write under way has ended: what it throws is written into the log of errors. */
const later = (o: Opened, work: () => void): void =>
  queueMicrotask(() => {
    try {
      work()
    } catch (error) {
      failureOf(o, 'the machine time of a task', error)
    }
  })

const whoOf = (caller: Caller | undefined): { caller: string; user?: string } =>
  caller ? { caller: callerText(caller), ...(caller.user ? { user: caller.user.id } : {}) } : { caller: '' }

/** The starter of a run, as what it caused is counted by: nobody where that caller is gone. */
function starterOf(o: Opened, run: string): Caller | undefined {
  const row = o.flows?.runner.read(run)
  try {
    return row ? callerOfBy(o, row.startedBy) : undefined
  } catch {
    return undefined
  }
}

/** The caller that the machine time of a run on a kind is counted under, as the counts keep it: none for a kind counted for the app. */
export const machineCountedAs = (o: Opened, kind: string, run: string): { caller: string; user?: string } =>
  whoOf(kindForApp(o, kind) ? undefined : starterOf(o, run))

/** The part of a task that one entry is: one for a task of one step, and for a batch its share by `measure`, or evenly. */
function partOf(o: Opened, out: OutTask, entry: number): number {
  if (out.steps.length < 2) return 1
  const first = out.steps[0]
  const flow = first ? (o.flows?.runner.read(first.run)?.flow ?? '') : ''
  const stated = batchOf(o, flow)
  const weights = out.steps.map((one) => stated?.counted(o.flows?.runner.read(one.run)?.input) ?? 1)
  const sum = weights.reduce((all, one) => all + one, 0)
  return sum > 0 ? (weights[entry] ?? 0) / sum : 1 / out.steps.length
}

/**
 * Takes an app, the open write that settles the try of one entry of a task, and what the runner says of it. Books
 * the share of the seconds its worker held it as `workSeconds`, under the definition of its run, its kind and the
 * starter of the run, and a lost try's as `lostSeconds` beside them, with the `cpuMs` its worker reported, to the
 * day in which the try ends: in this write where the run lives in the shared file, and right after it otherwise.
 * The run's `used` holds them too.
 */
export function bookTry(o: Opened, tx: Tx, s: Settled): void {
  const out = leftTask(o, s.task, s.entry >= s.entries - 1)
  const run = o.flows?.runner.read(s.run)
  if (!out || !run) return
  const part = partOf(o, out, s.entry)
  const seconds = ((out.heldMs ?? 0) * part) / 1000
  // A try that was handed back, or lost in silence, was paid for and gave nothing: it is lost, as the runner counts it.
  const lost = 'lost' in s.end && s.end.lost !== 'writer'
  const units: Record<string, number> = {
    workSeconds: seconds,
    ...(lost ? { lostSeconds: seconds } : {}),
    ...(out.cpuMs ? { cpuMs: out.cpuMs * part } : {}),
  }
  const day = dayOf(o)
  const who = machineCountedAs(o, out.kind, s.run)
  const amounts: Booked[] = Object.entries(units)
    .filter(([, amount]) => amount > 0)
    .map(([unit, amount]) => ({ day, name: run.flow, answeredBy: out.kind, ...who, unit, amount }))
  if (!amounts.length) return
  if (s.shared) book(o, tx, amounts)
  else later(o, () => ownWrite(o, () => o.store.write((shared) => book(o, shared, amounts))))
  // The use of a run is its own row's, written once this write has ended.
  later(o, () => o.flows?.runner.used(s.run, { day: day.toISOString(), name: run.flow, answeredBy: out.kind, units }))
}

/**
 * Takes an app, a worker and a span in which it held no task. Gathers it under the worker's first kind, with no
 * name and no caller: as `idleSeconds` where it could be handed work, and as `loadSeconds` where it could not yet,
 * having said `ready` for no version. A worker whose link is gone stands for nothing.
 */
export function freeTime(o: Opened, j: Joined, ms: number): void {
  if (!j.joined || ms <= 0) return
  const unit = j.ready.size ? 'idleSeconds' : 'loadSeconds'
  gather(o, '', { [unit]: ms / 1000 }, { answeredBy: j.kinds[0] ?? 'any', limits: true, by: 'app' })
}
