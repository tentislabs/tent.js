import { isStored } from '../../core/internal.ts'
import type { Words } from './spoken.ts'
import { ownWords, textOf } from './spoken.ts'

/**
 * The words for one field that failed, in the language of the page: those of the check it failed, under
 * `tent.<check>` with the limits of its type as their places, or the builder's own words as they were sent.
 */
export function wordsFor(check: string, type: unknown, words: Words = ownWords, language = 'en'): string {
  if (!Object.hasOwn(words, `tent.${check}`)) return check
  return textOf(words, `tent.${check}`, isStored(type) ? type : {}, language)
}

/** A name turned into words: `placedBy` gives "Placed by". */
export function asWords(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * The fields of the input of a function by their names: a field of an `object` is reached by a dotted name, as
 * `address.city`, and the object itself is no field.
 */
export function fieldsOf(input: Record<string, unknown>, under = ''): Record<string, unknown> {
  const found: Record<string, unknown> = {}
  for (const [name, type] of Object.entries(input)) {
    const dotted = under ? `${under}.${name}` : name
    if (isStored(type) && type.kind === 'object' && isStored(type.shape))
      Object.assign(found, fieldsOf(type.shape, dotted))
    else found[dotted] = type
  }
  return found
}

/** What a record holds under a dotted name. */
export function deepOf(record: Record<string, unknown>, dotted: string): unknown {
  let at: unknown = record
  for (const part of dotted.split('.')) at = isStored(at) && Object.hasOwn(at, part) ? at[part] : undefined
  return at
}

/** Values by their dotted names, put back into the records they stand in. */
export function nestedOf(flat: Record<string, unknown>): Record<string, unknown> {
  const made: Record<string, unknown> = {}
  for (const [dotted, value] of Object.entries(flat)) {
    const parts = dotted.split('.')
    let at = made
    for (const part of parts.slice(0, -1)) {
      const next = isStored(at[part]) ? at[part] : {}
      at[part] = next
      at = next
    }
    at[parts[parts.length - 1]] = value
  }
  return made
}

/** What a field holds before a person touched it: what the form gave, or the default of its type. */
export function startOf(type: unknown, given: unknown): unknown {
  if (given !== undefined) return given
  if (isStored(type) && type.default !== undefined && !isStored(type.default)) return type.default
  return isStored(type) && type.kind === 'boolean' ? false : undefined
}
