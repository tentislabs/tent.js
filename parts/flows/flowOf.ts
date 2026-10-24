import { TentError } from '../core/index.ts'
import { limitDefaults, isWritten } from '../core/internal.ts'
import type { Driver } from './face.ts'
import type { Held } from './held.ts'
import type { Limits } from './pass.ts'

/** What the runner reads of the record of a flow, in one version of the app. */
export interface FlowOf {
  record: Record<string, unknown>
  // `flow`, the kind that a driver runs, or `action` for the run that the engine makes for an action.
  kind: string
  driver?: Driver
  limits: Limits
  tries: { max: number; wait: number }
  as: 'system' | 'starter'
  // How long a step of it waits for the yes of a person, in milliseconds.
  askTime: number
}

// The first wait between two tries of a step, in milliseconds, and how often a step is tried in all.
const firstWait = 5000
const triedInAll = 4

/** How often a step is tried in all, and the first wait between two tries, where nothing states otherwise. */
export const triesLeftOut = { max: triedInAll, wait: firstWait }

// How long a step waits for the yes of a person where its agent states no time: seven days.
const askedFor = 604_800_000

const numberOf = (value: unknown, unless: number): number => (typeof value === 'number' ? value : unless)

/**
 * Takes a version of the app and the name of a flow. Answers what the runner reads of its record: its kind, the
 * driver of that kind where one was given, its limits, its tries and whose rights a run of it has. An action
 * stands for the run that the engine makes for it. Throws T0001 for a name that is neither.
 */
export function flowOf(held: Held, version: string, name: string): FlowOf {
  const description = held.env.description(version)
  const flow = Object.hasOwn(description.flows, name) ? description.flows[name] : undefined
  const action = Object.hasOwn(description.functions, name) ? description.functions[name] : undefined
  const record = flow ?? action
  if (!record)
    throw new TentError('T0001', `The version ${version} holds no flow named ${JSON.stringify(name).slice(0, 80)}.`, {
      fix: 'Start a flow of the app by its name: `tent map` lists them.',
    })
  const kind = flow ? ([...held.drivers.keys()].find((one) => record[one] !== undefined) ?? 'flow') : 'action'
  const driven = held.drivers.get(kind)
  const own = isWritten(record[kind]) ? Object(record[kind]) : {}
  // Of the limits that a driven record states for itself, `steps`, `time`, `wait` and `pass` are its driver's own
  // to hold, in their own sense: the runner holds such a run to the limits of a flow for them. `result` is the most
  // one step saves, in the runner's sense, so the runner holds every step of the run to it.
  const { steps: _, wait: __, time: ___, pass: ____, ...ownLimits } = isWritten(own.limits) ? own.limits : {}
  const stated: Record<string, unknown> = { ...(isWritten(record.limits) ? record.limits : {}), ...ownLimits }
  const defaults = limitDefaults.flow
  const tries = isWritten(record.tries) ? record.tries : { max: record.tries }
  return {
    record,
    kind,
    ...(driven ? { driver: driven.driver } : {}),
    limits: {
      steps: numberOf(stated.steps, defaults.steps),
      time: numberOf(stated.time, defaults.time),
      result: numberOf(stated.result, defaults.result),
      wait: numberOf(stated.wait, defaults.wait),
      pass: numberOf(stated.pass, defaults.pass),
      stepTime: numberOf(stated.stepTime, defaults.stepTime),
    },
    // The tries of a flow do not hold for a run that a driver runs: its driver says how often its steps are tried.
    tries: driven
      ? { max: driven.tries ?? triedInAll, wait: firstWait }
      : { max: numberOf(tries.max, triedInAll), wait: numberOf(tries.wait, firstWait) },
    // A run that a driver runs has the rights of its starter, always.
    as: record.as === 'starter' || kind !== 'flow' ? 'starter' : 'system',
    askTime: numberOf(stated.ask, askedFor),
  }
}
