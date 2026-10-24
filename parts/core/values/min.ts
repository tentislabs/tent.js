import type { Counted, KeptWord } from '../counted.ts'
import { countedWord, isCounted } from '../counted.ts'
import { extreme } from '../entries.ts'
import { mark } from '../mark.ts'
import type { Tick } from '../word.ts'
import { recorded } from '../word.ts'

/** `min` with the `tick` it asks once for each entry. */
export function minWith(tick: Tick, ...values: unknown[]): unknown {
  if (values.length === 1 && typeof values[0] === 'string') return mark({ min: values[0] })
  return recorded('min', values) ?? extreme('min', tick, values[0], values[1], false)
}

/**
 * Takes a list of numbers, of days or of moments, all of one kind, and the name of a field of each entry where
 * they stand in one. Answers the smallest, in its kind, and nothing for an empty list. Handed one text and nothing
 * else, it answers what `group` takes for a column. Handed a reference it answers its record. Throws T0027 for an
 * entry of another kind, and for a value that is no list.
 */
export function min<Entry>(list: readonly Entry[]): Entry | undefined
export function min(list: readonly unknown[], field: string): unknown
export function min(column: string): { min: string }
export function min(o: Counted): KeptWord
export function min(...values: unknown[]): unknown {
  // Handed what a kept column reads, it answers the value word that the `from` of that column takes.
  if (values.length === 1 && isCounted(values[0])) return countedWord('min', values[0])
  return minWith(undefined, ...values)
}
