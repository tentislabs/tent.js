// The certificate of the proof of a name inside the secure connection (RFC 8737): signed by its own key, it carries
// the name and the fingerprint of the answer to the authority's question, marked as one that must be understood.
import type { KeyObject } from 'node:crypto'
import { createHash, randomBytes, sign } from 'node:crypto'
import { bits, bytes, id, list, names, otherNames, place, set, text, time, whole, yes } from './der.ts'

const pem = (der: Buffer): string =>
  `-----BEGIN CERTIFICATE-----\n${der
    .toString('base64')
    .replace(/(.{64})/g, '$1\n')
    .trimEnd()}\n-----END CERTIFICATE-----\n`

/** The certificate that proves `name`, good for one day, as text in the usual form. */
export function proofCertificate(name: string, answer: string, key: KeyObject, publicKey: KeyObject): string {
  const mark = list(id(names.acmeIdentifier), yes(), bytes(bytes(createHash('sha256').update(answer).digest())))
  const who = list(set(list(id(names.commonName), text('proof of a name'))))
  const how = list(id(names.ecdsaWithSha256))
  const serial = randomBytes(16)
  serial[0] = (serial[0] ?? 0) & 0x7f
  const now = Date.now()
  const held = list(
    place(0, true, whole(2)),
    whole(serial),
    how,
    who,
    // An hour earlier, for an authority whose clock is behind.
    list(time(new Date(now - 3_600_000)), time(new Date(now + 86_400_000))),
    who,
    publicKey.export({ type: 'spki', format: 'der' }),
    place(3, true, list(otherNames([name]), mark)),
  )
  return pem(list(held, how, bits(sign('sha256', held, key))))
}
