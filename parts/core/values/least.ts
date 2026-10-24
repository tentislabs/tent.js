import { extreme } from '../entries.ts'
import { recorded } from '../word.ts'

/**
 * Takes two or more values: numbers, or days, or moments, all of one kind. Answers the smallest. Handed a
 * reference it answers its record. Throws T0027 for a value of another kind.
 */
export function least<Value>(a: Value, b: Value, ...more: Value[]): Value
export function least(...values: unknown[]): unknown {
  return recorded('least', values) ?? extreme('least', undefined, values, undefined, false)
}
