import type { IncomingMessage } from 'node:http'
import type { Readable } from 'node:stream'
import { TentError } from '../core/index.ts'
import type { FileBody } from './fileBody.ts'
import { FileRequest } from './fileBody.ts'
import { hostOf } from './forms.ts'
import type { Guard } from './guardedAddress.ts'
import { settled } from './guardedAddress.ts'
import type { Lookup } from './lookup.ts'
import { systemLookup } from './lookup.ts'
import { cutOff, refusedAddress } from './refused.ts'
import { addressOf, shownOf, shownText } from './shown.ts'
import { opened, send } from './send.ts'

/**
 * What `guardedFetch` takes beside what an address is held to. `plain` makes the form that stands in the place of
 * the runtime's own `fetch`: the address rule holds, and neither the secure connection nor a cap. `roots` are
 * certificates, as text in the usual form, that a secure connection is also held to. `bodyTravels` states that a
 * redirect may send the body of a request on to another host, which is refused where it is left out.
 */
export interface FetchGuard extends Guard {
  plain?: true
  roots?: string
  bodyTravels?: true
}

/**
 * The type of the runtime's own `fetch`, with a size, a time and a number of redirects: the most bytes that an
 * answer may open to, the most milliseconds until its end, and how many redirects are followed. Left out, an
 * answer is cut at 10 MB and at 30 seconds, and three redirects are followed.
 */
export type GuardedFetch = (
  address: string | URL | Request,
  init?: RequestInit & { size?: number; time?: number; redirects?: number },
) => Promise<Response>

// How many redirects are followed where who asks states no number: by the guarded form, and by the plain one,
// which follows as many as the runtime's own `fetch` does.
const followed = { guarded: 3, plain: 20 }

/** What an answer is cut at where who asks states nothing, and a service where its `limits` state nothing. */
export const answerCaps = { size: 10 * 1_048_576, time: 30_000 }

// The four headers that are sent on to another host.
const sentOn = ['accept', 'accept-language', 'content-type', 'user-agent']

// The headers that say what a body is, which go where the body goes.
const ofBody = ['content-type', 'content-encoding', 'content-language', 'content-location']

/** Fails as the runtime's own `fetch` fails for what is no refusal of ours, with the failure as its cause. */
const failed = (cause: unknown): unknown =>
  cause instanceof TentError || cause instanceof TypeError ? cause : new TypeError('fetch failed', { cause })

/**
 * Answers the body of an answer as the standard stream that a `Response` holds. `ended` is called once, when the
 * body was read to its end, failed, or was given up by its reader.
 */
function streamOf(body: Readable, ended: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      body.on('data', (piece: Uint8Array) => {
        controller.enqueue(new Uint8Array(piece))
        if ((controller.desiredSize ?? 0) <= 0) body.pause()
      })
      body.once('end', () => {
        ended()
        controller.close()
      })
      body.once('error', (error) => {
        ended()
        controller.error(error)
      })
      body.pause()
    },
    pull() {
      body.resume()
    },
    cancel() {
      ended()
      body.destroy()
    },
  })
}

/**
 * Takes what the fetch is held to, and what looks a name up. Answers the guarded fetch. Each request, and each
 * redirect anew, is held to the address rule before a connection is made, and the connection goes to the address
 * that was looked up.
 */
export function fetchWith(o: FetchGuard, lookup: Lookup): GuardedFetch {
  const plain = o.plain === true
  return async (address, init = {}) => {
    const {
      size = answerCaps.size,
      time = answerCaps.time,
      redirects: most = plain ? followed.plain : followed.guarded,
    } = init
    // A cap that is no number would cap nothing: it is refused before anything is asked.
    for (const [name, stated] of Object.entries({ size, time, redirects: most }))
      if (typeof stated !== 'number' || !(stated >= 0))
        throw new TypeError(`The ${name} that was stated is no number that is not negative.`)
    const { size: _size, time: _time, redirects: _redirects, ...rest } = init
    const written = typeof address === 'string' ? address : address instanceof URL ? address.href : address.url
    // The standard reader takes no address with a zone, so it is told apart before it reads.
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*\[[^\]/?#]*%/i.test(written)) throw refusedAddress(shownText(written), 'private')
    let url = addressOf(written)
    // The standard request takes no address with a name or a password, so it is refused before one is made.
    if (url.username !== '' || url.password !== '') throw refusedAddress(shownOf(url), 'password')
    // A body of files is sent as a stream of its length, and opened anew where it is sent again; any other is held.
    const files = address instanceof FileRequest && rest.body === undefined ? address.files : undefined
    const request =
      files && address instanceof FileRequest
        ? new FileRequest(
            address.url,
            {
              method: rest.method ?? address.method,
              headers: new Headers(rest.headers ?? address.headers),
              signal: rest.signal ?? address.signal,
              redirect: rest.redirect ?? address.redirect,
            },
            files,
          )
        : new Request(address, rest)
    let method = request.method
    let headers = new Headers(request.headers)
    let body: Uint8Array | FileBody | undefined =
      files ?? (request.body === null ? undefined : new Uint8Array(await request.arrayBuffer()))

    // One end for the whole fetch: the caller's own signal, or the time of the answer, whichever comes first.
    const ending = new AbortController()
    const left = (): void => ending.abort(request.signal.reason)
    if (request.signal.aborted) left()
    else request.signal.addEventListener('abort', left, { once: true })
    const first = shownOf(url)
    // A time with no end is no timer: the runtime's own would end at once.
    const timed = !plain && Number.isFinite(time)
    const timer = timed ? setTimeout(() => ending.abort(cutOff(first, 'time', time)), time) : undefined
    // An answer that nobody reads to its end keeps no program running until its time.
    timer?.unref()
    const over = (): void => {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', left)
    }
    /** Waits for a piece of work, or for the end of the fetch, whichever comes first. */
    const within = <Got>(work: Promise<Got>): Promise<Got> =>
      new Promise<Got>((resolve, reject) => {
        const end = (): void => reject(ending.signal.reason)
        if (ending.signal.aborted) return end()
        ending.signal.addEventListener('abort', end, { once: true })
        work.then(resolve, reject).finally(() => ending.signal.removeEventListener('abort', end))
      })

    try {
      for (let redirects = 0; ; redirects++) {
        const shown = shownOf(url)
        if (url.username !== '' || url.password !== '') throw refusedAddress(shown, 'password')
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          if (plain) throw new TypeError(`${url.protocol} is no scheme that a connection is made by.`)
          throw refusedAddress(shown, 'secure')
        }
        const host = hostOf(url.hostname)
        if (!host) throw new TypeError(`${url.hostname} is no host.`)
        const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port)
        const asked = { ...host, port, shown, ...(plain ? {} : { secure: url.protocol === 'https:' }) }
        const addresses = await within(settled(asked, o, lookup))
        const answer: IncomingMessage = await send({
          url,
          addresses,
          method,
          headers,
          ...(body ? { body } : {}),
          ...(o.roots === undefined ? {} : { roots: o.roots }),
          signal: ending.signal,
        })
        const status = answer.statusCode ?? 0
        const to = answer.headers.location
        if (![301, 302, 303, 307, 308].includes(status) || to === undefined || request.redirect === 'manual') {
          const answered = new Headers()
          for (let k = 0; k + 1 < answer.rawHeaders.length; k += 2)
            answered.append(answer.rawHeaders[k] ?? '', answer.rawHeaders[k + 1] ?? '')
          const empty = method === 'HEAD' || [101, 204, 205, 304].includes(status)
          if (empty) {
            answer.resume()
            over()
          }
          // From its head on, the end of the fetch ends the body, and its reader is told the reason.
          const cut = (): void => void answer.destroy(ending.signal.reason)
          if (!empty) ending.signal.addEventListener('abort', cut, { once: true })
          const stream = empty
            ? null
            : streamOf(
                opened(answer, plain ? undefined : size, () => cutOff(shown, 'size', size)),
                () => {
                  ending.signal.removeEventListener('abort', cut)
                  over()
                },
              )
          const response = new Response(stream, { status, statusText: answer.statusMessage ?? '', headers: answered })
          Object.defineProperty(response, 'url', { value: url.href })
          Object.defineProperty(response, 'redirected', { value: redirects > 0 })
          return response
        }

        answer.destroy()
        if (request.redirect === 'error') throw new TypeError(`${shown} answered a redirect, and none is followed.`)
        if (redirects >= most) throw refusedAddress(shown, 'redirects')
        const next = addressOf(to, url)
        if (next.hash === '') next.hash = url.hash
        if (next.origin !== url.origin) {
          // A sign-in in a header of any name stays with the host it was written for.
          const kept = new Headers()
          for (const name of sentOn) {
            const value = headers.get(name)
            if (value !== null) kept.set(name, value)
          }
          headers = kept
        }
        if ((status === 303 && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')) {
          method = 'GET'
          body = undefined
          for (const name of ofBody) headers.delete(name)
        }
        // A body may hold a sign-in as a header does: it stays with the host it was sent to.
        if (body && next.origin !== url.origin && o.bodyTravels !== true) throw refusedAddress(shownOf(next), 'body')
        url = next
      }
    } catch (error) {
      over()
      // What ended the fetch is told as it is: the caller's own reason, or the cut.
      throw ending.signal.aborted && error === ending.signal.reason ? error : failed(error)
    }
  }
}

/**
 * Makes the one function that every outgoing request of the framework's own parts passes. Takes what it is held
 * to: `privateHosts` of the project, the mode, `plain` for the form that the engine puts in the place of the
 * runtime's own `fetch`, `roots`, and `bodyTravels`. The fetch it answers throws
 * T0022 for an address that is refused, and T0023 for an answer that passed its size or its time.
 */
export const guardedFetch = (o: FetchGuard): GuardedFetch => fetchWith(o, systemLookup)
