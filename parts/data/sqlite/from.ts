import { valueOf } from '../../core/internal.ts'
import type { ColumnType, Row } from '../store.ts'

/** Answers the columns of the same row that a stored `from` names. */
function namedIn(stored: unknown, found: string[] = []): string[] {
  if (Array.isArray(stored)) for (const one of stored) namedIn(one, found)
  else if (typeof stored === 'object' && stored !== null) {
    if ('col' in stored && typeof stored.col === 'string') found.push(stored.col)
    else for (const one of Object.values(stored)) namedIn(one, found)
  }
  return found
}

/** A column that is worked out from the row's own columns: its name, its expression, and the columns it names. */
export interface Worked {
  name: string
  from: unknown
  names: string[]
}

/** Answers the columns of a table that state `from`. */
export const workedColumns = (columns: [string, ColumnType][]): Worked[] =>
  columns.flatMap(([name, type]) =>
    'from' in type && type.from !== undefined ? [{ name, from: type.from, names: namedIn(type.from) }] : [],
  )

const isNothing = (value: unknown): boolean => value === undefined || value === null

/**
 * Takes the columns of a table that state `from`, and a row as code holds it. Answers what each of them holds for
 * that row, by `valueOf`. Where a column it names holds nothing, it holds nothing and nothing is worked out, and a
 * result that is no finite number, as of a division by zero, is nothing too.
 */
export function workedOut(worked: Worked[], row: Row): Row {
  const made: Row = {}
  for (const { name, from, names } of worked) {
    const value = names.some((one) => isNothing(row[one]))
      ? null
      : valueOf(from, { ref: (ref) => ('col' in ref ? row[String(ref.col)] : undefined) })
    made[name] = isNothing(value) || (typeof value === 'number' && !Number.isFinite(value)) ? null : value
  }
  return made
}
