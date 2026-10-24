import type { Caller, Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { coreVersion, isStored } from '../core/internal.ts'
import { isType, shapeOf } from './callInput.ts'
import type { ConnectEnv } from './env.ts'
import type { FileBody, Piece } from './fileBody.ts'
import { bodyOf } from './fileBody.ts'
import type { Part } from './inParts.ts'
import { inParts } from './inParts.ts'
import { pairsOf, unset } from './written.ts'

/**
 * A request of a service call as it is made once and sent at each try: its address, method, headers and body, its
 * bytes where it holds no file, and a body opened anew at each sending where it does.
 */
export interface Planned {
  url: URL
  method: string
  headers: Headers
  body?: Uint8Array<ArrayBuffer> | FileBody
}

/** The record of a service, and of one of its calls, as the description stores them. */
export type Stored = Record<string, unknown>

/** A value of an auth or of a line of the headers: a literal, or a secret, which is opened here. */
export function valueOf(env: ConnectEnv, written: unknown): string {
  if (isStored(written) && typeof written.secret === 'string') return env.secret(written.secret)
  return String(written ?? '')
}

// A dot or two dots alone, also with percent signs, is read as a step of the path by every reader of an address
// (the URL standard, "single-dot path segment"; RFC 3986, section 6.2.2.2): no writing keeps it one part.
const dotsAlone = /^(?:\.|%2e){1,2}$/i

/** A value written as one part of the address: with percent signs, and T0002 for one that would be a step of the path. */
function partOf(call: string, field: string, text: string): string {
  if (dotsAlone.test(text))
    throw new TentError('T0002', `The input of ${call} does not fit: ${field} is a dot or two dots alone.`, {
      fields: { [field]: 'is a dot or two dots alone, which an address reads as a step of its path' },
      fix: 'Give a value that holds more than dots, or send it in the body or after the question mark.',
    })
  return encodeURIComponent(text)
}

/** The bytes of a stream, read to its end. */
async function bytesOf(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * A file of the input as a piece of a body, for the caller: the rule of a download holds first (T2104 otherwise),
 * and its bytes are opened only when they are sent.
 */
function filePiece(env: ConnectEnv, id: unknown, caller: Caller): { name: string; kind: string; bytes: Piece } {
  const info = env.files.info(String(id), caller)
  return {
    name: info.name,
    kind: info.kind,
    bytes: { size: info.size, open: () => env.files.stream(String(id), caller) },
  }
}

/** A file of the input, read whole for the caller, to be written into a body of JSON: the rule of a download holds first. */
async function fileOf(
  env: ConnectEnv,
  id: unknown,
  caller: Caller,
): Promise<{ name: string; kind: string; bytes: Uint8Array<ArrayBuffer> }> {
  const info = env.files.info(String(id), caller)
  const bytes = await bytesOf(await env.files.stream(String(id), caller))
  return { name: info.name, kind: info.kind, bytes }
}

/** A value inside a body of JSON, with each file written as base64 where the call says so, and T1014 otherwise. */
async function inJson(
  env: ConnectEnv,
  name: string,
  type: Type,
  value: unknown,
  o: { files: unknown; caller: Caller },
): Promise<unknown> {
  if (type.kind === 'file') {
    if (o.files !== 'base64')
      throw new TentError('T1014', `The file ${name} cannot be written into a body of JSON.`, {
        fix: "State `files: 'base64'` on the call, or send the file in a body in parts, `body: 'files'`.",
      })
    return Buffer.from((await fileOf(env, value, o.caller)).bytes).toString('base64')
  }
  if (type.kind === 'list' && Array.isArray(value))
    return Promise.all(value.map((one) => inJson(env, name, type.of, one, o)))
  if (type.kind === 'object' && isStored(value)) {
    const made: Record<string, unknown> = {}
    for (const [field, inner] of Object.entries(type.shape))
      if (!unset(inner, value[field])) made[field] = await inJson(env, `${name}.${field}`, inner, value[field], o)
    return made
  }
  return value
}

/**
 * Takes what the engine hands `connect`, the name of the service, its record and the record of the call, the
 * checked input, and the caller. Answers the request: each field of the path written into it as one part, each
 * field of the address after the question mark, each that `headers` names as that header, and every field that is
 * left as the body; the lines of the service, and those a request carries by itself. A file is read for the caller.
 */
export async function requestOf(
  env: ConnectEnv,
  service: string,
  stored: Stored,
  callName: string,
  call: Stored,
  input: Record<string, unknown>,
  caller: Caller,
): Promise<Planned> {
  const name = `${service}.${callName}`
  const method = String(call.method ?? 'GET')
  const fields = shapeOf(call.input).shape
  const taken = new Set<string>()
  // The address of the service may name a field of the input, as a host of each customer's own, or a setting.
  const base = String(stored.url ?? '').replace(/\{([^}]+)\}/g, (_, field: string) => {
    if (Object.hasOwn(fields, field)) {
      taken.add(field)
      return partOf(name, field, String(input[field] ?? ''))
    }
    return partOf(name, field, String(env.setting?.(field) ?? ''))
  })
  const path = String(call.path ?? '').replace(/\{([^}]+)\}/g, (_, field: string) => {
    taken.add(field)
    const type = fields[field]
    const [[, text] = ['', '']] = type ? pairsOf(name, field, type, input[field], 'path') : []
    return partOf(name, field, text)
  })
  const url = new URL(base.replace(/\/$/, '') + path)
  const lists = call.lists === 'brackets' || call.lists === 'comma' ? call.lists : 'repeat'
  const queried = Array.isArray(call.query) ? call.query.map(String) : []
  const bodiless = method === 'GET' || method === 'DELETE' || method === 'HEAD'
  for (const [field, type] of Object.entries(fields))
    if (!taken.has(field) && (bodiless || queried.includes(field))) {
      taken.add(field)
      for (const [key, text] of pairsOf(name, field, type, input[field], 'query', lists))
        url.searchParams.append(key, text)
    }
  const headers = new Headers()
  if (isStored(call.headers))
    for (const [header, field] of Object.entries(call.headers)) {
      taken.add(String(field))
      const type = fields[String(field)]
      const [[, text] = ['', undefined]] = type
        ? pairsOf(name, String(field), type, input[String(field)], 'header')
        : []
      if (text !== undefined) headers.set(header, text)
    }
  const left = Object.entries(fields).filter(([field]) => !taken.has(field))
  let body: Uint8Array<ArrayBuffer> | FileBody | undefined
  let type: string | undefined
  const shape = call.body
  if (isStored(shape)) {
    const field = String(shape.text ?? shape.bytes ?? '')
    if (shape.bytes !== undefined) body = bodyOf([filePiece(env, input[field], caller).bytes])
    else if (input[field] !== undefined) body = new TextEncoder().encode(String(input[field]))
    type = typeof shape.type === 'string' && shape.type !== '' ? shape.type : undefined
  } else if (!bodiless) {
    if (shape === 'form') {
      const form = new URLSearchParams()
      for (const [field, one] of left)
        for (const [key, text] of pairsOf(name, field, one, input[field], 'form')) form.append(key, text)
      body = new TextEncoder().encode(form.toString())
      type = 'application/x-www-form-urlencoded'
    } else if (shape === 'files') {
      const parts: Part[] = []
      for (const [field, one] of left) {
        const value = input[field]
        if (unset(one, value)) continue
        if (one.kind === 'file') parts.push({ name: field, file: filePiece(env, value, caller) })
        else if (one.kind === 'list' && Array.isArray(value))
          for (const entry of value)
            parts.push(
              one.of.kind === 'file'
                ? { name: field, file: filePiece(env, entry, caller) }
                : { name: field, text: typeof entry === 'string' ? entry : JSON.stringify(entry) },
            )
        else if (one.kind === 'object' || one.kind === 'json') parts.push({ name: field, text: JSON.stringify(value) })
        else parts.push({ name: field, text: String(value) })
      }
      const made = inParts(parts)
      body = bodyOf(made.pieces)
      type = made.type
    } else {
      const made: Record<string, unknown> = {}
      for (const [field, one] of left)
        if (!unset(one, input[field]))
          made[field] = await inJson(env, field, one, input[field], { files: call.files, caller })
      body = new TextEncoder().encode(JSON.stringify(made))
      type = 'application/json'
    }
  }
  const lines = new Headers()
  if (type) lines.set('Content-Type', type)
  if (!(isType(call.output) && call.output.kind === 'file')) lines.set('Accept', 'application/json')
  lines.set('User-Agent', `tentjs/${coreVersion}`)
  if (isStored(stored.headers))
    for (const [header, value] of Object.entries(stored.headers)) lines.set(header, valueOf(env, value))
  for (const [header, value] of headers) lines.set(header, value)
  return { url, method, headers: lines, ...(body ? { body } : {}) }
}
