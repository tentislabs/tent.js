import { createHash, createHmac } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'
import { closing } from './projects.ts'

/** A server of the test that speaks the S3 protocol on this computer, with the objects it holds. */
export interface S3StandIn {
  // Where it listens, with its scheme: `http://127.0.0.1:<port>`.
  url: string
  // The key its requests are signed with, as `s3` takes it: the id of the key and its secret, with a colon between.
  key: string
  // Every object, by its bucket and its name: `<bucket>/<name>`.
  objects: Map<string, Uint8Array>
  // Each request it was sent, in order, as `<method> <path>`, and those it refused for their signature.
  asked: string[]
  refused: string[]
  // Where a test sets it: whether a put of these bytes fails for a moment, as a store answers 500 now and then.
  fails?: (bytes: Uint8Array) => boolean
}

const keyId = 'TENTTESTKEY'
const keySecret = 'the-secret-of-the-test-store'
const region = 'us-east-1'

const hex = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')
const hmac = (key: Uint8Array | string, text: string): Buffer => createHmac('sha256', key).update(text).digest()

/** Each byte of a part of a path that is no letter, digit or one of `-._~` written as `%XX`, as the protocol asks. */
const encoded = (part: string): string =>
  [...new TextEncoder().encode(part)]
    .map((byte) =>
      /[A-Za-z0-9\-._~]/.test(String.fromCharCode(byte))
        ? String.fromCharCode(byte)
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('')

/**
 * The signature that a request should carry by the fourth version of the protocol's signing, worked out here on
 * its own from what the request holds, so the store of the framework is held to the protocol and not to itself.
 */
function signatureOf(request: IncomingMessage, signed: string[], date: string, scope: string, body: string): string {
  const url = new URL(request.url ?? '/', 'http://here')
  const path = url.pathname
    .split('/')
    .map((part) => encoded(decodeURIComponent(part)))
    .join('/')
  // An address that carries its signature signs every word of its query but the signature itself.
  const query = [...url.searchParams.entries()]
    .filter(([name]) => name !== 'X-Amz-Signature')
    .map(([name, value]) => `${encoded(name)}=${encoded(value)}`)
    .sort()
    .join('&')
  const headers = signed.map((name) => `${name}:${String(request.headers[name] ?? '').trim()}\n`).join('')
  const canonical = [request.method, path, query, headers, signed.join(';'), body].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, hex(canonical)].join('\n')
  const [day] = scope.split('/')
  const signing = hmac(hmac(hmac(hmac(`AWS4${keySecret}`, day), region), 's3'), 'aws4_request')
  return createHmac('sha256', signing).update(toSign).digest('hex')
}

/**
 * Whether an address that carries its signature in its query, as one the store hands out for a single upload, fits
 * it: of the test's key, not past its time, and signed over the headers it names.
 */
function signedAddress(request: IncomingMessage): boolean {
  const asked = new URL(request.url ?? '/', 'http://here').searchParams
  const [credential, date, expires, headers, signature] = [
    'X-Amz-Credential',
    'X-Amz-Date',
    'X-Amz-Expires',
    'X-Amz-SignedHeaders',
    'X-Amz-Signature',
  ].map((name) => asked.get(name) ?? '')
  if (asked.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' || !/^[0-9a-f]{64}$/.test(signature)) return false
  const [id, ...scope] = credential.split('/')
  if (id !== keyId || !scope.join('/').startsWith(`${date.slice(0, 8)}/${region}/s3/aws4_request`)) return false
  const made = Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'))
  if (!Number.isFinite(made) || Date.now() > made + Number(expires) * 1000) return false
  const signed = headers.split(';')
  if (!signed.includes('host')) return false
  return signatureOf(request, signed, date, scope.join('/'), 'UNSIGNED-PAYLOAD') === signature
}

/** Whether a request carries a signature of the test's key that fits it. */
function signedRight(request: IncomingMessage, bytes: Uint8Array): boolean {
  if (new URL(request.url ?? '/', 'http://here').searchParams.has('X-Amz-Signature')) return signedAddress(request)
  const said = String(request.headers.authorization ?? '')
  const found =
    /^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(said)
  if (!found || found[1] !== keyId) return false
  const scope = found[2]
  const signed = found[3].split(';')
  if (!signed.includes('host') || !signed.includes('x-amz-date') || !signed.includes('x-amz-content-sha256'))
    return false
  const date = String(request.headers['x-amz-date'] ?? '')
  if (!scope.startsWith(`${date.slice(0, 8)}/${region}/s3/aws4_request`)) return false
  const body = String(request.headers['x-amz-content-sha256'] ?? '')
  if (body !== 'UNSIGNED-PAYLOAD' && body !== hex(bytes)) return false
  return signatureOf(request, signed, date, scope, body) === found[4]
}

/** Reads the whole body of a request. */
async function bodyOf(request: IncomingMessage): Promise<Uint8Array> {
  const parts: Buffer[] = []
  for await (const part of request) parts.push(Buffer.from(part))
  return new Uint8Array(Buffer.concat(parts))
}

/** Answers one request: an object is put, read whole or by a range of bytes, asked of, or removed. */
async function answer(held: S3StandIn, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const bytes = await bodyOf(request)
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://here').pathname).slice(1)
  held.asked.push(`${request.method} /${path}`)
  if (!signedRight(request, bytes)) {
    held.refused.push(`${request.method} /${path}`)
    response.writeHead(403, { 'content-type': 'application/xml' })
    response.end('<Error><Code>SignatureDoesNotMatch</Code></Error>')
    return
  }
  const object = held.objects.get(path)
  if (request.method === 'PUT' && held.fails?.(bytes)) {
    response.writeHead(500, { 'content-type': 'application/xml' })
    response.end('<Error><Code>InternalError</Code></Error>')
    return
  }
  if (request.method === 'PUT') {
    held.objects.set(path, bytes)
    response.writeHead(200, { etag: `"${hex(bytes).slice(0, 32)}"` })
    response.end()
    return
  }
  if (request.method === 'DELETE') {
    held.objects.delete(path)
    response.writeHead(204)
    response.end()
    return
  }
  if (!object) {
    response.writeHead(404, { 'content-type': 'application/xml' })
    response.end('<Error><Code>NoSuchKey</Code></Error>')
    return
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(String(request.headers.range ?? ''))
  if (range) {
    const from = Number(range[1])
    const to = range[2] === '' ? object.length - 1 : Math.min(Number(range[2]), object.length - 1)
    response.writeHead(206, {
      'content-length': String(Math.max(0, to - from + 1)),
      'content-range': `bytes ${from}-${to}/${object.length}`,
    })
    response.end(request.method === 'HEAD' ? undefined : object.subarray(from, to + 1))
    return
  }
  response.writeHead(200, { 'content-length': String(object.length) })
  response.end(request.method === 'HEAD' ? undefined : object)
}

/** Starts a server of the test that speaks the S3 protocol, on a free port of this computer. It ends with the test. */
export async function s3StandIn(t: TestContext): Promise<S3StandIn> {
  const held: S3StandIn = { url: '', key: `${keyId}:${keySecret}`, objects: new Map(), asked: [], refused: [] }
  const server = createServer((request, response) => {
    answer(held, request, response).catch((error: unknown) => {
      response.writeHead(500)
      response.end(String(error))
    })
  })
  // The server shares one event loop with the engine, which a test may hold for seconds while it writes: a kept
  // connection closed after its idle time then meets the request that was sent on it, and is reset.
  server.keepAliveTimeout = 0
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  closing(t, () => new Promise<void>((done) => server.close(() => done())))
  const at = server.address()
  held.url = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}`
  return held
}
