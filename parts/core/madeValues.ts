import { sizedWritten } from './word.ts'

/** A stored list, or an empty one where the form holds none. */
export const listed = (node: unknown): unknown[] => (Array.isArray(node) ? node : [])

/** Makes an object the author wrote: its keys set in the order they were written. */
export function objectOf(entries: unknown[], values: unknown[]): object {
  const made = {}
  for (const [i, entry] of entries.entries()) {
    const key = String(listed(entry)[0])
    Object.defineProperty(made, key, { value: values[i], enumerable: true, writable: true, configurable: true })
  }
  return made
}

/** The stored values of the entries of an object the author wrote, in their order. */
export const valuesOfEntries = (entries: unknown): unknown[] => listed(entries).map((entry) => listed(entry)[1])

/**
 * Joins text with values inside it, each written as JavaScript writes a value into a text. What it makes is a
 * text of `valueSize` characters at the most, as a word makes one: T0027 beyond it, before the text is joined.
 */
export function textWith(parts: unknown[], values: unknown[]): string {
  const fixed = parts.reduce<number>((sum, part) => sum + (typeof part === 'string' ? part.length : 0), 0)
  sizedWritten(
    'a text with values',
    values.filter((_, i) => typeof parts[i] !== 'string'),
    fixed,
  )
  return parts.map((part, i) => (typeof part === 'string' ? part : `${values[i]}`)).join('')
}
