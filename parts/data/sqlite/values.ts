import type { SQLInputValue } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import { holdsMoment, withMoments } from '../moments.ts'
import type { ColumnType } from '../store.ts'

const misfit = (table: string, column: string, needs: string): TentError =>
  new TentError('T2107', `The value of \`${column}\` does not fit its column of \`${table}\`: it takes ${needs}.`, {
    fields: { [column]: 'type' },
  })

/** A moment as whole milliseconds since 1970, from a `Date` or from text in the standard form. Nothing for any other value. */
export function msOf(value: unknown): number | undefined {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * Takes the type of a column, a value as code holds it, and the names of the table and the column. Answers the
 * value as SQLite keeps it: nothing as NULL, true and false as 1 and 0, a moment as whole milliseconds, and a list,
 * an object and a `json` as JSON text. A sealed value is the sealed text, whatever its type. A link is not turned
 * here: its row is looked up by whoever writes it. Throws T2107 for a value of another kind than the column holds.
 */
export function toStored(type: ColumnType, value: unknown, table: string, column: string): SQLInputValue {
  if (value === undefined || value === null) return null
  if ('sealed' in type && type.sealed) {
    if (typeof value !== 'string') throw misfit(table, column, 'a sealed text')
    return value
  }
  switch (type.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (type.whole && !Number.isInteger(value)))
        throw misfit(table, column, type.whole ? 'a whole number' : 'a finite number')
      return value
    case 'boolean':
      if (typeof value !== 'boolean') throw misfit(table, column, 'true or false')
      return value ? 1 : 0
    case 'date': {
      const ms = msOf(value)
      if (ms === undefined) throw misfit(table, column, 'a moment')
      return ms
    }
    case 'list':
    case 'object':
    case 'json':
      return JSON.stringify(value)
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw misfit(table, column, 'raw bytes')
      return value
    default:
      if (typeof value !== 'string') throw misfit(table, column, 'text')
      return value
  }
}

/**
 * Takes the type of a column and a value as SQLite keeps it. Answers the value as code holds it: nothing for NULL,
 * a moment as a `Date`, and what JSON text holds read back, with its moments. A sealed value stays the sealed
 * text, and the text id of a link is read by the statement itself.
 */
export function fromStored(type: ColumnType, stored: unknown): unknown {
  if (stored === null || stored === undefined) return undefined
  if ('sealed' in type && type.sealed) return stored
  switch (type.kind) {
    case 'boolean':
      return stored === 1
    case 'date':
      return new Date(Number(stored))
    case 'list':
    case 'object':
    case 'json': {
      const value: unknown = JSON.parse(String(stored))
      return holdsMoment(type) ? withMoments(type, value) : value
    }
    default:
      return stored
  }
}
