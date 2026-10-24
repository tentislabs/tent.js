import { isDescribing } from './describing.ts'
import { TentError } from './errors.ts'
import { faultOf } from './itself.ts'
import { isMarked, mark } from './mark.ts'
import { planOf } from './planOf.ts'
import { filled } from './runtime.ts'
import { asValue, isWritten } from './written.ts'

/** What a word that makes or walks a list asks once for each entry: it ends the work once its time is up. */
export type Tick = (() => void) | undefined

/** The most entries or characters that one word makes, where the app of the call that is under way states no other. */
const valueSize = 1_000_000

/**
 * Whether the values a word was handed hold a reference: a record that a word of ours made, or a plan, wherever it
 * stands among them and in what is written inside them. A value that holds itself holds no reference where it
 * stands in itself. Throws T0027 for a value that is nested more than 200 deep, wherever a reference stands.
 */
export function holdsReference(values: readonly unknown[]): boolean {
  let found = false
  // The values are counted each from itself: the list that holds them is no part of any.
  const fault = faultOf(
    values,
    (held) => {
      if (typeof held !== 'object' || held === null) return undefined
      // An entry written with `given` is a reference only where its value is one.
      if (isMarked(held) && 'given' in held) return [held.given]
      if (isMarked(held) || planOf(held)) {
        found = true
        return undefined
      }
      // The walk goes on past a reference: a value beside it that is too deep is the word's to refuse.
      return Array.isArray(held) || isWritten(held) ? held : undefined
    },
    0,
  )
  // A word would work such a value out by calls inside calls, further than the runtime can go.
  if (fault?.why === 'deep')
    throw new TentError('T0027', 'A value word cannot work with a value that is nested more than 200 deep.')
  // And one that stands in very many places it would write out place by place.
  if (fault?.why === 'large') throw new TentError('T0027', `A value word cannot work with a value that ${fault.words}.`)
  return found
}

/**
 * Takes the name of a value word and the values it was handed. Answers the record of the word, `{ fn, args }`,
 * where a value is a reference, and nothing where every value is plain, so that the word works its value out.
 */
export function recorded(name: string, values: readonly unknown[]): object | undefined {
  return holdsReference(values) ? mark({ fn: name, args: values.map(asValue) }) : undefined
}

/**
 * Takes a word that asks the engine, and its values. Answers `{ value }` with what the engine answers in the call
 * that is under way, and nothing where a definition is being made or no call is under way.
 */
export function drawn(
  word: 'now' | 'random' | 'token' | 'zone' | 'mayWait' | 'valueSize',
  values: unknown[],
): { value: unknown } | undefined {
  return isDescribing() ? undefined : filled()?.draw(word, values)
}

const shown = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'a date that holds no moment' : value.toISOString()
  if (Array.isArray(value)) return 'a list'
  return typeof value === 'object' && value !== null ? 'a record' : String(value)
}

/** Throws T0027: a word was handed a value of another kind than it works with. It names the word and the value. */
export function cannot(word: string, value: unknown, needs: string): never {
  throw new TentError('T0027', `${word} cannot work with ${shown(value)}: it needs ${needs}.`)
}

/**
 * Throws T0027 where a word would make a list or a text that is larger than a value may be: the limit of the app
 * whose call is under way, which the engine answers, and 1,000,000 where no call is under way.
 */
export function sized(word: string, size: number): void {
  const asked = drawn('valueSize', [])?.value
  const limit = typeof asked === 'number' ? asked : valueSize
  if (size > limit)
    throw new TentError('T0027', `${word} would make a value of ${size}, past the limit valueSize of ${limit}.`)
}

/**
 * Takes a value, and the most characters that are of interest. Answers how many characters the value comes to once
 * JavaScript writes it into a text, counted without writing it: a list is its entries with a comma between, a
 * list inside it the same, and nothing for an entry that is nothing. The count ends past `most`, and so does a
 * walk of more than `most` entries: what it answers then is only more than `most`.
 */
function writtenLength(value: unknown, most: number): number {
  // Only a list can be long once written and small in memory: anything else is written to be counted.
  if (!Array.isArray(value)) return typeof value === 'symbol' ? 0 : String(value).length
  let size = 0
  let walked = 0
  const lists: unknown[][] = [value]
  for (let list = lists.pop(); list; list = lists.pop()) {
    size += Math.max(list.length - 1, 0)
    for (const entry of list) {
      if (++walked > most || size > most) return most + 1
      if (Array.isArray(entry)) lists.push(entry)
      else if (typeof entry === 'string') size += entry.length
      else if (entry !== undefined && entry !== null && typeof entry !== 'symbol') size += String(entry).length
    }
  }
  return size
}

/**
 * Throws T0027 where the values that a word is about to write into one text come to more than a value may hold,
 * before any of them is written: a list that holds a list twice, many times over, is small in memory and very
 * long as a text. `more` is what the text holds beside them.
 */
export function sizedWritten(word: string, values: readonly unknown[], more = 0): void {
  const asked = drawn('valueSize', [])?.value
  const limit = typeof asked === 'number' ? asked : valueSize
  let size = more
  for (const value of values) {
    size += writtenLength(value, limit - size)
    if (size > limit)
      throw new TentError(
        'T0027',
        `${word} would make a value of more than ${limit}, past the limit valueSize of ${limit}.`,
      )
  }
}

/** Answers a value that must be a list. Throws T0027 for anything else, nothing among it. */
export function listOf(word: string, value: unknown): unknown[] {
  return Array.isArray(value) ? value : cannot(word, value, 'a list')
}

/** Answers a value that must be text. It fails as JavaScript fails for nothing, and throws T0027 for another kind. */
export function textOf(word: string, value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) throw new TypeError(`${word} was handed ${value} where a text is needed`)
  return cannot(word, value, 'a text')
}

/** Answers a value that must be a number. Nothing is taken as JavaScript takes it, and another kind is T0027. */
export function numberOf(word: string, value: unknown): number {
  if (typeof value === 'number') return value
  if (value === undefined) return Number.NaN
  return value === null ? 0 : cannot(word, value, 'a number')
}

/** Writes a value as `concat` writes it: a moment in the standard form, nothing as empty text, a number as JavaScript does. */
export function writtenOut(value: unknown): string {
  if (value === undefined || value === null) return ''
  return value instanceof Date ? value.toISOString() : String(value)
}
