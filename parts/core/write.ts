import { createHash } from 'node:crypto'
import type { Description } from './description.ts'

/** Takes bytes, or a text as UTF-8. Answers their fingerprint: SHA-256, written as lowercase hex. */
export function fingerprintOf(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

// The runtime writes the keys of a map in the order they were added, but for a key that is an index of a list, which it
// writes first: such a key is added with a mark in front, which is taken out of the text. A mark is a run of lone
// surrogates, which the runtime writes as their escapes, the shortest that no key and no text of the value holds.
const isIndex = (key: string): boolean => /^(?:0|[1-9]\d{0,9})$/.test(key) && Number(key) < 4294967295

/** A copy of a value in the form it is written in: every map with its keys in code-unit order. */
function ordered(value: unknown, mark: string, inList: boolean, met: { mark: boolean; marked: boolean }): unknown {
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'string') {
    if (value.includes(mark)) met.mark = true
    return value
  }
  // What has no form in JSON is written as nothing, and left out of a map where it is no value at all.
  if (value === undefined) return inList ? null : undefined
  if (typeof value === 'function' || typeof value === 'symbol') return null
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((one) => ordered(one, mark, true, met))
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const one: unknown = Reflect.get(value, key)
    if (one === undefined) continue
    if (key.includes(mark)) met.mark = true
    const index = isIndex(key)
    if (index) met.marked = true
    copy[index ? `${mark}${key}` : key] = ordered(one, mark, false, met)
  }
  return copy
}

/** Writes a value as JSON, in each indent asked, with the keys of every map in code-unit order. */
function writtenIn(value: unknown, indents: (string | undefined)[]): string[] {
  for (let long = 1; ; long++) {
    const mark = '\udfff'.repeat(long)
    const met = { mark: false, marked: false }
    const copy = ordered(value, mark, false, met)
    if (met.mark && met.marked) continue
    const escaped = `"${'\\udfff'.repeat(long)}`
    return indents.map((indent) => {
      const text = JSON.stringify(copy, null, indent) ?? 'null'
      return met.marked ? text.replaceAll(escaped, '"') : text
    })
  }
}

/** Writes a value as JSON, with the keys of every map in code-unit order, and with that indent where `indent` is given. */
export function written(value: unknown, indent: string | undefined): string {
  return writtenIn(value, [indent])[0]
}

// The version id of each text of a description that this program wrote last: an engine of the same program that reads
// the text back takes its id from here, and writes it not again.
const wroteLast = new Map<string, string>()
const keptWritings = 4

/**
 * Takes a description. Answers its final text: UTF-8 with line feeds, two spaces of indent, the keys of every map
 * in code-unit order, and one line feed at its end; the bytes of that text; its fingerprint, taken over the same
 * content written with no spaces and no line breaks; and the version id, the first 32 characters of the fingerprint.
 */
export function write(description: Description): {
  text: string
  bytes: Uint8Array
  fingerprint: string
  versionId: string
} {
  // An empty map is left out, as every field that holds nothing is: a description holds only what an app has.
  const held = Object.fromEntries(
    Object.entries(description).filter(
      ([, part]) => typeof part !== 'object' || part === null || Object.keys(part).length,
    ),
  )
  const [indented, plain] = writtenIn(held, ['  ', undefined])
  const text = `${indented}\n`
  const fingerprint = fingerprintOf(plain)
  const versionId = fingerprint.slice(0, 32)
  wroteLast.delete(text)
  wroteLast.set(text, versionId)
  for (const old of [...wroteLast.keys()].slice(0, -keptWritings)) wroteLast.delete(old)
  return { text, bytes: new TextEncoder().encode(text), fingerprint, versionId }
}

/**
 * Takes the text of a description as it was read, and the description read from it. Answers its version id: the one
 * this program gave the text where it wrote it, and otherwise the id of its content.
 */
export function versionIdOf(text: string, description: Description): string {
  return wroteLast.get(text) ?? write(description).versionId
}
