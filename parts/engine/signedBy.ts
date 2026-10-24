import { createPublicKey, verify } from 'node:crypto'
import { fingerprintOf } from '../core/internal.ts'

/** The first 16 characters of the fingerprint of a public key, which a line of a signature starts with. */
const keyPrint = (publicKey: string): string => fingerprintOf(Buffer.from(publicKey, 'base64')).slice(0, 16)

/** A public key of 32 bytes, written in the standard base64, as the runtime takes it; nothing for one of another form. */
function keyOf(publicKey: string) {
  const raw = Buffer.from(publicKey, 'base64')
  if (raw.length !== 32) return undefined
  try {
    return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' })
  } catch {
    return undefined
  }
}

/**
 * Takes the exact bytes of a file, the text of its signatures - one line for each key that signed, the first 16
 * characters of that key's fingerprint, a space and the Ed25519 signature in the standard base64 - and the public
 * keys that are trusted. Answers whether one line was made by one of those keys over those bytes. This is the one
 * home of checking a signed file: a release and a list.
 */
export function signedBy(bytes: Uint8Array, signatures: string, keys: string[]): boolean {
  const byPrint = new Map(keys.map((one) => [keyPrint(one), one]))
  for (const line of signatures.split(/\r?\n/)) {
    const found = /^([0-9a-f]{16}) ([A-Za-z0-9+/]+={0,2})$/.exec(line.trim())
    if (!found) continue
    const publicKey = byPrint.get(found[1])
    const key = publicKey === undefined ? undefined : keyOf(publicKey)
    if (!key) continue
    const signature = Buffer.from(found[2], 'base64')
    if (signature.length !== 64) continue
    if (verify(null, bytes, key, signature)) return true
  }
  return false
}
