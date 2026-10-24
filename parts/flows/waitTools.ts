import { TentError } from '../core/index.ts'
import { never } from './branches.ts'
import { noteWait, noWait } from './eventWaits.ts'
import { asSaved } from './kept.ts'
import { momentOf, msOf } from './lengths.ts'
import type { Pass } from './pass.ts'
import { answered, beganAt, park, reach, saveStep, tellStep } from './pass.ts'
import { isWritten } from '../core/internal.ts'

// How long a wait-for waits where it states no `timeout`: seven days, in milliseconds.
const waitForTime = 604_800_000

/** Holds the end of a wait to the longest wait of its flow: T5103 for one that lies further off. */
function held(pass: Pass, name: string, until: number): number {
  const most = pass.of.limits.wait
  if (until - pass.of.held.env.clock.now() > most)
    throw new TentError('T5103', `The wait ${JSON.stringify(name)} is longer than \`limits.wait\` of ${most} ms.`, {
      fix: 'Wait for less, or raise `limits.wait` of the flow.',
    })
  return until
}

/**
 * `step.wait`: saves the moment the wait ends and leaves the run waiting. On the pass that comes after that
 * moment the wait is done, and the run goes on. Throws T0027 for a time that does not read, and T5103 for a wait
 * that is longer than the flow allows.
 */
export async function waitTool(pass: Pass, time: string | Date, o: { name?: string } = {}): Promise<void> {
  const reached = reach(pass, o.name ?? 'wait')
  if (!reached) return never()
  const { at, branch, row } = reached
  const { clock } = pass.of.held.env
  if (row?.state === 'done') return answered(pass, undefined)
  if (row?.state === 'waiting' && row.wakeAt !== undefined) {
    if (clock.now() < row.wakeAt) return park(pass, branch, row.wakeAt)
    saveStep(pass, at, { state: 'done', wakeAt: null, endedAt: clock.now() })
    tellStep(pass, at, { state: 'done' })
    return answered(pass, undefined)
  }
  const wakeAt = held(pass, reached.name, momentOf(time, clock.now()))
  saveStep(pass, at, { state: 'waiting', startedAt: beganAt(pass), wakeAt })
  tellStep(pass, at, { state: 'waiting' })
  return park(pass, branch, wakeAt)
}

/** What a wait-for answers. */
export interface Waited {
  approved?: boolean
  data?: unknown
  shown?: unknown
  timedOut?: true
}

/** Reads the saved result of a wait-for. */
function waitedOf(result: unknown): Waited {
  const saved = isWritten(result) ? result : {}
  return {
    ...(typeof saved.approved === 'boolean' ? { approved: saved.approved } : {}),
    ...('data' in saved ? { data: saved.data } : {}),
    ...('shown' in saved ? { shown: saved.shown } : {}),
    ...(saved.timedOut === true ? { timedOut: true as const } : {}),
  }
}

/**
 * `step.waitFor`: waits for a person, where it is handed a name, or for an event, where it is handed what
 * `event(...)` gives. The step keeps what it shows, the event with its `where`, and the moment it gives up, and
 * its run waits. It answers what `approve`, `refuse` or the event saved, or `{ timedOut: true }` once its time
 * has passed. Throws T5103 for a time that is longer than the flow allows.
 */
export async function waitForTool(
  pass: Pass,
  what: string | object,
  o: { timeout?: string; show?: unknown; name?: string; where?: object } = {},
): Promise<Waited> {
  const event = typeof what === 'string' ? undefined : String(Reflect.get(what, 'event'))
  const reached = reach(pass, typeof what === 'string' ? what : (o.name ?? event ?? ''))
  if (!reached) return never()
  const { at, branch, row } = reached
  const { held: runner } = pass.of
  const { clock } = runner.env
  if (row?.state === 'done') return answered(pass, waitedOf(row.result))
  if (row?.state === 'waiting' && row.wakeAt !== undefined) {
    if (clock.now() < row.wakeAt) return park(pass, branch, row.wakeAt)
    const timedOut = { timedOut: true as const }
    saveStep(pass, at, {
      state: 'done',
      result: timedOut,
      size: asSaved(timedOut).size,
      ask: null,
      wakeAt: null,
      endedAt: clock.now(),
    })
    if (row.waitsFor?.event !== undefined) noWait(runner, row.waitsFor.event, pass.of.run.id, at)
    tellStep(pass, at, { state: 'done' })
    return answered(pass, timedOut)
  }
  const wakeAt = held(pass, reached.name, clock.now() + (o.timeout === undefined ? waitForTime : msOf(o.timeout)))
  const show = o.show === undefined ? undefined : asSaved(o.show).value
  const waitsFor = event === undefined ? { person: true as const } : { event, ...(o.where ? { where: o.where } : {}) }
  // A wait-for that a driver makes is one that the members of an agent answer.
  const ask = pass.of.drives ? { n: 1 } : undefined
  saveStep(pass, at, {
    state: 'waiting',
    startedAt: beganAt(pass),
    wakeAt,
    waitsFor,
    ...(show === undefined ? {} : { show }),
    ...(ask ? { ask } : {}),
  })
  if (event !== undefined) noteWait(runner, event, pass.of.run.id, at)
  tellStep(pass, at, { state: 'waiting', ...(show === undefined ? {} : { show }), ...(ask ? { ask: 1 } : {}) })
  return park(pass, branch, wakeAt)
}
