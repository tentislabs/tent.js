import { unitsBetween } from '../moved.ts'
import { recorded } from '../word.ts'

/**
 * Takes two moments or two days, and a unit. Answers how many whole units lie from the first to the second, below
 * zero when the second is the earlier one. It answers nothing where either is nothing. Handed a reference it
 * answers its record. Throws T0027 for one of each kind, and for a unit that the kind does not have.
 */
export function between(a: Date | string, b: Date | string, unit: string): number
export function between(...values: unknown[]): unknown {
  return recorded('between', values) ?? unitsBetween(values[0], values[1], values[2])
}
