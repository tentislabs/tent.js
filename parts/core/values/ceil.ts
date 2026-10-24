import { numberOf, recorded } from '../word.ts'

/** Takes a number. Answers `Math.ceil` of it. Handed a reference it answers its record. Throws T0027 for a value that is no number. */
export function ceil(n: number): number
export function ceil(...values: unknown[]): unknown {
  return recorded('ceil', values) ?? Math.ceil(numberOf('ceil', values[0]))
}
