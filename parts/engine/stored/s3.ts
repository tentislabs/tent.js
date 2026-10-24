import { createHmac } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { request as overHttp } from 'node:http'
import { request as overHttps } from 'node:https'
import { Writable } from 'node:stream'
import { TentError } from '../../core/index.ts'
import type { FileStore } from '../makers.ts'
import { streamed } from '../web/streamed.ts'
import { fingerprintOf } from '../../core/internal.ts'

/** Where a store of the S3 protocol answers, its bucket, its region, and the key its requests are signed with. */
export interface S3Place {
  url: string
  bucket: string
  region: string
  keyId: string
  keySecret: string
}

const hmac = (key: Uint8Array | string, text: string): Buffer => createHmac('sha256', key).update(text).digest()

/** A part of a path or of a query written as the protocol signs it: each byte but a letter, a digit and `-._~` as `%XX`. */
const encoded = (part: string): string =>
  [...new TextEncoder().encode(part)]
    .map((byte) =>
      /[A-Za-z0-9\-._~]/.test(String.fromCharCode(byte))
        ? String.fromCharCode(byte)
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('')

/**
 * The headers of a request signed by the fourth version of the protocol's signing, with the body unsigned, as the
 * protocol lets every request over it be: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */
function signed(place: S3Place, method: string, url: URL, more: Record<string, string>): Record<string, string> {
  const date = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const day = date.slice(0, 8)
  const headers: Record<string, string> = {
    ...more,
    host: url.host,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': date,
  }
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
  const lowered = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]))
  const path = url.pathname
    .split('/')
    .map((part) => encoded(decodeURIComponent(part)))
    .join('/')
  const query = [...url.searchParams.entries()]
    .map(([name, value]) => `${encoded(name)}=${encoded(value)}`)
    .sort()
    .join('&')
  const canonical = [
    method,
    path,
    query,
    names.map((name) => `${name}:${lowered[name].trim()}\n`).join(''),
    names.join(';'),
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const scope = `${day}/${place.region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', date, scope, fingerprintOf(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${place.keySecret}`, day), place.region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${place.keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  }
}

/**
 * An address of the store that carries its own signature, for one request of `method` to one name, with the
 * headers it must send, for `seconds`: so a browser sends the bytes of one upload straight there, and nothing else.
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */
function signedAddress(
  place: S3Place,
  method: string,
  name: string,
  headers: Record<string, string>,
  seconds: number,
): string {
  const url = new URL(`${place.url.replace(/\/+$/, '')}/${encoded(place.bucket)}/${name}`)
  const date = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const day = date.slice(0, 8)
  const scope = `${day}/${place.region}/s3/aws4_request`
  const lowered: Record<string, string> = { ...headers, host: url.host }
  const names = Object.keys(lowered).sort()
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
  url.searchParams.set('X-Amz-Credential', `${place.keyId}/${scope}`)
  url.searchParams.set('X-Amz-Date', date)
  url.searchParams.set('X-Amz-Expires', String(Math.max(1, Math.min(604_800, Math.round(seconds)))))
  url.searchParams.set('X-Amz-SignedHeaders', names.join(';'))
  const query = [...url.searchParams.entries()]
    .map(([key, value]) => `${encoded(key)}=${encoded(value)}`)
    .sort()
    .join('&')
  const canonical = [
    method,
    url.pathname,
    query,
    names.map((key) => `${key}:${lowered[key].trim()}\n`).join(''),
    names.join(';'),
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, fingerprintOf(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${place.keySecret}`, day), place.region), 's3'), 'aws4_request')
  url.searchParams.set('X-Amz-Signature', createHmac('sha256', key).update(toSign).digest('hex'))
  return url.href
}

// How long a request to the store may say nothing, in milliseconds: the head and body bounds of the runtime's `fetch`.
const idleMs = 300_000

/**
 * Sends one request to the store, with the program's own connection: the store is the engine's, and no call of an
 * app makes the request. Answers the response once its head has come.
 */
function sent(
  place: S3Place,
  method: string,
  fingerprint: string,
  o: { headers?: Record<string, string>; body?: ReadableStream<Uint8Array> } = {},
): Promise<IncomingMessage> {
  const url = new URL(`${place.url.replace(/\/+$/, '')}/${encoded(place.bucket)}/${fingerprint}`)
  const headers = signed(place, method, url, o.headers ?? {})
  const send = url.protocol === 'https:' ? overHttps : overHttp
  return new Promise((done, failed) => {
    const asked = send(url, { method, headers }, done)
    asked.on('error', failed)
    // A store that says nothing for as long as `fetch` waits for a head or the next bytes is given up on: a download
    // or an upload never waits for ever on a store that hangs.
    asked.setTimeout(idleMs, () =>
      asked.destroy(
        new TentError('T0009', `The store of files said nothing for ${idleMs / 1000} seconds.`, {
          fix: 'See that the store answers, and ask again.',
        }),
      ),
    )
    if (o.body) o.body.pipeTo(Writable.toWeb(asked)).catch(failed)
    else asked.end()
  })
}

/** Reads what a response that is no success says, and answers the error of the store. */
async function refusedBy(response: IncomingMessage, what: string): Promise<TentError> {
  const parts: Buffer[] = []
  for await (const part of response) parts.push(Buffer.from(part))
  const said = /<Code>([^<]*)<\/Code>/.exec(Buffer.concat(parts).toString('utf8'))?.[1] ?? ''
  return new TentError('T0009', `The store of files refused ${what}: ${response.statusCode} ${said}`.trim(), {
    fix: 'See that the address, the bucket and the key of the store are right, and that the store answers.',
  })
}

/** Holds a fingerprint to the form the bytes of every store are kept under. */
function held(fingerprint: string): string {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('A file is stored under the fingerprint of its bytes.')
  return fingerprint
}

/**
 * Takes where a store of the S3 protocol answers, with its bucket, its region and its key. Answers a store of
 * files that keeps bytes there under their fingerprint and knows nothing else, as every store does. Bytes go in
 * and out as streams. A read of bytes that are gone fails at its first byte, with T0001, and one that the store
 * refuses with T0009. Every machine reaches it, and it hands out an address for an upload straight to it.
 */
export function s3Store(place: S3Place): FileStore {
  return {
    shared: true,
    async direct(name, info, seconds) {
      return signedAddress(
        place,
        'PUT',
        held(name),
        { 'content-length': String(info.size), 'content-type': info.kind || 'application/octet-stream' },
        seconds,
      )
    },
    async put(fingerprint, bytes, info) {
      const response = await sent(place, 'PUT', held(fingerprint), {
        headers: { 'content-length': String(info.size), 'content-type': info.kind || 'application/octet-stream' },
        body: bytes,
      })
      if (response.statusCode !== 200) throw await refusedBy(response, 'a file')
      response.resume()
    },
    get(fingerprint, range) {
      const asked = range ? { range: `bytes=${range.from}-${range.to ?? ''}` } : undefined
      const answer = sent(place, 'GET', held(fingerprint), asked ? { headers: asked } : {})
      let reading: ReadableStream<Uint8Array> | undefined
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (!reading) {
            const response = await answer
            // A range that starts past the end of the bytes holds none.
            if (response.statusCode === 416) {
              response.resume()
              controller.close()
              return
            }
            if (response.statusCode === 404) {
              response.resume()
              throw new TentError('T0001', `The store of files holds no bytes under ${fingerprint}.`)
            }
            if (response.statusCode !== 200 && response.statusCode !== 206)
              throw await refusedBy(response, `the bytes of ${fingerprint}`)
            reading = streamed(response)
          }
          const reader = reading.getReader()
          const { done, value } = await reader.read()
          reader.releaseLock()
          if (done) controller.close()
          else controller.enqueue(value)
        },
        async cancel() {
          const response = await answer
          response.destroy()
        },
      })
    },
    async remove(fingerprint) {
      const response = await sent(place, 'DELETE', held(fingerprint))
      if (response.statusCode !== 204 && response.statusCode !== 200 && response.statusCode !== 404)
        throw await refusedBy(response, `the removal of ${fingerprint}`)
      response.resume()
    },
  }
}
