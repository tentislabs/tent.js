import type { Counted, KeptWord } from '../counted.ts'
import { countedWord, isCounted } from '../counted.ts'
import { mark } from '../mark.ts'

/**
 * Answers what `group` takes for the number of rows of each group. Handed what a kept column reads - the table of
 * the rows, the link column of theirs that points at the row, and a filter - it answers the value word that the
 * `from` of a column takes, which the engine keeps as the count of those rows.
 */
export function count(): { count: true }
export function count(o: Counted): KeptWord
export function count(o?: Counted): unknown {
  if (isCounted(o)) return countedWord('count', o)
  return mark({ count: true })
}
