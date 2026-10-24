import { createHmac, createPublicKey, verify as verifySigned } from 'node:crypto'
import { sameSecret, TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'

/** T7118: a call coming in whose signature does not hold, or whose time lies too far from now. */
const notVerified = (why: string): TentError =>
  new TentError('T7118', `The call could not be verified: ${why}.`, {
    fix: 'Send the call as the provider signs it, with the secret that the app holds, and a time near now.',
  })

/** Whether two texts of bytes are the same, compared in constant time, and never where either is empty. */
const same = (one: Buffer, other: Buffer): boolean => sameSecret(one.toString('base64'), other.toString('base64'))

/** The one value of a header: two headers of one name are refused, since which one counts is nobody's to say. */
function only(headers: Headers, name: string): string | undefined {
  const value = headers.get(name)
  if (value === null) return undefined
  if (value.includes(', ')) throw notVerified(`the header ${name} stands twice`)
  return value
}

/** A time in seconds as a header writes it, held to the age of a call. */
function heldTime(written: string | undefined, now: number, age: number): number {
  if (written === undefined || !/^\d+$/.test(written)) throw notVerified('the time of the call is no number')
  const at = Number(written) * 1000
  if (Math.abs(now - at) > age) throw notVerified('the time of the call lies too far from now')
  return at
}

/** The scheme of the standard: an entry of HMAC with a secret `whsec_`, or of Ed25519 with a key `whpk_`. */
function standard(headers: Headers, body: Uint8Array, secret: string, o: Held): { id?: string; time?: number } {
  const id = only(headers, 'webhook-id')
  const stamp = only(headers, 'webhook-timestamp')
  const time = heldTime(stamp, o.now, o.age)
  const signed = Buffer.concat([Buffer.from(`${id ?? ''}.${stamp}.`), body])
  const entries = (only(headers, 'webhook-signature') ?? '').split(' ').filter(Boolean).slice(0, o.entries)
  const keyed = secret.startsWith('whpk_')
  const versioned = (version: string): Buffer[] =>
    entries
      .filter((one) => one.startsWith(`${version},`))
      .map((one) => Buffer.from(one.slice(version.length + 1), 'base64'))
  let fits = false
  if (keyed) {
    const raw = Buffer.from(secret.slice(5), 'base64')
    // The raw 32 bytes of a key of Ed25519, with the prefix of its standard form in front.
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
      format: 'der',
      type: 'spki',
    })
    fits = versioned('v1a').some((one) => {
      try {
        return verifySigned(null, signed, key, one)
      } catch {
        return false
      }
    })
  } else {
    const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
    const made = createHmac('sha256', key).update(signed).digest()
    fits = versioned('v1').some((one) => same(one, made))
  }
  if (!fits) throw notVerified('no entry of the signature fits')
  return { ...(id === undefined ? {} : { id }), time }
}

/** The scheme of Stripe: a time and entries of HMAC over the time and the body, with the secret as its text. */
function stripe(headers: Headers, body: Uint8Array, secret: string, o: Held): { id?: string; time?: number } {
  const line = only(headers, 'stripe-signature') ?? ''
  const parts = line.split(',').map((one) => one.trim().split('='))
  const times = parts.filter(([name]) => name === 't').map(([, value]) => value)
  if (times.length !== 1) throw notVerified('the signature names no one time')
  const time = heldTime(times[0], o.now, o.age)
  const made = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${times[0]}.`), body]))
    .digest()
  const entries = parts.filter(([name]) => name === 'v1').slice(0, o.entries)
  if (!entries.some(([, value]) => same(Buffer.from(value ?? '', 'hex'), made))) throw notVerified('no entry fits')
  // The id of a call of Stripe is the `id` of its body: a body with none knows no repeat.
  let id: unknown
  try {
    id = Reflect.get(Object(JSON.parse(new TextDecoder().decode(body))), 'id')
  } catch {
    id = undefined
  }
  return { ...(typeof id === 'string' ? { id } : {}), time }
}

/** A scheme of one header that carries an HMAC of the body: GitHub's, and a record of the builder's own. */
function oneHeader(
  headers: Headers,
  body: Uint8Array,
  secret: string,
  o: { header: string; encoding: 'hex' | 'base64'; prefix: string; id?: string },
): { id?: string } {
  const line = only(headers, o.header)
  if (line === undefined || !line.startsWith(o.prefix)) throw notVerified(`the header ${o.header} is missing`)
  const made = createHmac('sha256', secret).update(body).digest()
  if (!same(Buffer.from(line.slice(o.prefix.length), o.encoding), made)) throw notVerified('the signature does not fit')
  const id = o.id === undefined ? undefined : only(headers, o.id)
  return id === undefined ? {} : { id }
}

/** What a check holds a call to: the moment, how far from it a time may lie, and how many entries are looked at. */
interface Held {
  now: number
  age: number
  entries: number
}

/**
 * Takes the `verify` of a call coming in, its secret, the headers and the exact bytes that arrived, the moment,
 * how far from it the time of a call may lie in either direction, and how many entries of a signature are looked
 * at. Checks the signature over the bytes, in constant time, by the scheme: `'standard'`, `'stripe'`, `'github'` or
 * `{ header, encoding, prefix, id }`. Answers the id of the call where the scheme has one. Throws T7118 where the
 * signature is wrong or missing, or the time lies too far from now. A scheme `{ by }` is the engine's to ask.
 */
export function checkSignature(o: {
  verify: object
  secret: string
  headers: Headers
  body: Uint8Array
  now: number
  age: number
  entries?: number
}): { id?: string } {
  const held: Held = { now: o.now, age: o.age, entries: o.entries ?? 20 }
  const scheme: unknown = Reflect.get(o.verify, 'scheme')
  if (scheme === 'standard') {
    const { id } = standard(o.headers, o.body, o.secret, held)
    return id === undefined ? {} : { id }
  }
  if (scheme === 'stripe') {
    const { id } = stripe(o.headers, o.body, o.secret, held)
    return id === undefined ? {} : { id }
  }
  if (scheme === 'github')
    return oneHeader(o.headers, o.body, o.secret, {
      header: 'x-hub-signature-256',
      encoding: 'hex',
      prefix: 'sha256=',
      id: 'x-github-delivery',
    })
  if (isStored(scheme) && typeof scheme.header === 'string')
    return oneHeader(o.headers, o.body, o.secret, {
      header: scheme.header,
      encoding: scheme.encoding === 'base64' ? 'base64' : 'hex',
      prefix: typeof scheme.prefix === 'string' ? scheme.prefix : '',
      ...(typeof scheme.id === 'string' ? { id: scheme.id } : {}),
    })
  throw notVerified('the scheme is none that the framework checks')
}

/** The name of the header that a scheme carries its signature in, which no flow is handed. */
export function signatureHeader(scheme: unknown): string | undefined {
  if (scheme === 'standard') return 'webhook-signature'
  if (scheme === 'stripe') return 'stripe-signature'
  if (scheme === 'github') return 'x-hub-signature-256'
  return isStored(scheme) && typeof scheme.header === 'string' ? scheme.header.toLowerCase() : undefined
}
