import type { SQLInputValue, SQLOutputValue, StatementSync } from 'node:sqlite'
import { keepWhole, wholeOf } from '../whole.ts'

type Read = Record<string, SQLOutputValue>

/** Whether the runtime threw because a whole number that SQLite answered is one that no number of it holds exactly. */
const isTooWide = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ERR_OUT_OF_RANGE'

/** Whether a whole number is one that a number of the runtime holds exactly. */
export const isExact = (value: bigint): boolean =>
  value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Takes a row that a statement read with its whole numbers as the large numbers of the runtime. Answers the row
 * with each as the nearest number: a whole number past 2^53 is answered so, and nothing is thrown. The digits of
 * each such number are kept beside the row.
 */
export function nearest(row: Read): Read {
  const made: Read = {}
  let digits: Record<string, string> | undefined
  for (const [name, value] of Object.entries(row)) {
    made[name] = typeof value === 'bigint' ? Number(value) : value
    if (typeof value === 'bigint' && !isExact(value)) digits = { ...digits, [name]: String(value) }
  }
  if (digits) keepWhole(made, digits)
  return made
}

/**
 * Takes a row as a statement read it, and the row that was made of it under the same names. Answers the second,
 * with the digits that are kept beside the first kept beside it too.
 */
export function withWhole<Made extends object>(read: Read, made: Made): Made {
  const digits = wholeOf(read)
  if (digits) keepWhole(made, digits)
  return made
}

/**
 * The one home for the reading of rows. Takes a statement that only reads, and its values. Answers its rows. Where
 * SQLite answers a whole number that the runtime cannot hold exactly, as a very large sum or a column that holds
 * one, the runtime throws: the statement is then read once more with its whole numbers as large numbers, and each
 * is answered as the nearest number. A statement that writes is never handed here, since it would be carried out
 * twice.
 */
export function allRows(statement: StatementSync, values: SQLInputValue[]): Read[] {
  try {
    return statement.all(...values)
  } catch (error) {
    if (!isTooWide(error)) throw error
  }
  statement.setReadBigInts(true)
  try {
    return statement.all(...values).map(nearest)
  } finally {
    statement.setReadBigInts(false)
  }
}
