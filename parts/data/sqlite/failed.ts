import { TentError } from '../../core/index.ts'

/** What the runtime's SQLite reports of a failure: its own number, and its words. */
interface SqliteFailure {
  errcode: number
  message: string
}

const isFailure = (error: unknown): error is SqliteFailure =>
  error instanceof Error && 'errcode' in error && typeof error.errcode === 'number'

/** The columns that a message of SQLite names after its colon, without their table. */
const columnsOf = (message: string): string[] =>
  (message.split(': ')[1] ?? '').split(', ').map((name) => name.slice(name.indexOf('.') + 1))

/** Keeps the failure of SQLite with the error that is thrown for it, for whoever reads a trace. */
function from(cause: unknown, error: TentError): TentError {
  error.cause = cause
  return error
}

/**
 * Takes what an act of the store threw, the table it was for, and whether it removed a row. Answers the error that
 * the caller is thrown, which is always one of ours: one of ours as it is, a failure of SQLite as the code it
 * means, and anything else, as what the runtime throws for a value that it cannot hold, as T0009 with the words of
 * what was thrown and that as its cause.
 */
export function failed(error: unknown, table: string, removing = false): TentError {
  const turned = sqliteFailed(error, table, removing)
  if (turned instanceof TentError) return turned
  const words = error instanceof Error ? error.message : String(error)
  return from(error, new TentError('T0009', `The store failed: ${words}`))
}

/**
 * Takes what was thrown inside a write, the table it was for, and whether it removed a row. Answers a failure of
 * SQLite as the code it means, and anything else as it is: it is for the one place that also hands on what the
 * function of a write threw, which is no error of the store. The numbers are SQLite's own result codes:
 * https://sqlite.org/rescode.html
 */
export function sqliteFailed(error: unknown, table: string, removing = false): unknown {
  if (!isFailure(error)) return error
  const { errcode, message } = error
  // 23: the authorizer refused the statement.
  if (errcode === 23)
    return from(
      error,
      new TentError('T0013', 'A raw SQL text may only read, add, change or remove rows of the tables of the app.', {
        fix: 'Write one statement that reads or writes rows. Say an index with `indexes`, `search` or `from`.',
      }),
    )
  // 8, and the kinds of it: the connection was told to write nothing.
  if ((errcode & 255) === 8)
    return from(
      error,
      new TentError('T0012', 'A write was tried where only a read is allowed.', {
        fix: 'Write inside a change. Outside one, `db` and raw SQL only read.',
      }),
    )
  // 2067 and 1555: a unique index, or the key of a table.
  if (errcode === 2067 || errcode === 1555) {
    const columns = columnsOf(message)
    return from(
      error,
      new TentError('T2101', `A row of \`${table}\` with the same ${columns.join(', ')} is already there.`, {
        fields: Object.fromEntries(columns.map((name) => [name, 'unique'])),
      }),
    )
  }
  // 787: a link without its row. Removing a row, it is a row that still links to it.
  if (errcode === 787)
    return removing
      ? from(error, new TentError('T2102', `A row of \`${table}\` cannot be removed while other rows link to it.`))
      : from(error, new TentError('T2104', `A link of a row of \`${table}\` names a row that does not exist.`))
  // 1299: nothing for a required column. 3091: a value of another kind than the column holds.
  if (errcode === 1299 || errcode === 3091) {
    const [column] = columnsOf(message)
    return from(
      error,
      new TentError('T2107', `The value of \`${column}\` does not fit its column of \`${table}\`.`, {
        fields: { [column]: errcode === 1299 ? 'required' : 'type' },
      }),
    )
  }
  // 1811: the trigger that holds a choice to its values raised it, with the column as its words.
  if (errcode === 1811)
    return from(
      error,
      new TentError('T2107', `The value of \`${message}\` is none of the values of its column of \`${table}\`.`, {
        fields: { [message]: 'values' },
      }),
    )
  return from(error, new TentError('T0009', `The store failed: ${message}`))
}
