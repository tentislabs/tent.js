import { TentError } from '../../core/index.ts'
import { readByName } from '../rooms/callables.ts'

/** The error of work that fills a column and reads the store: what it was handed is all its value may rest on. */
export const readsInFill = (what: string): TentError =>
  new TentError(
    'T0013',
    `${what} reads the store inside the work of a filled column, which is handed all it may read.`,
    {
      fix: 'Name what the work needs in `input` of the `by`, or write the column from a flow on `table.changed`.',
    },
  )

/** The `db` of work that fills a column: each of its members is refused with T0013, also in a room that crosses. */
export const refusingDb = (): object =>
  readByName(
    new Proxy(
      {},
      {
        // A symbol is asked of any object, by the runtime itself, and is none of the members.
        get: (_, name) => {
          if (typeof name === 'symbol') return undefined
          throw readsInFill(`db.${name}`)
        },
      },
    ),
  )
