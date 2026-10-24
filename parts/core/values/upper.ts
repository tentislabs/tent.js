import { recorded, textOf } from '../word.ts'

/**
 * Takes a text. Answers it in capitals, by no language's own rules. Handed a reference it answers its record.
 * Throws T0027 for a value that is no text.
 */
export function upper(text: string): string
export function upper(...values: unknown[]): unknown {
  return recorded('upper', values) ?? textOf('upper', values[0]).toUpperCase()
}
