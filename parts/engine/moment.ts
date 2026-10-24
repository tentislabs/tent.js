/**
 * A moment of a row in milliseconds, however a read handed it: as a date, as its text, or as its number. Nothing for
 * a value that holds no moment.
 */
export function momentOf(value: unknown): number | undefined {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : undefined
}
