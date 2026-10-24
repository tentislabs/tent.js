import type { Plan } from '../core/internal.ts'
import { isPlan, isStored } from '../core/internal.ts'

/** A filter as a plan stores it. */
export type Filter = NonNullable<Plan['where']>

/** What answers a value of a plan that is no literal. */
export type Resolve = (ref: object) => unknown

/**
 * Takes a stored value and what answers its references. Answers the value it stands for: a literal as it is, a
 * list entry by entry, an object the author wrote with each of its values, and anything else as `resolve` answers.
 */
export function workedValue(stored: unknown, resolve: Resolve): unknown {
  if (Array.isArray(stored)) return stored.map((entry) => workedValue(entry, resolve))
  if (!isStored(stored) || stored instanceof Date) return stored
  if (Array.isArray(stored.object))
    return Object.fromEntries(
      stored.object.map((entry: unknown[]) => [String(entry[0]), workedValue(entry[1], resolve)]),
    )
  return resolve(stored)
}

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

/**
 * Takes a stored filter, what answers its references, and what makes a plan inside it ready to be read. Answers the
 * filter with every value worked out. An entry written with `given` is left out while its value is nothing, empty
 * text or an empty list, and so is a join all of whose entries are left out: nothing is answered for those.
 */
export function workedFilter(filter: Filter, resolve: Resolve, inner: (plan: Plan) => unknown): Filter | undefined {
  const each = (filters: Filter[]) =>
    filters.map((one) => workedFilter(one, resolve, inner)).filter((one): one is Filter => one !== undefined)
  if ('any' in filter && Array.isArray(filter.any)) {
    const kept = each(filter.any)
    return kept.length || !filter.any.length ? { any: kept } : undefined
  }
  if ('all' in filter && Array.isArray(filter.all)) {
    const kept = each(filter.all)
    return kept.length || !filter.all.length ? { all: kept } : undefined
  }
  if (!('col' in filter)) {
    const kept = 'not' in filter ? workedFilter(filter.not, resolve, inner) : undefined
    return kept ? { not: kept } : undefined
  }
  const worked: Filter = { col: filter.col }
  for (const [operator, stored] of Object.entries(filter)) {
    if (operator === 'col' || operator === 'given') continue
    const value = isPlan(stored) ? inner(stored) : workedValue(stored, resolve)
    if (filter.given === true && isEmpty(value)) return undefined
    worked[operator] = value
  }
  return worked
}

/** Answers each column that a filter names, a column through a link as it is written. */
export function columnsIn(filter: Filter, found: string[] = []): string[] {
  if ('any' in filter && Array.isArray(filter.any)) for (const one of filter.any) columnsIn(one, found)
  else if ('all' in filter && Array.isArray(filter.all)) for (const one of filter.all) columnsIn(one, found)
  else if ('col' in filter) found.push(filter.col)
  else if ('not' in filter) columnsIn(filter.not, found)
  return found
}
