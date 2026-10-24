import type { Caller } from '../../core/index.ts'
import type { RunView } from '../../flows/index.ts'
import type { RunsReading } from '../ai/working.ts'
import { mayFollow } from './follow.ts'
import type { Opened } from '../opened.ts'
import { wireError } from '../wire.ts'
import { saidOf } from './said.ts'
import { byOfCaller, startedBy } from './words.ts'

const ended = (state: string): boolean => state === 'done' || state === 'failed' || state === 'stopped'

/** The place of a state in the order of `working`: the run that works, the runs that wait, the queue, the last one. */
const placeOf = (state: string): number =>
  state === 'running' ? 0 : state === 'waiting' ? 1 : state === 'queued' ? 2 : 3

/** One run of a flow or of an action as `working` answers it: its steps, what they say, and its end. */
function entryOf(o: Opened, run: RunView): Record<string, unknown> {
  return {
    id: run.id,
    run: run.id,
    state: run.state,
    steps: run.steps.map((step) => ({
      name: step.name,
      repeat: step.repeat,
      state: step.state,
      ...(step.ms === undefined ? {} : { ms: step.ms }),
    })),
    said: saidOf(o, run.id),
    ...(run.state === 'failed' && run.error ? { error: wireError(run.error, o.mode !== 'live').error } : {}),
    ...(run.state === 'done' && run.answer !== undefined ? { answer: run.answer } : {}),
  }
}

/**
 * `working` of a flow, or of an action that is a run, that states `follow`: the caller's runs of it that are not
 * finished, and their latest one that is, in the order of an agent's `working`. With `run`, the entry of that
 * one run, where the caller may follow it, and nothing otherwise.
 */
export function runWorkingOf(
  o: Opened,
  runner: RunsReading,
  flow: string,
  caller: Caller,
  run?: string,
): Record<string, unknown>[] {
  if (run !== undefined) {
    const one = runner.read(run)
    if (!one) return []
    try {
      mayFollow(o, one, caller)
    } catch {
      return []
    }
    return [entryOf(o, one)]
  }
  const by = byOfCaller(caller)
  const mine = runner.find({ flow }).filter((one) => startedBy(one.startedBy, by))
  const open = mine.filter((one) => !ended(one.state)).sort((a, b) => placeOf(a.state) - placeOf(b.state))
  const [latest] = mine.filter((one) => ended(one.state))
  return [...open, ...(latest ? [latest] : [])].map((one) => entryOf(o, one))
}
