import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fingerprintOf } from '../../core/internal.ts'

// A key as it is sent: `tent_`, the id of its row, an underscore, and 32 random bytes in base64 for an address.
const form = /^tent_([0-9a-hjkmnp-tv-z]{26})_([A-Za-z0-9_-]{43})$/

// What the door compares against for an id that names no key, so that such an id takes the time of a wrong key.
const none = Buffer.alloc(32)

/** The fingerprint that the data keeps of a key: of its 32 random bytes, and never the bytes. */
const keyPrint = (random: string): string => fingerprintOf(Buffer.from(random, 'base64url'))

/** A new key for the row of an id: the key itself, and the fingerprint that is kept of it. */
export function newApiKey(id: string): { key: string; fingerprint: string } {
  const random = randomBytes(32).toString('base64url')
  return { key: `tent_${id}_${random}`, fingerprint: keyPrint(random) }
}

/**
 * The id and the random part of a key that is written in its form, or nothing for any other text. A token of a
 * program has the same form, and is read by it too.
 */
export function readKey(written: string): { id: string; random: string } | undefined {
  const found = form.exec(written)
  // The last character carries two bits that 32 bytes leave unused: only the spelling whose unused bits are 0 is the key.
  if (!found || Buffer.from(found[2], 'base64url').toString('base64url') !== found[2]) return undefined
  return { id: found[1], random: found[2] }
}

/**
 * Whether the random part of a key fits the fingerprint that is kept: compared in constant time, and against a
 * fixed fingerprint where no row is, so that the time does not tell an id of no key from a wrong key.
 */
export function fits(random: string, kept: string | undefined): boolean {
  const made = Buffer.from(keyPrint(random), 'hex')
  const held = kept !== undefined && /^[0-9a-f]{64}$/.test(kept) ? Buffer.from(kept, 'hex') : none
  return timingSafeEqual(made, held) && kept !== undefined
}

/** The key that a request sends: in `Authorization: Bearer`, and nowhere else. */
export function sentKey(request: Request): { id: string; random: string } | undefined {
  const line = request.headers.get('authorization')
  if (line === null || !line.startsWith('Bearer ')) return undefined
  return readKey(line.slice('Bearer '.length).trim())
}
