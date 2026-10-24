import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import type { Doc } from './doc.ts'
import { called, listDoc, recordDoc } from './doc.ts'
import { keyText, quoted, sizeWords, timeWords } from './texts.ts'
import { ruleDoc, typeDoc, typesDoc, wasDoc } from './type.ts'
import type { Writing } from './writing.ts'
import { naming, ours } from './writing.ts'
import { marked } from './marked.ts'

/**
 * How one field of a stored record is written back. A word names a form that many fields have, a function writes
 * one field in a way of its own, and a record of forms is a record whose fields are each written by theirs.
 */
export type Form =
  | 'plain'
  | 'time'
  | 'size'
  | 'name'
  | 'names'
  | 'type'
  | 'types'
  | 'rule'
  | 'was'
  | 'never'
  | ((w: Writing, value: unknown) => Doc | undefined)
  | { [field: string]: Form }

/** How the shape marks a field: a length of time, a size, or neither. */
export type Measure = 'time' | 'size' | 'plain'

/** A value that holds no reference and no word but a secret, an asset, a word of a language file or `anyone`: written as it stands. */
export function plainDoc(w: Writing, value: unknown): Doc {
  if (value === null) return 'null'
  if (typeof value === 'string') return quoted(value)
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return listDoc(value.map((one) => plainDoc(w, one)))
  if (!isStored(value)) return 'undefined'
  const keys = Object.keys(value)
  for (const word of ['secret', 'asset', 'word'])
    if (keys.length === 1 && typeof value[word] === 'string') return called(ours(w, word), [quoted(value[word])])
  if (value.rule === 'anyone' && typeof value.why === 'string') return ruleDoc(w, value)
  return recordDoc(keys.map((key) => [`${keyText(key)}: `, plainDoc(w, value[key])]))
}

/**
 * Takes a value and how the shape marks the field it stands in. Answers a number that is a length of time or a size
 * in words, and anything else as it stands.
 */
export function measuredDoc(w: Writing, mark: Measure, value: unknown): Doc {
  if (typeof value !== 'number' || mark === 'plain') return plainDoc(w, value)
  return mark === 'time' ? timeWords(value) : sizeWords(value)
}

/** One field by its form, or nothing for a field that is never written. */
function formDoc(w: Writing, form: Form, value: unknown): Doc | undefined {
  if (typeof form === 'function') return form(w, value)
  if (typeof form === 'object') return isStored(value) ? fieldsDoc(w, value, form) : plainDoc(w, value)
  if (form === 'never') return undefined
  if (form === 'time' || form === 'size') return measuredDoc(w, form, value)
  if (form === 'name') return naming(w, String(value))
  if (form === 'names') return listDoc((Array.isArray(value) ? value : []).map((one) => naming(w, String(one))))
  if (form === 'type') return typeDoc(w, value)
  if (form === 'types') return typesDoc(w, value)
  if (form === 'rule') return ruleDoc(w, value)
  if (form === 'was') return wasDoc(value)
  return plainDoc(w, value)
}

/**
 * The fields of a stored record as the entries they are written with: those that the forms name, in the order of
 * the forms, and then every other field as it stands. Under the key `*` stands the form of every field that no
 * other key names.
 */
export function entryDocs(w: Writing, stored: Stored, forms: { [field: string]: Form }): Doc[] {
  const entries: Doc[] = []
  const names = [
    ...Object.keys(forms).filter((name) => name !== '*' && stored[name] !== undefined),
    ...Object.keys(stored).filter((name) => !Object.hasOwn(forms, name) && stored[name] !== undefined),
  ]
  for (const name of names) {
    const doc = formDoc(w, Object.hasOwn(forms, name) ? forms[name] : (forms['*'] ?? 'plain'), stored[name])
    if (doc !== undefined) entries.push([`${keyText(name)}: `, doc])
  }
  return entries
}

/** A stored record written as a record, each field by its form. */
export const fieldsDoc = (w: Writing, stored: Stored, forms: { [field: string]: Form }, broken = false): Doc =>
  recordDoc(entryDocs(w, stored, forms), broken)

/** How often something is tried: a number, or its record with its waits in words. */
export const triesForm: Form = (w, value) =>
  isStored(value)
    ? fieldsDoc(w, value, {
        max: 'plain',
        wait: marked('flows', '*', 'tries', 'wait'),
        on: 'plain',
        first: marked('flows', '*', 'tries', 'first'),
      })
    : plainDoc(w, value)
