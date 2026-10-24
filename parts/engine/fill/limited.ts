import { summed } from '../counts/book.ts'
import { dayOf } from '../counts/day.ts'
import { gatheredOf } from '../counts/gather.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'

/** A limit of a `by` that holds its column back: its unit, its most, and what the filling used today. */
export interface ColumnHeld {
  unit: string
  limit: number
  used: number
}

/** The caller that what the filling of a group uses is counted under: the starter of its first column. */
const fillCaller = (group: FillGroup): string => {
  const [first] = group.columns
  return first ? `system:fill:${first.table}.${first.column}` : 'system'
}

/**
 * Takes an app and a fill group. Answers the limit of `perDay` of its `by` that the filling of its column reached
 * today, counted under the starter of the column, written and gathered, or nothing where it may go on.
 */
export function columnLimit(o: Opened, group: FillGroup): ColumnHeld | undefined {
  if (!group.perDay) return undefined
  const caller = fillCaller(group)
  const written = summed(o, {
    all: [
      { col: 'day', is: dayOf(o) },
      { col: 'caller', is: caller },
    ],
  })
  const gathered = gatheredOf(o, (one) => one.caller === caller)
  for (const [unit, limit] of Object.entries(group.perDay)) {
    const used = (written[unit] ?? 0) + (gathered[unit] ?? 0)
    if (used >= limit) return { unit, limit, used }
  }
  return undefined
}

/** The start of the next day of `project.zone`, when the limits of the day are counted anew. */
export const nextDay = (o: Opened): number => dayOf(o, dayOf(o).getTime() + 36 * 3_600_000).getTime()

// The groups whose limit was told on each day, by the key of the group: a limit is told once a day.
const told = new WeakMap<object, Map<string, number>>()

/** Raises `work.limit` for a column whose limit begins to hold it back, once a day. */
export function tellLimit(o: Opened, group: FillGroup, held: ColumnHeld): void {
  const day = dayOf(o).getTime()
  const seen = told.get(o.handles) ?? new Map<string, number>()
  told.set(o.handles, seen)
  if (seen.get(group.key) === day) return
  seen.set(group.key, day)
  const [first] = group.columns
  o.raise('work.limit', {
    app: o.app,
    kind: '',
    which: 'column',
    name: first ? `${first.table}.${first.column}` : group.table,
    unit: held.unit,
    limit: held.limit,
    used: held.used,
    reserved: 0,
  })
}
