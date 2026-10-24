import {
  avg,
  between,
  calc,
  ceil,
  concat,
  contains,
  dayOf,
  each,
  earlier,
  floor,
  join,
  later,
  least,
  lower,
  max,
  min,
  most,
  range,
  round,
  slice,
  startsWith,
  sum,
  trim,
  upper,
  where,
} from '../../../core/index.ts'
import { valueOf } from '../../../core/internal.ts'
import { holdPart } from '../parts.ts'

/** The value words that a screen's arrows may hold, each the core's own: so a word means the same there as in a body. */
export const viewWords = {
  avg,
  between,
  calc,
  ceil,
  concat,
  contains,
  dayOf,
  each,
  earlier,
  floor,
  join,
  later,
  least,
  lower,
  max,
  min,
  most,
  range,
  round,
  slice,
  startsWith,
  sum,
  trim,
  upper,
  where,
}

/**
 * Takes the stored call of a value word in a screen's arrows, the names they were handed, and the zone of the page.
 * Answers what the word answers, worked out as the core works out the same call in a body: its values may read
 * those names, and the arrow of `each` holds the statements of a body.
 */
export const called = (stored: object, names: Record<string, unknown>, zone: string | undefined): unknown =>
  valueOf(stored, { names, ...(zone === undefined ? {} : { zone }) })

holdPart('values', { words: viewWords, called })
