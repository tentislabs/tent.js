import type { RunView } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { reached } from './limits.ts'
import { isStored } from '../../core/internal.ts'

/** The units of a record, each with its most. */
const unitsOf = (value: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries(isStored(value) ? value : {}).filter((one): one is [string, number] => typeof one[1] === 'number'),
  )

/** What a run used by itself: the sum of each unit of its entries. */
function ownUse(run: RunView): Record<string, number> {
  const sums: Record<string, number> = {}
  for (const entry of run.used)
    for (const [unit, amount] of Object.entries(unitsOf(Reflect.get(Object(entry), 'units'))))
      sums[unit] = (sums[unit] ?? 0) + amount
  return sums
}

/**
 * What a run used, with the runs it called, by unit: the sum of what was booked under it and under every run below
 * it, over all days and all models. This is `used` of a run, as `a.used` and `runs.read` give it.
 */
export function usedOf(o: Opened, run: string): Record<string, number> {
  const runner = o.flows?.runner
  const top = runner?.read(run)
  if (!runner || !top) return {}
  const found = runner.find({ top: top.top })
  const all = Array.isArray(found) ? found : []
  const below = (one: RunView): boolean => {
    for (let at: RunView | undefined = one; at; at = at.parent ? runner.read(at.parent) : undefined)
      if (at.id === run) return true
    return false
  }
  const sums: Record<string, number> = {}
  for (const one of [top, ...all.filter((other) => other.id !== run && below(other))])
    for (const [unit, amount] of Object.entries(ownUse(one))) sums[unit] = (sums[unit] ?? 0) + amount
  return sums
}

/** The `perRun` of the agent of a run, made smaller where the program that started it gave a smaller one. */
function perRunOf(o: Opened, run: RunView): Record<string, number> {
  const flow = Object.hasOwn(o.description.flows, run.flow) ? o.description.flows[run.flow] : undefined
  const stated = unitsOf(Reflect.get(Object(Reflect.get(Object(flow?.agent), 'limits')), 'perRun'))
  const given = unitsOf(Reflect.get(Object(Reflect.get(Object(run.given), 'limits')), 'perRun'))
  for (const [unit, most] of Object.entries(given)) stated[unit] = unit in stated ? Math.min(stated[unit], most) : most
  return stated
}

/**
 * Takes an app, the run a model call is made in or a task is handed out for, and what that task reserves. Holds
 * that run and every run above it to its `perRun`, unit by unit, against what it used with the runs it called, and
 * a unit that the task reserves with that added. Throws T7102, naming the limit and the unit, at one that was
 * reached: what the calls under way used can pass it.
 */
export function runAllowed(o: Opened, run: string, reserve: Record<string, number> = {}): void {
  const runner = o.flows?.runner
  for (let at = runner?.read(run); at; at = at.parent ? runner?.read(at.parent) : undefined) {
    const most = perRunOf(o, at)
    if (!Object.keys(most).length) continue
    const used = usedOf(o, at.id)
    for (const [unit, limit] of Object.entries(most)) {
      // A task that reserves a unit may not be handed out where what it reserves would pass the limit.
      const more = reserve[unit]
      const over = more === undefined ? (used[unit] ?? 0) >= limit : (used[unit] ?? 0) + more > limit
      if (over) throw reached(`The run ${at.id} of ${at.flow}`, 'perRun', unit, limit)
    }
  }
}
