// The request for a certificate (PKCS #10, RFC 2986), written byte by byte: what is asked for, how it is signed,
// and the signature.
import type { KeyObject } from 'node:crypto'
import { sign } from 'node:crypto'
import { domainToASCII } from 'node:url'
import { bits, id, list, names, otherNames, place, set, whole } from './der.ts'

/** The name as a certificate holds it: lower case and in its ASCII form. Throws for a name that has none, or a star. */
export function asciiName(name: string): string {
  const ascii = domainToASCII(name.toLowerCase())
  if (!ascii || ascii.includes('*')) throw new Error(`${name} is not a name a certificate can be asked for`)
  return ascii
}

/**
 * The request for a certificate over `all`, signed with the private key of the certificate. The subject is empty:
 * an authority of the web reads the names from the other names alone.
 */
export function certificateRequest(all: string[], key: KeyObject, publicKey: KeyObject): Buffer {
  const asked = list(
    whole(0),
    list(),
    // The runtime gives the public key in its own byte form, which is the form the request holds.
    publicKey.export({ type: 'spki', format: 'der' }),
    place(0, true, list(id(names.extensionRequest), set(list(otherNames(all.map(asciiName)))))),
  )
  // The runtime signs with ECDSA in the form a request holds: a list of two whole numbers.
  return list(asked, list(id(names.ecdsaWithSha256)), bits(sign('sha256', asked, key)))
}
