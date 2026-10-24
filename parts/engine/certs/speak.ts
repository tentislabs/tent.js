// Speaks to a certificate authority by the standard (RFC 8555): the account, the order, the questions of the
// authority, the request for the certificate, and its download. Every request goes out through the fetch it is handed.
import type { GuardedFetch } from '../../connect/index.ts'
import type { Keys } from './signed.ts'
import { keyFingerprint, publicWords, signedBody } from './signed.ts'
import { isStored } from '../../core/internal.ts'

const badNonce = 'urn:ietf:params:acme:error:badNonce'
// The standard asks every request to say who sends it, and an authority may refuse one that does not.
const who = 'tentjs-certs/1'
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What an authority refused, in its own words. */
export class Refused extends Error {
  readonly status: number
  readonly kind: string | undefined
  readonly address: string
  constructor(status: number, problem: { type?: unknown; detail?: unknown }, address: string) {
    super(
      `${status} ${typeof problem.type === 'string' ? problem.type : ''}: ${typeof problem.detail === 'string' ? problem.detail : ''}`,
    )
    this.status = status
    this.kind = typeof problem.type === 'string' ? problem.type : undefined
    this.address = address
  }
}

/** An order of a certificate, as the authority answers it. */
interface Order {
  address: string
  status: string
  authorizations: string[]
  finalize: string
  certificate?: string
  error?: { type?: unknown; detail?: unknown; status?: unknown }
}

/** One question of the authority about a name: its state and the ways it may be answered. */
interface Question {
  status: string
  challenges: {
    type: string
    url: string
    token: string
    error?: { type?: unknown; detail?: unknown; status?: unknown }
  }[]
}

/** What speaks to one authority, with one account's key. */
export interface Speaker {
  // The address of the authority's terms, where it states one.
  terms: string | undefined
  // The fingerprint of the account's key, which every answer to a question carries.
  fingerprint: string
  account(o: { agreed: boolean; known?: string }): Promise<string>
  order(names: string[]): Promise<Order>
  question(address: string): Promise<Question>
  answered(address: string): Promise<void>
  proven(address: string): Promise<Question>
  finish(order: Order, request: Uint8Array): Promise<Order>
  download(address: string): Promise<string>
}

const record = (value: unknown): Record<string, unknown> => (isStored(value) ? value : {})

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** An order read from an answer of the authority. */
function orderOf(address: string, read: unknown): Order {
  const o = record(read)
  return {
    address,
    status: String(o.status),
    authorizations: textsOf(o.authorizations),
    finalize: String(o.finalize),
    ...(typeof o.certificate === 'string' ? { certificate: o.certificate } : {}),
    ...(o.error ? { error: record(o.error) } : {}),
  }
}

/** A question read from an answer of the authority. */
function questionOf(read: unknown): Question {
  const o = record(read)
  return {
    status: String(o.status),
    challenges: (Array.isArray(o.challenges) ? o.challenges : []).map((one) => {
      const c = record(one)
      return {
        type: String(c.type),
        url: String(c.url),
        token: String(c.token),
        ...(c.error ? { error: record(c.error) } : {}),
      }
    }),
  }
}

/**
 * Takes the guarded fetch, the address of the authority's directory, and the account's keys. Answers what speaks
 * to it, once the directory was read. A state that only waits is asked again for at most `waitMs`. No redirect is
 * followed: an authority is spoken to where its address names it, and never on another host it sends on to.
 */
export async function speak(o: { fetch: GuardedFetch; from: string; keys: Keys; waitMs?: number }): Promise<Speaker> {
  const waitMs = o.waitMs ?? 60_000
  const first = await o.fetch(o.from, { headers: { accept: 'application/json', 'user-agent': who }, redirects: 0 })
  if (!first.ok) throw new Refused(first.status, { detail: `the directory at ${o.from} did not answer` }, o.from)
  const directory = record(await first.json())
  const meta = record(directory.meta)
  let nonce: string | undefined
  let account: string | undefined

  const freshNonce = async (): Promise<string> => {
    const address = String(directory.newNonce)
    const answer = await o.fetch(address, { method: 'HEAD', headers: { 'user-agent': who }, redirects: 0 })
    const value = answer.headers.get('replay-nonce')
    if (!value) throw new Refused(answer.status, { detail: 'the authority gave no nonce' }, address)
    return value
  }

  // One signed request. A nonce is good once, and each answer brings the next. An authority may refuse a good
  // nonce at any time: the refusal brings a new one, and the same request is signed again with it.
  const send = async (address: string, payload: object | '', accept?: string): Promise<Response> => {
    for (let tries = 0; ; tries++) {
      const head = {
        nonce: nonce ?? (await freshNonce()),
        url: address,
        ...(account ? { kid: account } : { jwk: publicWords(o.keys.publicKey) }),
      }
      nonce = undefined
      const answer = await o.fetch(address, {
        method: 'POST',
        headers: { 'content-type': 'application/jose+json', 'user-agent': who, ...(accept ? { accept } : {}) },
        body: signedBody(o.keys.privateKey, head, payload),
        redirects: 0,
      })
      nonce = answer.headers.get('replay-nonce') ?? undefined
      if (answer.ok) return answer
      const problem = record(await answer.json().catch(() => ({ detail: 'an answer that is no problem document' })))
      if (problem.type === badNonce && tries < 5) continue
      throw new Refused(answer.status, problem, address)
    }
  }

  // Asks again until the thing has left the states that only wait, as often as the authority's own answer says.
  const until = async (address: string, waiting: string[]): Promise<{ read: unknown }> => {
    const ends = Date.now() + waitMs
    for (;;) {
      const answer = await send(address, '')
      const read: unknown = await answer.json()
      if (!waiting.includes(String(record(read).status))) return { read }
      if (Date.now() > ends)
        throw new Refused(
          0,
          { detail: `${address} was still ${String(record(read).status)} after ${waitMs} ms` },
          address,
        )
      const after = Number(answer.headers.get('retry-after'))
      await pause(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 250)
    }
  }

  return {
    terms: typeof meta.termsOfService === 'string' ? meta.termsOfService : undefined,
    fingerprint: keyFingerprint(o.keys.publicKey),
    async account({ agreed, known }) {
      if (known) {
        account = known
        return known
      }
      const answer = await send(String(directory.newAccount), { termsOfServiceAgreed: agreed })
      const made = answer.headers.get('location')
      if (!made)
        throw new Refused(answer.status, { detail: 'the authority named no account' }, String(directory.newAccount))
      account = made
      return made
    },
    async order(names) {
      const answer = await send(String(directory.newOrder), {
        identifiers: names.map((value) => ({ type: 'dns', value })),
      })
      return orderOf(answer.headers.get('location') ?? '', await answer.json())
    },
    question: async (address) => questionOf(await (await send(address, '')).json()),
    async answered(address) {
      await send(address, {})
    },
    proven: async (address) => questionOf((await until(address, ['pending', 'processing'])).read),
    async finish(order, request) {
      await send(order.finalize, { csr: Buffer.from(request).toString('base64url') })
      return orderOf(order.address, (await until(order.address, ['pending', 'ready', 'processing'])).read)
    },
    download: async (address) => (await send(address, '', 'application/pem-certificate-chain')).text(),
  }
}
