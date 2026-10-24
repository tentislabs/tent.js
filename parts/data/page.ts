import { TentError } from '../core/index.ts'
import type { Row } from './store.ts'
import { isWhole, wholeOf } from './whole.ts'

/**
 * Takes the last row of a page and the columns the page is sorted by. Answers the cursor for the page after it:
 * the values of that row in those columns, and its id, as text that is safe in an address. Where one of those
 * values is a whole number that the runtime cannot hold exactly, its digits stand beside the values, in a last
 * place of their own under the place of their column, as the file holds the number: the page after it goes on
 * behind the number itself. No value of a column can stand in that place.
 */
export function cursorOf(row: Row, sorted: string[]): string {
  const digits = wholeOf(row) ?? {}
  const whole = Object.fromEntries(
    sorted.flatMap((column, at) => (Object.hasOwn(digits, column) ? [[String(at), digits[column]]] : [])),
  )
  const values: unknown[] = [...sorted.map((column) => row[column] ?? null), row.id]
  if (Object.keys(whole).length) values.push(whole)
  return Buffer.from(JSON.stringify(values)).toString('base64url')
}

/**
 * Takes a cursor and how many columns the page is sorted by. Answers the values it holds, then the id, and where
 * the cursor holds them the digits of its whole numbers last, by the place of their column. Throws T0002 for a
 * text that is no cursor of such a page: digits that are no whole number that SQLite holds among it.
 */
export function cursorValues(cursor: unknown, columns: number): unknown[] {
  try {
    const read: unknown = JSON.parse(Buffer.from(String(cursor), 'base64url').toString())
    const values: unknown[] = Array.isArray(read) ? read : []
    const fits = typeof values[columns] === 'string'
    if (fits && values.length === columns + 1) return values
    const whole: unknown = fits && values.length === columns + 2 ? values[columns + 1] : undefined
    if (
      typeof whole === 'object' &&
      whole !== null &&
      !Array.isArray(whole) &&
      Object.entries(whole).every(([at, digits]) => /^\d+$/.test(at) && Number(at) < columns && isWhole(digits))
    )
      return values
  } catch {
    // A text that does not read is refused below, as one of another length is.
  }
  throw new TentError('T0002', 'The value of `after` is no cursor of this page.', { fields: { after: 'type' } })
}
