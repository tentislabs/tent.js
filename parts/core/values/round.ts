import { numberOf, recorded } from '../word.ts'

/**
 * Takes a number, and how many digits are kept after the point, 0 where none is given. Answers the number rounded
 * as `Math.round` rounds. Handed a reference it answers its record. Throws T0027 for a value that is no number.
 */
export function round(n: number, digits?: number): number
export function round(...values: unknown[]): unknown {
  const made = recorded('round', values)
  if (made) return made
  const scale = 10 ** (values[1] === undefined ? 0 : numberOf('round', values[1]))
  return Math.round(numberOf('round', values[0]) * scale) / scale
}
