import { mark } from '../mark.ts'
import { drawn } from '../word.ts'

/**
 * Answers a number from 0 up to, and not with, 1, which it asks the engine for. Where a definition is being made,
 * or no call is under way, it answers its record.
 */
export function random(): number
export function random(): unknown {
  const drew = drawn('random', [])
  return drew ? drew.value : mark({ random: true })
}
