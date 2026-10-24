import { recorded, textOf } from '../word.ts'

/**
 * Takes a text. Answers it in small letters, by no language's own rules. Handed a reference it answers its record.
 * Throws T0027 for a value that is no text.
 */
export function lower(text: string): string
export function lower(...values: unknown[]): unknown {
  return recorded('lower', values) ?? textOf('lower', values[0]).toLowerCase()
}
