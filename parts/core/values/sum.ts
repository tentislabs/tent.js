import type { Counted, KeptWord } from '../counted.ts'
import { countedWord, isCounted } from '../counted.ts'
import { numbersOf } from '../entries.ts'
import { mark } from '../mark.ts'
import type { Tick } from '../word.ts'
import { recorded } from '../word.ts'

/** `sum` with the `tick` it asks once for each entry. */
export function sumWith(tick: Tick, ...values: unknown[]): unknown {
  if (values.length === 1 && typeof values[0] === 'string') return mark({ sum: values[0] })
  return recorded('sum', values) ?? numbersOf('sum', tick, values[0], values[1]).reduce((all, n) => all + n, 0)
}

/**
 * Takes a list, and the name of a field of each entry where the numbers stand in one. Answers the sum of the
 * numbers, and 0 for an empty list: an entry that holds nothing is passed over. Handed one text and nothing else,
 * it answers what `group` takes for a column. Handed a reference it answers its record. Throws T0027 for an entry
 * that is no number, and for a value that is no list.
 */
export function sum(list: readonly unknown[], field?: string): number
export function sum(column: string): { sum: string }
export function sum(o: Counted): KeptWord
export function sum(...values: unknown[]): unknown {
  // Handed what a kept column reads, it answers the value word that the `from` of that column takes.
  if (values.length === 1 && isCounted(values[0])) return countedWord('sum', values[0])
  return sumWith(undefined, ...values)
}
