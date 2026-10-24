// The signed body of every request to an authority (RFC 7515, as RFC 8555 asks), and the fingerprint of the
// account's key (RFC 7638) that every answer to a question of the authority carries.
import type { KeyObject } from 'node:crypto'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'

/** A pair of keys: the private one, which never leaves the folder, and the public one. */
export interface Keys {
  privateKey: KeyObject
  publicKey: KeyObject
}

const url64 = (value: string | Uint8Array): string => Buffer.from(value).toString('base64url')

/** A new key on the curve P-256: the kind used for the account and for each certificate. */
export const newCertKey = (): Keys => generateKeyPairSync('ec', { namedCurve: 'P-256' })

/** A private key as text in the usual form. */
export const certKeyText = (key: KeyObject): string => String(key.export({ type: 'pkcs8', format: 'pem' }))

/** A pair of keys from the text of its private key. */
export function certKeysOf(text: string): Keys {
  const privateKey = createPrivateKey(text)
  return { privateKey, publicKey: createPublicKey(privateKey) }
}

/** The public key as the authority reads it: only these four, and the fingerprint is taken over them in this order. */
export function publicWords(publicKey: KeyObject): { crv: string; kty: string; x: string; y: string } {
  const { crv, kty, x, y } = publicKey.export({ format: 'jwk' })
  return { crv: String(crv), kty: String(kty), x: String(x), y: String(y) }
}

/** The fingerprint of an account's key. */
export const keyFingerprint = (publicKey: KeyObject): string =>
  createHash('sha256')
    .update(JSON.stringify(publicWords(publicKey)))
    .digest('base64url')

/**
 * The body of a request: `head` says the key or the account, the nonce and the address; `payload` is what is asked,
 * and an empty text where the request only reads. The signature is the two numbers side by side, not as a list.
 */
export function signedBody(key: KeyObject, head: Record<string, unknown>, payload: object | ''): string {
  const first = url64(JSON.stringify({ alg: 'ES256', ...head }))
  const second = payload === '' ? '' : url64(JSON.stringify(payload))
  const signature = sign('sha256', Buffer.from(`${first}.${second}`), { key, dsaEncoding: 'ieee-p1363' })
  return JSON.stringify({ protected: first, payload: second, signature: url64(signature) })
}
