import { extreme } from '../entries.ts'
import { recorded } from '../word.ts'

/**
 * Takes two or more values: numbers, or days, or moments, all of one kind. Answers the largest. Handed a
 * reference it answers its record. Throws T0027 for a value of another kind.
 */
export function most<Value>(a: Value, b: Value, ...more: Value[]): Value
export function most(...values: unknown[]): unknown {
  return recorded('most', values) ?? extreme('most', undefined, values, undefined, true)
}
