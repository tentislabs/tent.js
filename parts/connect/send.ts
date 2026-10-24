import type { IncomingMessage } from 'node:http'
import { request as plainRequest } from 'node:http'
import { request as secureRequest } from 'node:https'
import { isIP } from 'node:net'
import { pipeline, Readable, Transform } from 'node:stream'
import { rootCertificates } from 'node:tls'
import type { FileBody } from './fileBody.ts'
import { createBrotliDecompress, createGunzip, createInflate, createZstdDecompress } from 'node:zlib'

/** One request as it is sent: where to, to which addresses of that host in their order, and what it carries. */
export interface Sending {
  url: URL
  addresses: readonly string[]
  method: string
  headers: Headers
  // Bytes held in memory, or a body of files that is opened anew for each address it is sent to.
  body?: Uint8Array | FileBody
  // Certificates, as text in the usual form, that a secure connection is held to beside those of the runtime.
  roots?: string
  // Ends the request, with its reason, at any moment before the answer has its head.
  signal: AbortSignal
}

// What the sender never says itself: each of these is written here, from what is sent.
const ours = ['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade']

/** Marks a failure that came before any connection stood, so that the next address of the host may be tried. */
class Unreached extends Error {}

/** Sends a request to one address, and answers the answer once its head is there. */
function sendTo(o: Sending, address: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const secure = o.url.protocol === 'https:'
    const headers: Record<string, string> = { accept: '*/*', 'accept-language': '*', 'user-agent': 'node' }
    for (const [name, value] of o.headers) if (!ours.includes(name)) headers[name] = value
    headers['accept-encoding'] ??= 'gzip, deflate, br'
    headers.host = o.url.host
    headers.connection = 'close'
    if (o.body || !['GET', 'HEAD'].includes(o.method)) headers['content-length'] = String(o.body?.length ?? 0)
    const { body } = o
    const name = o.url.hostname
    const sent = (secure ? secureRequest : plainRequest)({
      // The address that was checked, and no name: the runtime looks nothing up, so nothing can answer otherwise.
      host: address,
      family: address.includes(':') ? 6 : 4,
      port: o.url.port === '' ? (secure ? 443 : 80) : Number(o.url.port),
      method: o.method,
      path: `${o.url.pathname}${o.url.search}`,
      headers,
      setHost: false,
      // One connection for one request: a connection is never handed from one guard to another.
      agent: false,
      // The certificate is held to the name that was asked for, while the connection goes to the address.
      ...(secure && isIP(name.replace(/^\[|\]$/g, '')) === 0 ? { servername: name } : {}),
      ...(secure && o.roots !== undefined ? { ca: [...rootCertificates, o.roots] } : {}),
    })
    let connected = false
    sent.once('socket', (socket) =>
      socket.once(secure ? 'secureConnect' : 'connect', () => {
        connected = true
      }),
    )
    const end = (): void => void sent.destroy(o.signal.reason)
    const done = (): void => o.signal.removeEventListener('abort', end)
    sent.once('response', (answer) => {
      done()
      resolve(answer)
    })
    sent.once('error', (error) => {
      done()
      reject(o.signal.aborted ? o.signal.reason : connected ? error : new Unreached(error.message, { cause: error }))
    })
    if (o.signal.aborted) return end()
    o.signal.addEventListener('abort', end, { once: true })
    if (body === undefined || body instanceof Uint8Array) sent.end(body)
    // A file that fails while it is read ends the request with its failure.
    else pipeline(Readable.from(body.open()), sent, (error) => (error ? sent.destroy(error) : undefined))
  })
}

/**
 * Sends a request to the first address of its host that a connection can be made to, and answers the answer once
 * its head is there. The promise is refused with the reason of the signal where that ended it, and otherwise
 * with the failure of the connection.
 */
export async function send(o: Sending): Promise<IncomingMessage> {
  let last: unknown = new Error(`No address of ${o.url.hostname} was handed over.`)
  for (const address of o.addresses)
    try {
      return await sendTo(o, address)
    } catch (error) {
      if (!(error instanceof Unreached)) throw error
      last = error.cause
    }
  throw last
}

/** Answers what opens one packing of an answer by its name, or nothing for a name that is not known. */
function opener(packing: string): Transform | undefined {
  if (packing === 'gzip' || packing === 'x-gzip') return createGunzip()
  if (packing === 'deflate') return createInflate()
  if (packing === 'br') return createBrotliDecompress()
  if (packing === 'zstd') return createZstdDecompress()
  return undefined
}

/**
 * Takes an answer, the most bytes its body may open to, where it is capped, and what makes the error of a body
 * that passed it. Answers the bytes of the body as they are opened, each packing that the answer names taken off,
 * and counted after that, so that a packed answer cannot pass its cap. An answer whose packing is not known is
 * handed on as it came.
 */
export function opened(answer: IncomingMessage, size: number | undefined, tooLarge: () => Error): Readable {
  const named = String(answer.headers['content-encoding'] ?? '').toLowerCase()
  const packings = named.split(',').flatMap((one) => (one.trim() === '' ? [] : [one.trim()]))
  // Each packing that is opened holds memory of its own, so an answer may not name them without end.
  if (packings.length > 5) {
    answer.destroy()
    throw new Error(`The answer names ${packings.length} packings, and no more than five are opened.`)
  }
  const openers = packings.map(opener)
  const steps: Transform[] = []
  // The packing that was put on last is taken off first.
  if (openers.every((one) => one !== undefined)) for (const one of openers.reverse()) if (one) steps.push(one)
  if (size !== undefined) {
    let seen = 0
    steps.push(
      new Transform({
        transform(piece: Uint8Array, _encoding, next) {
          seen += piece.length
          next(seen > size ? tooLarge() : null, piece)
        },
      }),
    )
  }
  const last = steps.at(-1)
  if (!last) return answer
  // What fails one of them ends all of them, and whoever reads the last is told why.
  pipeline([answer, ...steps], () => undefined)
  return last
}
