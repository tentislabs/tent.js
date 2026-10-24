import { recorded, textOf } from '../word.ts'

/**
 * Takes a text. Answers it without the white space at its two ends. Handed a reference it answers its record.
 * Throws T0027 for a value that is no text.
 */
export function trim(text: string): string
export function trim(...values: unknown[]): unknown {
  return recorded('trim', values) ?? textOf('trim', values[0]).trim()
}
