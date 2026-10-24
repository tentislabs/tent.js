import type { Stored } from '../record.ts'
import { isStored } from '../record.ts'
import { keptAt } from './kept.ts'
import type { Told } from './shared.ts'
import { insideOf, optionsOf, report } from './shared.ts'

/** What a worked-out value is sure to be, as far as its stored form says. */
type Result = 'text' | 'number' | 'boolean' | 'day' | 'date'

/** The kinds of column that each sure result may fill. */
const fills: Record<Result, string[]> = {
  text: ['text', 'choice', 'day', 'date', 'link', 'file', 'json'],
  number: ['number', 'json'],
  boolean: ['boolean', 'json'],
  day: ['day', 'text', 'json'],
  date: ['date', 'json'],
}

/** What a column of each kind hands a `from` that names it. */
const handed: Record<string, Result> = {
  text: 'text',
  choice: 'text',
  link: 'text',
  file: 'text',
  number: 'number',
  boolean: 'boolean',
  day: 'day',
  date: 'date',
}

/** The value words by what each is sure to answer. */
const answers: Record<string, Result> = {
  lower: 'text',
  upper: 'text',
  trim: 'text',
  join: 'text',
  fingerprint: 'text',
  round: 'number',
  floor: 'number',
  ceil: 'number',
  sum: 'number',
  avg: 'number',
  between: 'number',
  startsWith: 'boolean',
  contains: 'boolean',
  sameSecret: 'boolean',
  dayOf: 'day',
}

const numberSigns = ['-', '*', '/', '%']
const compareSigns = ['==', '!=', '<', '<=', '>', '>=']

/** What a stored value of a `from` is sure to answer, or nothing where its form does not say. */
function resultOf(value: unknown, columns: Record<string, Stored>): Result | undefined {
  if (typeof value === 'string') return 'text'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (!isStored(value)) return undefined
  if (typeof value.col === 'string') return handed[String(keptAt(columns, value.col)?.kind)]
  if (Array.isArray(value.concat)) return 'text'
  if (typeof value.calc === 'string') {
    if (numberSigns.includes(value.calc)) return 'number'
    if (compareSigns.includes(value.calc)) return 'boolean'
    const sides = [resultOf(value.left, columns), resultOf(value.right, columns)]
    return sides.includes('text') ? 'text' : sides.every((side) => side === 'number') ? 'number' : undefined
  }
  const fn = typeof value.fn === 'string' ? value.fn : ''
  const [first] = Array.isArray(value.args) ? value.args : []
  // A moment or a day that is moved, a part of a text, and the least of some values are of the kind they were handed.
  if (['later', 'earlier', 'slice', 'least', 'most'].includes(fn)) return resultOf(first, columns)
  return Object.hasOwn(answers, fn) ? answers[fn] : undefined
}

/** Walks a stored value of a `from`, and notes each column it names and whether it divides or takes a remainder. */
function seenIn(value: unknown, seen: { columns: string[]; divides: boolean }): void {
  if (Array.isArray(value)) for (const one of value) seenIn(one, seen)
  if (!isStored(value)) return
  if (typeof value.col === 'string') seen.columns.push(value.col)
  if (value.calc === '/' || value.calc === '%') seen.divides = true
  for (const one of insideOf(value)) seenIn(one, seen)
}

/**
 * Takes the columns of a table as they are stored. Reports, for each column that states `from`, what the store
 * could not work out or keep (T1014): another column with `from`, a column through a link, a column that must be
 * optional and is not, and a result that is not of the type of the column.
 */
export function heldFrom(told: Told, columns: Record<string, Stored>): void {
  for (const [name, column] of Object.entries(columns)) {
    if (column.from === undefined) continue
    const where = `\`columns.${name}.from\``
    const seen: { columns: string[]; divides: boolean } = { columns: [], divides: false }
    seenIn(column.from, seen)
    for (const named of new Set<string>(seen.columns)) {
      if (named.includes('.'))
        report(
          told,
          'T1014',
          `${where} names \`${named}\`, a column through a link.`,
          'A `from` is worked out from the columns of its own row. Keep the value in a column that a change writes.',
        )
      else if (keptAt(columns, named)?.from !== undefined)
        report(
          told,
          'T1014',
          `${where} names the column \`${named}\`, which states \`from\` itself.`,
          `Write what \`${named}\` is worked out from in its place.`,
        )
    }
    const maybe = seen.columns.filter(
      (named) => keptAt(columns, named)?.optional === true || keptAt(columns, named)?.kind === 'vector',
    )
    if (column.optional !== true && (seen.divides || maybe.length))
      report(
        told,
        'T1014',
        seen.divides
          ? `${where} divides or takes a remainder, so the column may hold nothing, and it is not optional.`
          : `${where} names the optional column \`${maybe[0]}\`, so the column may hold nothing, and it is not optional.`,
        `State \`optional: true\` on \`${name}\`.`,
      )
    const result = resultOf(column.from, columns)
    if (result !== undefined && !fills[result].includes(String(column.kind)))
      report(
        told,
        'T1014',
        `${where} works out a ${result}, and the column is a \`${String(column.kind)}\`.`,
        'Give the column the type of what its `from` works out.',
      )
  }
}

/**
 * Takes plain writes as they are stored, and the place they stand in. Reports each column of a write that states
 * `from` (T1014): the store works such a column out, and nothing writes it.
 */
export function writesHeld(told: Told, where: string, writes: readonly Stored[]): void {
  for (const write of writes) {
    const table = String(write.add ?? write.change)
    const columns = optionsOf(told.all.get(table)?.options.columns)
    for (const name of Object.keys(optionsOf(write.values)))
      if (optionsOf(keptAt(columns, name)).from !== undefined)
        report(
          told,
          'T1014',
          `${where} writes the column \`${name}\` of ${table}, which states \`from\`.`,
          'Take the column out of the write: the store works it out.',
        )
  }
}
