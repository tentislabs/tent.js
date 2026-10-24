import { isStored } from '../../core/internal.ts'
import { nearest } from './printed.ts'

/** What the command itself could not be carried out for: it ends with 2. */
export class Unrunnable extends Error {}

/** A name of a field as a flag writes it: a hyphen and a small letter where the name has a capital. */
export const flagOf = (field: string): string => field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/** The kind of a type, and of the entries of a list. */
const kindOf = (type: unknown): string => String(Reflect.get(Object(type), 'kind'))

/** One value as a flag wrote it, read by the type of its field: the runner only turns words into values. */
function valueOf(type: unknown, written: string): unknown {
  const kind = kindOf(type)
  if (kind === 'number') return written.trim() !== '' && !Number.isNaN(Number(written)) ? Number(written) : written
  if (kind === 'boolean') return written === 'false' ? false : written === 'true' ? true : written
  if (['object', 'json', 'vector', 'map', 'oneOf'].includes(kind))
    try {
      return JSON.parse(written)
    } catch {
      return written
    }
  return written
}

/** What the words after a command word give: the input by its fields, and the fields that name a file to upload. */
export interface WordsRead {
  input: Record<string, unknown>
  files: { field: string; path: string }[]
}

/**
 * Takes the input types of a command and the words after its word, without the runner's own flags. Answers the
 * input that the flags give, field by field. A flag that is no field, a bare word, and a flag with no value throw
 * `Unrunnable`, naming the nearest flag.
 */
export function readFlags(input: Record<string, unknown>, words: string[]): WordsRead {
  const byFlag = new Map(Object.keys(input).map((field) => [flagOf(field), field]))
  const read: WordsRead = { input: {}, files: [] }
  for (let k = 0; k < words.length; k++) {
    const word = words[k]
    if (!word.startsWith('--')) {
      const near = nearest(word, [...byFlag.keys()])
      throw new Unrunnable(
        `The command takes no word "${word.slice(0, 40)}": give a flag.${near ? ` Did you mean --${near}?` : ''}`,
      )
    }
    const [flag, given] = word.slice(2).split(/=(.*)/s)
    let field = byFlag.get(flag)
    let negated = false
    // `--no-done` is the field `noDone` where there is one, and false for `done` otherwise.
    if (field === undefined && flag.startsWith('no-') && byFlag.has(flag.slice(3))) {
      field = byFlag.get(flag.slice(3))
      negated = true
    }
    if (field === undefined) {
      const near = nearest(flag, [...byFlag.keys()])
      throw new Unrunnable(`The command takes no --${flag.slice(0, 40)}.${near ? ` Did you mean --${near}?` : ''}`)
    }
    const type = input[field]
    const kind = kindOf(type)
    if (kind === 'boolean' && given === undefined) {
      read.input[field] = !negated
      continue
    }
    const written = given ?? words[++k]
    if (written === undefined) throw new Unrunnable(`--${flag} needs a value.`)
    if (kind === 'file') {
      read.files.push({ field, path: written })
      continue
    }
    if (kind === 'list') {
      const held = read.input[field]
      const of: unknown = Reflect.get(Object(type), 'of')
      read.input[field] = [...(Array.isArray(held) ? held : []), valueOf(of, written)]
      continue
    }
    read.input[field] = valueOf(type, written)
  }
  return read
}

/** The fields of an input as `--input` gave them, with the flags winning field by field. */
export function withFlags(given: unknown, read: WordsRead): Record<string, unknown> {
  if (given !== undefined && !isStored(given)) throw new Unrunnable('`--input` is one JSON object.')
  return { ...(given ?? {}), ...read.input }
}
