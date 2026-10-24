// The byte form in which a certificate request and a certificate are written: a kind, a length, a body.

/** The length of a body: under 128 one byte, and else the count of its bytes with the high bit set, then the bytes. */
function lengthOf(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  for (let left = n; left > 0; left = Math.floor(left / 256)) bytes.unshift(left % 256)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

/** One piece: its kind, its length, and its body, which is the pieces handed in, one after another. */
function piece(kind: number, ...bodies: Uint8Array[]): Buffer {
  const body = Buffer.concat(bodies)
  return Buffer.concat([Buffer.from([kind]), lengthOf(body.length), body])
}

export const list = (...bodies: Uint8Array[]): Buffer => piece(0x30, ...bodies)
export const set = (...bodies: Uint8Array[]): Buffer => piece(0x31, ...bodies)
export const bytes = (body: Uint8Array): Buffer => piece(0x04, body)
export const yes = (): Buffer => piece(0x01, Buffer.from([0xff]))
export const text = (words: string): Buffer => piece(0x0c, Buffer.from(words, 'utf8'))

/** A whole number that is not below zero, from its bytes or from a small number. A set high bit gets a zero in front. */
export function whole(value: number | Uint8Array): Buffer {
  let body = typeof value === 'number' ? Buffer.from([value]) : Buffer.from(value)
  while (body.length > 1 && body[0] === 0 && body[1] < 0x80) body = body.subarray(1)
  if (body[0] >= 0x80) body = Buffer.concat([Buffer.from([0]), body])
  return piece(0x02, body)
}

/** A string of bits that fills whole bytes: the count of unused bits, zero, stands in front. */
export const bits = (body: Uint8Array): Buffer => piece(0x03, Buffer.from([0]), body)

/** A name of the standard, written as its numbers with dots: the first two share a byte, each other is in base 128. */
export function id(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number)
  const body = [first * 40 + second]
  for (const n of rest) {
    const group = [n % 128]
    for (let left = Math.floor(n / 128); left > 0; left = Math.floor(left / 128)) group.unshift(0x80 | (left % 128))
    body.push(...group)
  }
  return piece(0x06, Buffer.from(body))
}

/** A piece of a numbered place: `made` holds further pieces, and one that is not `made` holds the body itself. */
export const place = (n: number, made: boolean, ...bodies: Uint8Array[]): Buffer =>
  piece((made ? 0xa0 : 0x80) | n, ...bodies)

/** A time to the second, in the short form that the standard asks for until the year 2049. */
export function time(date: Date): Buffer {
  const iso = date.toISOString()
  const short = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
  return piece(0x17, Buffer.from(short, 'latin1'))
}

/** The names of the standard that the part writes. */
export const names = {
  extensionRequest: '1.2.840.113549.1.9.14',
  otherNames: '2.5.29.17',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  acmeIdentifier: '1.3.6.1.5.5.7.1.31',
}

/** The other names of a certificate: each name of the web in its ASCII form. */
export const otherNames = (all: string[]): Buffer =>
  list(id(names.otherNames), bytes(list(...all.map((name) => place(2, false, Buffer.from(name, 'latin1'))))))
