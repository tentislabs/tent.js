import type { FlowOf } from './flowOf.ts'
import type { AtWork, Held } from './held.ts'
import { fileKey, fileOf } from './places.ts'
import { isWritten } from '../core/internal.ts'

// How many runs of one flow work at the same time where the flow states no count.
const atOnce = 10

/** What `together` of a flow says. */
export interface TogetherOf {
  // How many of its runs may work at once, for each key where they have one.
  max: number
  // The name under which the runs of several flows are counted together.
  group?: string
  then: 'wait' | 'refuse' | 'stop' | 'join'
}

const thens = ['refuse', 'stop', 'join'] as const

/** What `together` of a flow says: how many of its runs may work at once, counted by what, and what becomes of a start over that. */
export function togetherOf(flow: FlowOf): TogetherOf | undefined {
  const stated = isWritten(flow.record.together) ? flow.record.together : undefined
  // A run that a driver runs is held to a count only where its record states one.
  if (flow.driver && !stated) return undefined
  return {
    max: typeof stated?.max === 'number' ? stated.max : atOnce,
    ...(typeof stated?.group === 'string' ? { group: stated.group } : {}),
    then: thens.find((one) => one === stated?.then) ?? 'wait',
  }
}

/** A run as it is counted: its flow, its key and its input, and its id where it has one yet, which names its file. */
export interface Counted {
  id?: string
  flow: string
  key?: string
  input?: unknown
  file?: string
  given?: object
  parent?: string
  parentStep?: { name: string; repeat: number }
}

/** The count of a run of a `step.many` that states `atOnce`, which holds in place of `together` of its flow. */
function manyAtOnce(run: Counted): number | undefined {
  const stated: unknown = run.given ? Reflect.get(run.given, 'atOnce') : undefined
  return typeof stated === 'number' && run.parent !== undefined ? stated : undefined
}

/** The file of a run as one text, since the runs of each file are counted apart. */
const fileText = (run: Counted): string => run.file ?? fileKey(run.id === undefined ? undefined : fileOf(run.id))

/**
 * What the runs of a flow are counted under, and wait their turn under: the flow, or the group of flows it names,
 * the file, and the key of the run where the flow states one. Nothing for a run that is held to no count.
 */
export function countedAs(run: Counted, flow: FlowOf): string | undefined {
  if (manyAtOnce(run) !== undefined) return `many\n${run.parent}\n${run.parentStep?.name}\n${run.parentStep?.repeat}`
  const together = togetherOf(flow)
  if (!together) return undefined
  const by = together.group === undefined ? `flow\n${run.flow}` : `group\n${together.group}`
  // Counted per key where the flow states one, and an agent by its thread; a table trigger's row is no such key.
  const perKey = flow.record.key !== undefined || flow.driver !== undefined
  const apart = run.key === undefined || !perKey ? '' : `\n${JSON.stringify(run.key)}`
  return `${by}\n${fileText(run)}${apart}`
}

/** Whether as many runs work now as may work at once beside this one, so that one more waits its turn. */
export function isFull(held: Held, run: Counted, flow: FlowOf): boolean {
  const key = countedAs(run, flow)
  return key !== undefined && (held.working.get(key) ?? 0) >= (manyAtOnce(run) ?? togetherOf(flow)?.max ?? atOnce)
}

/** Counts a run among those that work beside it. */
export function countIn(held: Held, work: AtWork, run: Counted, flow: FlowOf): void {
  const key = countedAs(run, flow)
  if (key === undefined || work.counted !== undefined) return
  work.counted = key
  held.working.set(key, (held.working.get(key) ?? 0) + 1)
}

/** Counts a run no more among those that work: it has ended, waits, or waits for a run it called. */
export function countOut(held: Held, work: AtWork): void {
  const counted = work.counted
  if (counted === undefined) return
  const left = (held.working.get(counted) ?? 1) - 1
  if (left > 0) held.working.set(counted, left)
  else held.working.delete(counted)
  delete work.counted
  // One run fewer works: the run that waited longest for its turn under the same count is taken up.
  held.freed(counted)
}

/** Counts a run again under what it was counted under before it waited for a run it called. */
export function countAgain(held: Held, work: AtWork, key: string | undefined): void {
  if (key === undefined || work.counted !== undefined) return
  work.counted = key
  held.working.set(key, (held.working.get(key) ?? 0) + 1)
}

/** The run that has worked longest among those that a new run of this flow is counted with, or nothing. */
export function oldestBeside(held: Held, run: Counted, flow: FlowOf): string | undefined {
  const key = countedAs(run, flow)
  for (const [id, work] of held.atWork) if (key !== undefined && work.counted === key) return id
  return undefined
}
