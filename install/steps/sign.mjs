// Signing with the release keys: a signed file has its signatures in a file beside it, `<name>.sig`, one line for
// each key that signed (`41-install.md`, section 4).
import { createHash, createPrivateKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

/** The standard base64 of bytes as the safe form of an address, which a key of the runtime is written in. */
const safe = (text) => Buffer.from(text, 'base64').toString('base64url')

/** The first 16 characters of the fingerprint of a public key, which a line of a signature starts with. */
export const keyPrint = (publicKey) => createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 16)

/** Reads a key file of a maker, `{ format: 'tent.maker/1', name, public, private }`. Throws for a file of another form. */
export function keyFile(file) {
  const read = JSON.parse(readFileSync(file, 'utf8'))
  if (read.format !== 'tent.maker/1' || typeof read.public !== 'string' || typeof read.private !== 'string')
    throw new Error(`${file} is no key: a key is { "format": "tent.maker/1", "name", "public", "private" }`)
  return read
}

/** Signs the exact bytes of a file with each key, and writes `<file>.sig` beside it. */
export function signFile(file, keys) {
  const bytes = readFileSync(file)
  const lines = keys.map((key) => {
    const own = createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: safe(key.private), x: safe(key.public) }, format: 'jwk' })
    return `${keyPrint(key.public)} ${sign(null, bytes, own).toString('base64')}\n`
  })
  writeFileSync(`${file}.sig`, lines.join(''))
}

/** The fingerprint of bytes, as every list of a release writes it: SHA-256 in hex. */
export const printOf = (bytes) => createHash('sha256').update(bytes).digest('hex')
