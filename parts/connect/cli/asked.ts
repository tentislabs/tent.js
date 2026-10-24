// Asks the app in the wire form: a call, a read, the list of commands, and the upload of a file.
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Reach } from '../env.ts'
import { answerSize, boundedJson, listSize } from './bounded.ts'
import { Unrunnable } from './flags.ts'

// The base of every address the runner asks: the reach that is handed it sends each request where it belongs.
export const base = 'http://localhost'

/** An answer of the app in the wire form. */
export interface Wire {
  ok: boolean
  value?: unknown
  error?: Record<string, unknown>
}

/** Reads an answer of the app in the wire form, up to so many bytes. Throws `Unrunnable` where it is no such form. */
async function wireOf(answer: Response, most: number, what: string): Promise<Wire> {
  const read = await boundedJson(answer, most, `The answer of the app to ${what}`)
  if (!isStored(read) || typeof read.ok !== 'boolean')
    throw new Unrunnable(`The app answered ${what} in no known form.`)
  return { ok: read.ok, value: read.value, ...(isStored(read.error) ? { error: read.error } : {}) }
}

/**
 * Takes how the app is reached, a path, and the body, the lines and the signal of the request. Asks the app, a
 * `GET` with no body and a `POST` of JSON with one, and answers what it answered in the wire form. Throws
 * `Unrunnable` where it answers no such form, or more than the list or an answer may hold.
 */
export async function asked(
  reach: Reach,
  path: string,
  o: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Wire> {
  const answer = await reach.request(
    new Request(`${base}${path}`, {
      method: o.body === undefined ? 'GET' : 'POST',
      headers: { ...(o.body === undefined ? {} : { 'content-type': 'application/json' }), ...o.headers },
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
      ...(o.signal ? { signal: o.signal } : {}),
    }),
  )
  return wireOf(answer, path.startsWith('/_t/cli') ? listSize : answerSize, path.split('?')[0])
}

/**
 * Takes how the app is reached, the bytes of a file, and the name, the function and the field it is sent for.
 * Uploads it to `/_t/files`, and answers what the app answered in the wire form, the id of the file in its value.
 */
export async function sentFile(
  reach: Reach,
  bytes: Uint8Array,
  o: { name: string; for?: string; field?: string },
): Promise<Wire> {
  const query = new URLSearchParams({
    name: o.name,
    ...(o.for === undefined ? {} : { for: o.for }),
    ...(o.field === undefined ? {} : { field: o.field }),
  })
  const answer = await reach.request(
    new Request(`${base}/_t/files?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
      body: new Uint8Array(bytes),
    }),
  )
  return wireOf(answer, answerSize, '/_t/files')
}

/** The id of a file in what the app answered an upload, or nothing where it refused it. */
export const fileIdOf = (answer: Wire): string | undefined => {
  const id: unknown = answer.ok && isStored(answer.value) ? answer.value.id : undefined
  return typeof id === 'string' ? id : undefined
}

/** The error that the app answered, as a `TentError` with its code, its message, its fix and its fields. */
export function wireError(error: Record<string, unknown> | undefined): TentError {
  const told = error ?? {}
  return new TentError(String(told.code ?? 'T0009'), String(told.message ?? 'The app failed.'), {
    ...(typeof told.fix === 'string' ? { fix: told.fix } : {}),
    ...(isStored(told.fields)
      ? { fields: Object.fromEntries(Object.entries(told.fields).map(([k, v]) => [k, String(v)])) }
      : {}),
  })
}
