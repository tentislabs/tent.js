import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { constants } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import { failed } from './failed.ts'
import { isOneStatement } from './statement.ts'

// What a raw text may do: read rows, with the functions and the repeats of a read, and add, change and remove them.
const reads: number[] = [
  constants.SQLITE_READ,
  constants.SQLITE_SELECT,
  constants.SQLITE_FUNCTION,
  constants.SQLITE_RECURSIVE,
]
const writes: number[] = [constants.SQLITE_INSERT, constants.SQLITE_UPDATE, constants.SQLITE_DELETE]

// What tells of the data file itself and of what stands in it, and of no row of the app: SQLite's own tables of its
// settings, and of its pages. https://sqlite.org/pragma.html#pragfunc https://sqlite.org/dbstat.html
const ofTheFile = (table: string): boolean => table.startsWith('pragma_') || ['dbstat', 'sqlite_dbpage'].includes(table)

const refused = (why: string): TentError =>
  new TentError('T0013', `A raw SQL text ${why}.`, {
    fix: 'Write one statement that reads, adds, changes or removes rows of the tables of the app.',
  })

/**
 * Takes the connection and a raw SQL text of an app. Answers the statement, compiled under SQLite's own
 * authorizer, and whether it writes rows. Throws T0013 for a text that holds anything after its first statement,
 * for one that names a table of the engine or reads what tells of the data file itself, and for every statement
 * that is no reading, adding, changing or removing of rows: one that begins or ends a write, a setting, another
 * file, and whatever makes, changes or drops a table, an index, a view or a trigger.
 */
export function guarded(db: DatabaseSync, text: string): { statement: StatementSync; writes: boolean } {
  if (!isOneStatement(text)) throw refused('must be one statement, with nothing after it but white space and comments')
  let asked = false
  let wrote = false
  let file = false
  db.setAuthorizer((action, first) => {
    const names = writes.includes(action) || action === constants.SQLITE_READ
    if (names && typeof first === 'string' && first.toLowerCase().startsWith('_t_')) return constants.SQLITE_DENY
    if (names && typeof first === 'string' && ofTheFile(first.toLowerCase())) {
      file = true
      return constants.SQLITE_DENY
    }
    if (!names && !reads.includes(action)) return constants.SQLITE_DENY
    // A statement that asks for none of these is none that reads or writes rows, as one that packs the file anew.
    asked ||= names || action === constants.SQLITE_SELECT
    wrote ||= writes.includes(action)
    return constants.SQLITE_OK
  })
  try {
    const statement = db.prepare(text)
    if (!asked) throw refused('must read or write rows, and do nothing else')
    // A raw text may answer a whole number that the runtime cannot hold exactly, and one that writes is carried
    // out once: so each is read as a large number, which whoever runs the statement answers as the nearest number.
    statement.setReadBigInts(true)
    return { statement, writes: wrote }
  } catch (error) {
    if (file) throw refused('reads what tells of the data file itself, and not of a row')
    // SQLite looks for a table before it asks the guard, so a table of the engine that the file does not hold yet
    // is refused here, by its name, as one that the file holds is refused by the guard.
    if (/no such table: (\w+\.)?_t_/i.test(error instanceof Error ? error.message : ''))
      throw refused('names a table of the engine')
    throw failed(error, '')
  } finally {
    db.setAuthorizer(null)
  }
}
