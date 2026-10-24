import type { Counted, KeptWord } from '../counted.ts'
import { countedWord, isCounted } from '../counted.ts'
import { extreme } from '../entries.ts'
import { mark } from '../mark.ts'
import type { Tick } from '../word.ts'
import { recorded } from '../word.ts'

/** `max` with the `tick` it asks once for each entry. */
export function maxWith(tick: Tick, ...values: unknown[]): unknown {
  if (values.length === 1 && typeof values[0] === 'string') return mark({ max: values[0] })
  return recorded('max', values) ?? extreme('max', tick, values[0], values[1], true)
}

/**
 * Takes a list of numbers, of days or of moments, all of one kind, and the name of a field of each entry where
 * they stand in one. Answers the largest, in its kind, and nothing for an empty list. Handed one text and nothing
 * else, it answers what `group` takes for a column. Handed a reference it answers its record. Throws T0027 for an
 * entry of another kind, and for a value that is no list.
 */
export function max<Entry>(list: readonly Entry[]): Entry | undefined
export function max(list: readonly unknown[], field: string): unknown
export function max(column: string): { max: string }
export function max(o: Counted): KeptWord
export function max(...values: unknown[]): unknown {
  // Handed what a kept column reads, it answers the value word that the `from` of that column takes.
  if (values.length === 1 && isCounted(values[0])) return countedWord('max', values[0])
  return maxWith(undefined, ...values)
}
