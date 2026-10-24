import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'

/** Where a field of the input of a call is written, with the words that name it. */
const places = {
  path: 'the path',
  query: 'the address after the question mark',
  header: 'a header',
  form: 'a form body',
  json: 'a body of JSON',
  files: 'a body in parts',
}

type Place = keyof typeof places

// The kinds of a single value, which every place writes as text.
const single = ['text', 'choice', 'link', 'day', 'number', 'boolean', 'date']

const isSingle = (type: Stored): boolean => single.includes(String(type.kind))

/** Whether a stored type can be written at a place, by the table of how a value of a call is written. */
function writable(type: Stored, place: Place, files: unknown): boolean {
  const of = isStored(type.of) ? type.of : {}
  const shape = isStored(type.shape) ? Object.values(type.shape).filter(isStored) : []
  if (place === 'files' || isSingle(type)) return true
  if (place === 'json') {
    if (type.kind === 'file') return files === 'base64'
    if (type.kind === 'list') return writable(of, place, files)
    return type.kind !== 'object' || shape.every((inner) => writable(inner, place, files))
  }
  if (type.kind === 'list') return place !== 'path' && isSingle(of)
  return (
    (place === 'query' || place === 'form') &&
    type.kind === 'object' &&
    shape.every((inner) => writable(inner, 'form', files))
  )
}

/** The names in curly brackets of an address. */
const namedIn = (address: unknown): string[] =>
  [...String(address ?? '').matchAll(/\{([^}]+)\}/g)].map((found) => found[1])

/**
 * Takes the stored record of a call and the address of its service. Answers each field of its input that the call
 * puts where its kind cannot be written, in the words that name that place: the path, the address after the
 * question mark, a header, or the body by its kind.
 */
export function unwritableFields(call: Stored, url: unknown): { field: string; place: string }[] {
  const input = isStored(call.input) ? call.input : {}
  const queried = Array.isArray(call.query) ? call.query.map(String) : []
  const headed = isStored(call.headers) ? Object.values(call.headers).map(String) : []
  const bodiless = ['GET', 'DELETE', 'HEAD'].includes(String(call.method ?? 'GET'))
  const inPath = [...namedIn(url), ...namedIn(call.path)]
  const body: Place = call.body === 'form' ? 'form' : call.body === 'files' ? 'files' : 'json'
  const found: { field: string; place: string }[] = []
  for (const [field, type] of Object.entries(input)) {
    const place: Place = inPath.includes(field)
      ? 'path'
      : headed.includes(field)
        ? 'header'
        : bodiless || queried.includes(field)
          ? 'query'
          : body
    // A body of the builder's own text or bytes is one field, and the call writes no other into it.
    if (place === body && isStored(call.body)) continue
    if (isStored(type) && !writable(type, place, call.files)) found.push({ field, place: places[place] })
  }
  return found
}
