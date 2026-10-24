import { TentError } from './errors.ts'
import type { Seeing } from './itself.ts'
import { refuseFault } from './itself.ts'
import { isMarked } from './mark.ts'
import { planOf } from './planOf.ts'

/** Whether a value is an object that the author wrote in place: no list, no moment, nothing that a class made. */
export function isWritten(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const made = Object.getPrototypeOf(value)
  return made === Object.prototype || made === null
}

// A thing that a word of ours made is taken as it is: it counts for the depth as a number does.
const intoWritten: Seeing = (one) =>
  typeof one === 'object' && one !== null && !isMarked(one) && !planOf(one) ? one : undefined

/**
 * Takes a value as it was written where a value may stand. Answers it as it is stored: a record that a word of ours
 * made as it is, a plan as its record, a moment as text in the standard form, a list entry by entry, and an object
 * the author wrote as the list of its entries in the order they were written, with one that holds nothing left out.
 * Anything else is answered as it is. Throws T1014 for a value that holds itself, and for one that is nested more
 * than 200 deep: no stored form can hold either.
 */
export function asValue(written: unknown): unknown {
  refuseFault(written, intoWritten)
  return storedOf(written)
}

/** Stores one written value, which holds no fault. */
function storedOf(written: unknown): unknown {
  if (written instanceof Date) return Number.isNaN(written.getTime()) ? written : written.toISOString()
  if (isMarked(written)) return written
  const plan = planOf(written)
  if (plan) return plan
  if (!Array.isArray(written) && !isWritten(written)) return written
  return Array.isArray(written)
    ? written.map(storedOne)
    : { object: writtenEntries(written).map(([key, value]) => [key, storedOf(value)]) }
}

const storedOne = (written: unknown): unknown => storedOf(written)

/** Answers the entries of a written object that hold something, in the order they were written. */
export const writtenEntries = (written: Record<string, unknown>): [string, unknown][] =>
  Object.entries(written).filter(([, value]) => value !== undefined)

/** Takes a record of written values by name. Answers the record of the stored values, with nothing left out of it but what holds nothing. */
export function asValues(written: Record<string, unknown>): Record<string, unknown> {
  if (typeof written !== 'object' || written === null || Array.isArray(written))
    throw new TentError(
      'T1014',
      'A record of values by their names is needed where a row or the values of a word are written.',
      {
        fix: 'Write the values as a record, as { name: value }.',
      },
    )
  return Object.fromEntries(writtenEntries(written).map(([key, value]) => [key, asValue(value)]))
}
