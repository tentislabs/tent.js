import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { isStored } from '../core/internal.ts'
import { answerOf, saysJson } from './answered.ts'
import type { ConnectEnv } from './env.ts'
import { FileRequest } from './fileBody.ts'
import { answerCaps } from './guardedFetch.ts'
import type { Planned, Stored } from './requestOf.ts'
import { signerRan } from './auth.ts'
import type { Turns } from './turns.ts'
import { waited } from './turns.ts'

/** One call of a service as its tries see it: what is sent, and how its service bounds it. */
export interface Trying {
  name: string
  service: string
  callName: string
  stored: Stored
  call: Stored
  planned: Planned
  // Whether the call carries a once-only key, which makes a second try of it safe.
  once: boolean
  turns: Turns
  caller: Caller
  signal: AbortSignal
  // Renews the token of a connection once, after an answer of 401: nothing where it has no renewal token.
  again?: () => Promise<string | undefined>
  // Told the whole answer before it is filtered through the output: a model over the call reads what it used there.
  seen?: (whole: unknown) => void
}

// The statuses that are tried again by themselves, where a second try is safe.
const retried = [429, 502, 503, 504]

/** The defaults of a service beside the size and the time of its answer: a body of a failure of 16 kB, 3 redirects. */
const defaults = {
  error: 16_384,
  redirects: 3,
  tries: 3,
  wait: 30_000,
  first: 1000,
}

/** How the tries of a service go: how many in all, the longest pause it may ask for, the statuses, the first wait. */
function triesOf(stored: Stored): { max: number; wait: number; on: number[]; first: number } {
  const tries = stored.tries
  if (typeof tries === 'number') return { max: tries, wait: defaults.wait, on: [], first: defaults.first }
  const o = isStored(tries) ? tries : {}
  return {
    max: typeof o.max === 'number' ? o.max : defaults.tries,
    wait: typeof o.wait === 'number' ? o.wait : defaults.wait,
    on: Array.isArray(o.on) ? o.on.filter((one) => typeof one === 'number') : [],
    first: typeof o.first === 'number' ? o.first : defaults.first,
  }
}

/** The pause that an answer asks for, in milliseconds: as seconds or as a date. Nothing for a pause that is past or does not read. */
function askedPause(answer: Response, now: number): number | undefined {
  const line = answer.headers.get('retry-after')?.trim()
  if (!line) return undefined
  if (/^\d+$/.test(line)) return Number(line) * 1000
  const at = Date.parse(line)
  if (Number.isNaN(at) || at <= now) return undefined
  return at - now
}

/** The body of a failed answer, as JSON or as text, up to so many bytes. */
async function failedBody(answer: Response, most: number): Promise<unknown> {
  const bytes = new Uint8Array(await answer.arrayBuffer().catch(() => new ArrayBuffer(0)))
  const text = new TextDecoder().decode(bytes.subarray(0, most))
  if (bytes.length <= most && saysJson(answer))
    try {
      return JSON.parse(text)
    } catch {
      // A body that says it is JSON and is none is kept as its text.
    }
  return text
}

/** T7115: the service answered with a failure, did not answer, or passed its time or its size. */
const serviceFailed = (name: string, words: string, service: { status?: number; body?: unknown }): TentError =>
  new TentError('T7115', `The service call ${name} failed: ${words}`, {
    fix: 'Read `error.service` for what the service answered, and fail with your own `fail` where a status is yours to tell.',
    service,
  })

/** The request of one try: made anew from what was planned, so that its body can be read more than once. */
const requestFor = (planned: Planned, signal: AbortSignal): Request =>
  planned.body === undefined || planned.body instanceof Uint8Array
    ? new Request(planned.url, {
        method: planned.method,
        headers: planned.headers,
        ...(planned.body ? { body: planned.body } : {}),
        signal,
      })
    : new FileRequest(
        planned.url,
        { method: planned.method, headers: new Headers(planned.headers), signal },
        planned.body,
      )

/**
 * Takes what the engine hands `connect` and one call. Makes its tries: each waits its turn, is signed by a signer
 * of the builder's own where the service names one, and is sent through the guarded fetch with the time and the
 * size of its service. A try that got no answer, or one of the statuses that are tried again, is tried again where
 * that is safe, after the pause the service asks for or the waits of its own. Writes one row of the log, and
 * answers what the answer reads as. Throws T7115, T0009 for a signer that fails, and what the guarded fetch refuses.
 */
export async function tried(env: ConnectEnv, c: Trying): Promise<unknown> {
  const { stored, call, planned, signal } = c
  const limits = isStored(stored.limits) ? stored.limits : {}
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)
  const output = isStored(call.output) ? call.output : undefined
  // A file is held to the `maxSize` of its type, and where it states none, to the size of the service, as any answer.
  const size = number(output?.kind === 'file' ? output.maxSize : undefined, number(limits.size, answerCaps.size))
  const time = number(limits.time, answerCaps.time)
  const redirects = number(limits.redirects, defaults.redirects)
  const most = number(limits.error, defaults.error)
  const tries = triesOf(stored)
  const changes = call.changes ?? call.method !== 'GET'
  const safe = changes === false || c.once
  const began = env.now()
  let status: number | undefined
  let renewedOnce = false
  const logged = (): void =>
    env.logged({
      service: c.service,
      call: c.callName,
      ...(status === undefined ? {} : { status }),
      ms: env.now() - began,
    })
  try {
    for (let n = 1; ; n++) {
      const done = await c.turns.take(signal)
      let answer: Response | undefined
      let failure: unknown
      try {
        const request = await signerRan(env, stored, c.service, requestFor(planned, signal), c.caller.user?.id)
        answer = await env.fetch(request, { size, time, redirects, signal })
        if (answer.status < 400) {
          status = answer.status
          return await answerOf(env, c.name, call, answer, c.caller, c.seen)
        }
      } catch (error) {
        if (signal.aborted) throw signal.reason ?? error
        if (error instanceof TentError && error.code !== 'T0023') throw error
        // An answer that is cut while it is read passed its size or its time: it is no answer to try again.
        if (answer && answer.status < 400)
          throw serviceFailed(c.name, String(Reflect.get(Object(error), 'message')), { status: answer.status })
        failure = error
      } finally {
        done()
      }
      status = answer?.status
      // A 401 to the token of a connection renews it once, and the call is tried once more, as no try of its own.
      if (answer?.status === 401 && c.again && !renewedOnce) {
        renewedOnce = true
        const access = await c.again()
        if (access !== undefined) {
          await answer.arrayBuffer().catch(() => undefined)
          planned.headers.set('Authorization', `Bearer ${access}`)
          n--
          continue
        }
      }
      const tryAgain = answer === undefined || retried.includes(answer.status) || tries.on.includes(answer.status)
      const asked = answer ? askedPause(answer, env.now()) : undefined
      const failed = async (words: string): Promise<never> => {
        throw serviceFailed(c.name, words, {
          ...(answer ? { status: answer.status, body: await failedBody(answer, most) } : {}),
        })
      }
      if (!tryAgain || !safe || n >= tries.max) {
        if (answer) return await failed(`it answered ${answer.status}.`)
        return await failed(failure instanceof TentError ? failure.message : 'no answer came.')
      }
      // A pause longer than the service may ask for ends the call at once.
      if (asked !== undefined && asked > tries.wait) return await failed(`it asked for a pause of ${asked} ms.`)
      await answer?.arrayBuffer().catch(() => undefined)
      await waited(env, asked ?? tries.first * 4 ** (n - 1), signal)
    }
  } catch (error) {
    if (error instanceof TentError && error.code === 'T0023')
      throw serviceFailed(c.name, error.message, status === undefined ? {} : { status })
    throw error
  } finally {
    logged()
  }
}
