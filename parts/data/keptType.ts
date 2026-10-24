import { isDeepStrictEqual } from 'node:util'
import type { ColumnType, TableLayout } from './store.ts'

// What a type says that neither the store nor a write holds a row to: how it is shown and named, who may see it,
// and what is said elsewhere in a layout or read only at a change.
const beside = ['label', 'help', 'messages', 'was', 'private', 'personal', 'secret', 'index', 'unique', 'old']

type Stored = Record<string, unknown>

const isType = (value: Stored): value is Stored & ColumnType => typeof value.kind === 'string'

/** Takes the type of a column as a description states it. Answers it as a data file keeps it: what rows are held to, and nothing else. */
export function keptType(type: ColumnType): ColumnType {
  const kept: Stored = Object.fromEntries(Object.entries(type).filter(([name]) => !beside.includes(name)))
  return isType(kept) ? kept : type
}

/** Takes the layout that a description asks for of a table. Answers it as a data file keeps it: without what only a change reads. */
export function keptLayout(layout: TableLayout): TableLayout {
  const { was: _, removed: __, columns, ...rest } = layout
  return {
    ...rest,
    columns: Object.fromEntries(Object.entries(columns).map(([name, type]) => [name, keptType(type)])),
  }
}

/** Whether the type of a column says its values are sealed: nothing for a column that is not there. */
export const isSealed = (type: object | undefined): boolean =>
  type !== undefined && 'sealed' in type && type.sealed === true

/** Whether a row must hold a value in a column: a column with a default is filled before the row reaches the store. */
export const mustBeHeld = (type: ColumnType): boolean =>
  type.kind !== 'vector' && !type.optional && !('default' in type && type.default !== undefined)

/** A type without what says whether a row must hold a value. */
function withoutNeed(type: ColumnType): Stored {
  const { optional: _, default: __, ...rest }: Stored = { ...type }
  return rest
}

/** Whether two types differ in nothing but whether a row must hold a value, and in the default. */
export const sameButNeed = (a: ColumnType, b: ColumnType): boolean => isDeepStrictEqual(withoutNeed(a), withoutNeed(b))

const numberOf = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/**
 * Takes the type a column has and the type it is to have, of one kind. Answers whether the new one takes less than
 * the old one, so that the rows must be held against it: not for a wider limit, and not for a list of choices that
 * holds every value of the old one.
 */
export function takesLess(old: ColumnType, to: ColumnType): boolean {
  const { min: oldMin, max: oldMax, values: oldValues, whole: oldWhole, ...a } = withoutNeed(old)
  const { min, max, values, whole, ...b } = withoutNeed(to)
  for (const rest of [a, b])
    for (const name of ['from', 'sealed', 'onRemove', 'made', 'by']) Reflect.deleteProperty(rest, name)
  if (!isDeepStrictEqual(a, b)) return true
  if (whole === true && oldWhole !== true) return true
  const [low, wasLow, high, wasHigh] = [min, oldMin, max, oldMax].map(numberOf)
  if (low !== undefined && (wasLow === undefined || low > wasLow)) return true
  if (high !== undefined && (wasHigh === undefined || high < wasHigh)) return true
  return Array.isArray(oldValues) && Array.isArray(values) && oldValues.some((value) => !values.includes(value))
}
