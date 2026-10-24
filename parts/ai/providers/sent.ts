import type { Base } from '../face.ts'
import { ProviderFailure } from '../../core/internal.ts'

// An answer of a model may stream for long: it is held to the model's own time, and not to the cap of a fetch.
const longest = 24 * 60 * 60 * 1000

/** The wait a server asks for in `retry-after`, in milliseconds: seconds, or a moment. */
function retryAfterOf(headers: Headers, now: number = Date.now()): number | undefined {
  const said = headers.get('retry-after-ms') ?? undefined
  if (said !== undefined && /^\d+(\.\d+)?$/.test(said)) return Number(said)
  const after = headers.get('retry-after')
  if (after === null) return undefined
  if (/^\d+(\.\d+)?$/.test(after.trim())) return Number(after) * 1000
  const at = Date.parse(after)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

/**
 * The kind of failure of a status, by the table of the providers: 429, and what a server's documents name as too
 * busy, is `busy`; any other status of 500 or more is `server`; any other one of 400 or more is `notAccepted`.
 */
export function kindOfStatus(status: number, busy: readonly number[] = []): 'busy' | 'server' | 'notAccepted' {
  if (status === 429 || busy.includes(status)) return 'busy'
  return status >= 500 ? 'server' : 'notAccepted'
}

/**
 * Takes the request to a provider, the address, what is sent, and the statuses that its server names as too busy
 * beside 429. Sends it through the guarded fetch, and answers the answer of a status below 400. Throws a
 * `ProviderFailure`: `unreachable` where no connection was made, `slow` where the signal ended the call, and the
 * kind of its status otherwise, with the words the server gave and the wait it asked for.
 */
export async function sent(
  o: Base,
  address: string,
  init: RequestInit,
  busy: readonly number[] = [],
): Promise<Response> {
  let answer: Response
  try {
    answer = await o.fetch(address, { ...init, signal: o.signal, time: longest, size: 64 * 1_048_576 })
  } catch (error) {
    if (o.signal.aborted) throw new ProviderFailure('slow', 'The call passed its time.')
    throw new ProviderFailure('unreachable', error instanceof Error ? error.message : String(error))
  }
  if (answer.status < 400) return answer
  const words = (await answer.text().catch(() => '')).slice(0, 2000)
  const retryAfter = retryAfterOf(answer.headers)
  throw new ProviderFailure(
    kindOfStatus(answer.status, busy),
    `The server answered ${answer.status}: ${words}`,
    retryAfter === undefined ? undefined : { retryAfter },
  )
}

/** The body of an answer as JSON, or a `server` failure where it is none. */
export async function jsonOf(answer: Response): Promise<Record<string, unknown>> {
  const text = await answer.text()
  try {
    const read: unknown = JSON.parse(text)
    if (typeof read === 'object' && read !== null && !Array.isArray(read)) return Object(read)
  } catch {
    // Told below, with what came.
  }
  throw new ProviderFailure('server', `The server answered what is no JSON record: ${text.slice(0, 200)}`)
}

/** Reads a number at a dotted path of a value, or nothing where none stands there. */
export function numberAt(value: unknown, path: string): number | undefined {
  let at: unknown = value
  for (const name of path.split('.')) at = typeof at === 'object' && at !== null ? Reflect.get(at, name) : undefined
  return typeof at === 'number' && Number.isFinite(at) ? at : undefined
}

/** The base of the addresses of a provider: the `url` the model states, or the provider's own. */
export function baseOf(model: Record<string, unknown>, own: string): string {
  const url = typeof model.url === 'string' && model.url !== '' ? model.url : own
  return url.replace(/\/+$/, '')
}

/** What a model states in `options`, but `cache`, which is the model layer's: merged into the body of a request. */
export function optionsOf(model: Record<string, unknown>): Record<string, unknown> {
  const options: unknown = model.options
  if (typeof options !== 'object' || options === null || Array.isArray(options)) return {}
  const { cache: _cache, ...rest } = Object(options)
  return rest
}

/** Whether the model leaves out the marks that ask a server to keep the start of a request. */
export const cacheOff = (model: Record<string, unknown>): boolean =>
  Reflect.get(Object(model.options), 'cache') === false

/** Bytes as base64 text. */
export const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

/** A text of JSON as a value, or the text itself where it is no JSON. */
export function parsedOr(text: string): unknown {
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
