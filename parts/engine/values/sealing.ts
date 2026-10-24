import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

/**
 * Takes a key of 32 bytes, a text, and what the text is bound to. Answers the text encrypted by itself with
 * AES-256-GCM: a start value of 12 random bytes, made anew for every writing, then the encrypted bytes, then the
 * 16 bytes of the check, written together in the base64 that is safe in an address, with no filling. What it is
 * bound to is bound in, so that a value moved to another place does not open.
 */
export function sealText(key: Uint8Array, text: string, bound: string): string {
  const start = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, start)
  cipher.setAAD(Buffer.from(bound, 'utf8'))
  const sealed = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return Buffer.concat([start, sealed, cipher.getAuthTag()]).toString('base64url')
}

/**
 * Takes a key of 32 bytes, a text, and what it is bound to. Answers a keyed fingerprint of the text, HMAC-SHA-256
 * under a key drawn from the key for this one use, in hex: the same text in the same place has the same one, and
 * nothing of the text can be read from it.
 */
export function foundText(key: Uint8Array, text: string, bound: string): string {
  const drawn = createHmac('sha256', key).update('tent.found/1').digest()
  return createHmac('sha256', drawn).update(`${bound}\n${text}`).digest('hex')
}

/**
 * Takes a key, a sealed text, and what it is bound to. Answers the text, or nothing where the sealed text does
 * not open under this key and this bound: it was sealed under another key, moved from another place, or changed.
 */
export function openText(key: Uint8Array, sealed: string, bound: string): string | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(sealed)) return undefined
  const bytes = Buffer.from(sealed, 'base64url')
  // A bit of the last character that no byte uses would let another spelling open: the text is its bytes' one spelling.
  if (bytes.length < 28 || bytes.toString('base64url') !== sealed) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    decipher.setAAD(Buffer.from(bound, 'utf8'))
    decipher.setAuthTag(bytes.subarray(bytes.length - 16))
    return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]).toString('utf8')
  } catch {
    return undefined
  }
}
