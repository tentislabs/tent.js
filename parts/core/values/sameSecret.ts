import { createHash, timingSafeEqual } from 'node:crypto'
import { cannot, recorded } from '../word.ts'

const nothing = (value: unknown): boolean => value === undefined || value === null || value === ''
const printOf = (text: unknown): Buffer =>
  typeof text === 'string' ? createHash('sha256').update(text, 'utf8').digest() : cannot('sameSecret', text, 'a text')

/**
 * Takes two texts. Answers whether they are the same: it compares their fingerprints in constant time, so the time
 * it takes does not tell where they differ. It answers false where either is nothing or empty text. Handed a
 * reference it answers its record. Throws T0027 for anything else that is no text.
 */
export function sameSecret(a: string | undefined, b: string | undefined): boolean
export function sameSecret(...values: unknown[]): unknown {
  const made = recorded('sameSecret', values)
  if (made) return made
  const [a, b] = values
  const [first, second] = [nothing(a) ? undefined : printOf(a), nothing(b) ? undefined : printOf(b)]
  return first !== undefined && second !== undefined && timingSafeEqual(first, second)
}
