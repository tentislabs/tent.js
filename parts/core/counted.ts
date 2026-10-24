import { TentError } from './errors.ts'
import type { Filter } from './filter.ts'
import { filterOf } from './filter.ts'
import { isMarked, mark } from './mark.ts'

/** How a column that the engine keeps works its number out of the rows that link to its row. */
export type Keeping = 'count' | 'sum' | 'min' | 'max'

/**
 * What `count`, `sum`, `min` and `max` take for a kept column: the table of the rows, the link column of theirs, a
 * filter, and the column read.
 */
export interface Counted {
  of: string | { readonly definition: string }
  by: string
  where?: object
  column?: string
}

/** What a kept column holds of how it is kept, as the description stores it. */
export interface Keeps {
  do: Keeping
  of: string
  by: string
  column?: string
  where?: Filter
}

/** The value word that a kept count, sum, least or most is in the `from` of a column. */
export interface KeptWord {
  readonly keeps: Keeps
}

// What each value word of a kept column was made of, so that it is read back as it was made.
const words = new WeakMap<object, Keeps>()

/** Whether a value that `count`, `sum`, `min` or `max` is handed is the record of a kept column: one the author wrote, naming `by`. */
export const isCounted = (value: unknown): value is Counted =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !isMarked(value) &&
  'by' in value &&
  'of' in value

/**
 * Takes how a column is kept and what it reads. Answers the value word that a `from` takes for it: the engine
 * moves the number inside each write of a linked row. Throws T1014 for a sum, a least or a most that names no
 * column.
 */
export function countedWord(how: Keeping, o: Counted): KeptWord {
  const of = typeof o.of === 'string' ? o.of : o.of.definition
  if (how !== 'count' && typeof o.column !== 'string')
    throw new TentError('T1014', `A kept \`${how}\` of \`${of}\` names no \`column\` to read.`, {
      fix: `Write ${how}({ of: ${of}, by: '<its link column>', column: '<the column>' }).`,
    })
  const keeps: Keeps = {
    do: how,
    of,
    by: o.by,
    ...(how === 'count' ? {} : { column: o.column }),
    ...(o.where === undefined ? {} : { where: filterOf(o.where) }),
  }
  const word = mark({ keeps })
  words.set(word, keeps)
  return word
}

/** How a column is kept, where the `from` it was written with is the value word of a kept column. */
export const keptIn = (from: unknown): Keeps | undefined =>
  typeof from === 'object' && from !== null ? words.get(from) : undefined
