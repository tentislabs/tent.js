import { mark } from '../mark.ts'
import { drawn } from '../word.ts'

/**
 * Answers the moment of the call that is under way, which it asks the engine for. Where a definition is being
 * made, or no call is under way, it answers its record.
 */
export function now(): Date
export function now(): unknown {
  const drew = drawn('now', [])
  return drew ? drew.value : mark({ now: true })
}
