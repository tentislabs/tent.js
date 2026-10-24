import { fieldOf } from './field.ts'
import type { Filter } from './filter.ts'
import { isFields } from './record.ts'
import { momentOf } from './time.ts'

/** Whether two values are the same: two moments by their time, and anything else as it is. */
export function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const [first, second] = [momentOf(a), momentOf(b)]
    return first !== undefined && first === second
  }
  return a === b
}

/** A text with the capitals of the 26 plain letters written small, and every other letter as it is written. */
export const folded = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

const isNothing = (value: unknown): boolean => value === undefined || value === null
const isEmpty = (value: unknown): boolean => isNothing(value) || value === '' || (Array.isArray(value) && !value.length)

/** What two values are compared by: a moment by its time, and a number and a text as they are. */
function ranked(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return momentOf(value) ?? value
  return momentOf(value)
}

/** Whether one value lies before another, where both are of one kind that has an order. */
function before(a: unknown, b: unknown): boolean {
  const [first, second] = [ranked(a), ranked(b)]
  return first !== undefined && second !== undefined && typeof first === typeof second && first < second
}

const asText = (value: unknown): string | undefined => (typeof value === 'string' ? folded(value) : undefined)

/** The operators of a filter, each as what it asks of the value of a row and the value of the filter. */
const operators: Record<string, (held: unknown, asked: unknown) => boolean> = {
  is: same,
  not: (held, asked) => !same(held, asked),
  above: (held, asked) => before(asked, held),
  after: (held, asked) => before(asked, held),
  below: (held, asked) => before(held, asked),
  before: (held, asked) => before(held, asked),
  atLeast: (held, asked) => same(held, asked) || before(asked, held),
  atMost: (held, asked) => same(held, asked) || before(held, asked),
  in: (held, asked) => Array.isArray(asked) && asked.some((one) => same(held, one)),
  contains: (held, asked) => {
    if (Array.isArray(held)) return held.some((entry) => same(entry, asked))
    const [text, part] = [asText(held), asText(asked)]
    return text !== undefined && part !== undefined && text.includes(part)
  },
  startsWith: (held, asked) => {
    const [text, part] = [asText(held), asText(asked)]
    return text !== undefined && part !== undefined && text.startsWith(part)
  },
}

/** Whether a stored value of a filter is a record: a moment is a value, and is handed on as it is. */

/** Works a stored value of a filter out: a literal as it is, an object the author wrote, a list, and anything else through `resolve`. */
function valueOfThe(stored: unknown, resolve?: (ref: object) => unknown): unknown {
  if (Array.isArray(stored)) return stored.map((entry) => valueOfThe(entry, resolve))
  if (!isFields(stored)) return stored
  if (Array.isArray(stored.object))
    return Object.fromEntries(stored.object.map((entry: unknown[]) => [entry[0], valueOfThe(entry[1], resolve)]))
  return resolve ? resolve(stored) : undefined
}

/** Whether a row fits one filter: true, false, or nothing for a filter that is left out. */
function fits(filter: Filter, row: unknown, resolve?: (ref: object) => unknown): boolean | undefined {
  if ('any' in filter && Array.isArray(filter.any)) {
    const each = filter.any.map((one: Filter) => fits(one, row, resolve)).filter((one) => one !== undefined)
    return each.length ? each.some(Boolean) : undefined
  }
  if ('all' in filter && Array.isArray(filter.all)) {
    const each = filter.all.map((one: Filter) => fits(one, row, resolve)).filter((one) => one !== undefined)
    return each.length ? each.every(Boolean) : undefined
  }
  if (!('col' in filter)) {
    const inner = 'not' in filter && isFields(filter.not) ? fits(filter.not, row, resolve) : undefined
    return inner === undefined ? undefined : !inner
  }
  // A column may run through a link whose row stands inside the row.
  const held = fieldOf(row, String(filter.col).split('.'))
  for (const [name, stored] of Object.entries(filter)) {
    if (name === 'col' || name === 'given') continue
    if (name === 'empty') return isEmpty(held) === (stored !== false)
    const asked = valueOfThe(stored, resolve)
    // An entry written with `given` is no part of the filter while its value holds nothing.
    if (filter.given === true && isEmpty(asked)) return undefined
    // A value that is nothing fits no row: `empty` is the word for a missing value.
    return !isNothing(asked) && Object.hasOwn(operators, name) && operators[name](held, asked)
  }
  return undefined
}

/**
 * Takes a filter as it is stored, one row in memory, and `resolve`, which answers what in the filter is no
 * literal. Answers whether the row fits, by the rules of the store: it reads the row's own fields, and holds no
 * plan.
 */
export function matches(filter: Filter, row: unknown, resolve?: (ref: object) => unknown): boolean {
  return fits(filter, row, resolve) ?? true
}
