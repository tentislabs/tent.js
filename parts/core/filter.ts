import { TentError } from './errors.ts'
import { refuseFault } from './itself.ts'
import { isMarked } from './mark.ts'
import { asValue, writtenEntries, isWritten } from './written.ts'

/** The operators of a filter that hold a value. */
const operatorNames = [
  'above',
  'atLeast',
  'below',
  'atMost',
  'not',
  'in',
  'contains',
  'startsWith',
  'before',
  'after',
  'empty',
  'filled',
]

/** A filter as it is stored: one column held to a value, or filters joined. */
export type Filter =
  | { col: string; given?: true; [operator: string]: unknown }
  | { any: Filter[] }
  | { all: Filter[] }
  | { not: Filter }

/** Whether a written value is a record of operators: an object the author wrote, each of whose keys is an operator. */
const isOperators = (value: unknown): value is Record<string, unknown> =>
  isWritten(value) && !isMarked(value) && Object.keys(value).length > 0 && Object.keys(value).every(isOperator)

const isOperator = (name: string): boolean => operatorNames.includes(name)

/** Answers the filters of one column: one for a value that is held to equal, and one for each operator. */
function ofColumn(col: string, written: unknown): Filter[] {
  // An entry written with `given` is no part of the filter while its value holds nothing.
  if (isMarked(written) && 'given' in written) {
    // A record of `given` that was made to hold itself would be followed with no end.
    refuseFault(written)
    return ofColumn(col, written.given).map((filter) => ({ ...filter, given: true }))
  }
  if (!isOperators(written)) return [{ col, is: asValue(written) }]
  return writtenEntries(written).map(([operator, value]) =>
    isMarked(value) && 'given' in value
      ? { col, [operator]: asValue(value.given), given: true }
      : { col, [operator]: asValue(value) },
  )
}

const asList = (written: unknown): unknown[] => (Array.isArray(written) ? written : [written])

/**
 * Takes a filter as it is written: a record from a column to a value, which means "equals", or to a record of
 * operators, with `any`, `all` and `not` to join filters. Answers the filter as it is stored. Two operators on one
 * column, and several columns, are joined with `all`, in the order they were written. Throws T1014 for a filter
 * that holds itself, and for one that is nested more than 200 deep.
 */
export function filterOf(written: unknown): Filter {
  return joinedOf(written, new Set())
}

/**
 * Stores one written filter. `above` holds the filters it stands in, on the way from the top: the values of a
 * filter are held one by one where each is stored, and what is held here is how filters are joined.
 */
function joinedOf(written: unknown, above: Set<object>): Filter {
  if (!isWritten(written)) return { all: [] }
  if (above.has(written) || above.size >= 200)
    throw new TentError(
      'T1014',
      above.has(written)
        ? 'A value that holds itself cannot be stored.'
        : 'A value that is nested more than 200 deep cannot be stored.',
      {
        fix: 'Write the filter so that it does not hold itself, and joins no more than 200 filters inside each other.',
      },
    )
  above.add(written)
  const inner = (one: unknown): Filter => joinedOf(one, above)
  const filters: Filter[] = []
  for (const [key, value] of writtenEntries(written)) {
    if (key === 'any') filters.push({ any: asList(value).map(inner) })
    else if (key === 'all') filters.push({ all: asList(value).map(inner) })
    else if (key === 'not' && isWritten(value) && !isMarked(value)) filters.push({ not: inner(value) })
    else filters.push(...ofColumn(key, value))
  }
  above.delete(written)
  return filters.length === 1 ? filters[0] : { all: filters }
}
