import { createHash, randomBytes } from 'node:crypto'

/** Takes the text of a proof of a sign-in for programs. Answers the fingerprint the other end is handed of it: its SHA-256 in base64url. */
export const challengeOf = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url')

/**
 * Makes a new proof of a sign-in for programs, as the standard of the code that is exchanged asks: answers its text,
 * 32 random bytes in base64url, and the fingerprint the other end is handed.
 */
export function proofOf(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: challengeOf(verifier) }
}
