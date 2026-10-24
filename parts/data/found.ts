import { TentError } from '../core/index.ts'
import type { DbContext } from './context.ts'
import { noKey } from './context.ts'
import type { TableModel } from './model.ts'
import type { Filter } from './worked.ts'

/** The column of the store that keeps the fingerprint of a sealed column that is found by an equal value. */
export const foundColumn = (column: string): string => `${column}__found`

/** What a fingerprint is bound to: the table and the column, so the same value in two columns does not match. */
const boundOf = (table: string, column: string): string => `${table}.${column}`

/** The keyed fingerprint of one value of a findable column. Throws T0019 with no key at hand. */
export function fingerprintOf(cx: DbContext, model: TableModel, column: string, value: unknown): string {
  if (!cx.o.seal?.find) throw noKey(model.name, column)
  return cx.o.seal.find(value, boundOf(model.name, column))
}

// The operators that a fingerprint answers: an equal value, one among a list, and one that differs.
const equal = ['is', 'in', 'not']

/**
 * Takes the context of a `db`, a table, and the filter of a plan of it. Answers the filter with each entry on a
 * findable sealed column of the table held to its fingerprint in place of its value. Throws T2026 for an entry
 * that asks anything but an equal value, which a fingerprint cannot answer.
 */
export function foundFilter(cx: DbContext, model: TableModel, filter: Filter): Filter {
  if ('any' in filter && Array.isArray(filter.any)) return { any: filter.any.map((one) => foundFilter(cx, model, one)) }
  if ('all' in filter && Array.isArray(filter.all)) return { all: filter.all.map((one) => foundFilter(cx, model, one)) }
  if (!('col' in filter)) return 'not' in filter ? { not: foundFilter(cx, model, filter.not) } : filter
  const column = String(filter.col)
  if (!model.findable.includes(column)) return filter
  const asked = Object.keys(filter).filter((name) => name !== 'col' && name !== 'given')
  // Whether a value is there is asked of the sealed column itself.
  if (asked.every((name) => name === 'empty')) return filter
  const odd = asked.find((name) => !equal.includes(name))
  if (odd !== undefined) throw misused(model, column, `\`${odd}\``)
  const held: Filter = { col: foundColumn(column) }
  for (const name of asked) {
    const value = filter[name]
    held[name] =
      value === null || value === undefined
        ? value
        : name === 'in' && Array.isArray(value)
          ? value.map((one) => fingerprintOf(cx, model, column, one))
          : fingerprintOf(cx, model, column, value)
  }
  return held
}

/** The error of a sort or a range on a findable sealed column. */
export const misused = (model: TableModel, column: string, what: string): TentError =>
  new TentError(
    'T2026',
    `\`${column}\` of \`${model.name}\` is sealed and found by its fingerprint, which answers an equal value alone: ${what} cannot be asked of it.`,
    { fix: 'Find the row by an equal value, and sort or compare by a column that is not sealed.' },
  )
