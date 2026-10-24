// The digits of each whole number of a row that the runtime cannot hold exactly, by the row and by its column.
const kept = new WeakMap<object, Record<string, string>>()

/**
 * Takes a row that a store answered, and the digits of each of its whole numbers that no number of the runtime
 * holds exactly, by the name of its column. Keeps them beside the row, which itself holds the nearest number: the
 * mark of a page is made of them, so that the page after it goes on behind the number as the file holds it.
 */
export function keepWhole(row: object, digits: Record<string, string>): void {
  kept.set(row, digits)
}

/** Answers the digits that are kept beside a row, by the name of each column, or nothing where it holds no such number. */
export const wholeOf = (row: object): Record<string, string> | undefined => kept.get(row)

// The smallest and the largest whole number that SQLite holds: https://sqlite.org/datatype3.html
const [least, most] = [-(2n ** 63n), 2n ** 63n - 1n]

/** Whether a value is the digits of a whole number that SQLite holds, as the mark of a page writes one. */
export const isWhole = (digits: unknown): digits is string =>
  typeof digits === 'string' && /^-?\d{1,19}$/.test(digits) && BigInt(digits) >= least && BigInt(digits) <= most
