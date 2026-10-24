import { numbersOf } from '../entries.ts'
import { mark } from '../mark.ts'
import type { Tick } from '../word.ts'
import { recorded } from '../word.ts'

/** `avg` with the `tick` it asks once for each entry. */
export function avgWith(tick: Tick, ...values: unknown[]): unknown {
  if (values.length === 1 && typeof values[0] === 'string') return mark({ avg: values[0] })
  const made = recorded('avg', values)
  if (made) return made
  const numbers = numbersOf('avg', tick, values[0], values[1])
  return numbers.length ? numbers.reduce((all, n) => all + n, 0) / numbers.length : undefined
}

/**
 * Takes a list, and the name of a field of each entry where the numbers stand in one. Answers the mean of the
 * numbers, and nothing for an empty list: an entry that holds nothing is passed over and not counted. Handed one
 * text and nothing else, it answers what `group` takes for a column. Handed a reference it answers its record.
 * Throws T0027 for an entry that is no number, and for a value that is no list.
 */
export function avg(list: readonly unknown[], field?: string): number | undefined
export function avg(column: string): { avg: string }
export function avg(...values: unknown[]): unknown {
  return avgWith(undefined, ...values)
}
