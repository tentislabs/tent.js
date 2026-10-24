import { moved } from '../moved.ts'
import { recorded } from '../word.ts'

/**
 * Takes a moment or a day, and a length of time in words, as `'7 days'`. Answers it moved later by the length, in
 * the kind it was handed: a moment by the length as it is stored, and a day on the calendar. It answers nothing
 * for nothing. Handed a reference it answers its record. Throws T0027 for a length that does not read, and for a
 * unit a day does not have.
 */
export function later<When extends Date | string | undefined>(when: When, length: string): When
export function later(...values: unknown[]): unknown {
  return recorded('later', values) ?? moved('later', values[0], values[1], 1)
}
