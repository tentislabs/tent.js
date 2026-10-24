import { numberOf, recorded } from '../word.ts'

/** Takes a number. Answers `Math.floor` of it. Handed a reference it answers its record. Throws T0027 for a value that is no number. */
export function floor(n: number): number
export function floor(...values: unknown[]): unknown {
  return recorded('floor', values) ?? Math.floor(numberOf('floor', values[0]))
}
