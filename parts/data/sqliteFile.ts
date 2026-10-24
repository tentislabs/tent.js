import { mkdirSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { StatementSync } from 'node:sqlite'
import { resolve, toNamespacedPath } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { TentError } from '../core/index.ts'
import { keptIn } from './kept.ts'

/** One SQLite file of a part that keeps tables of its own: statements with their values apart, and a write that is all or nothing. */
export interface SqliteFile {
  run(text: string, values: unknown[]): void
  all(text: string, values: unknown[]): object[]
  write<T>(fn: () => T): T
  close(): void
}

/** What a statement takes in the place of a value: text, a number, nothing, or bytes. */
type Bound = string | number | bigint | null | Uint8Array

/** A value as a statement takes it. True and false are stored as 1 and 0, and what is not set as nothing. */
function bound(value: unknown): Bound {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === null || value === undefined) return null
  throw new TypeError('a statement takes text, a number, true or false, nothing, or bytes')
}

// SQLite set up one way, for the store and for every file of a part: https://sqlite.org/pragma.html
// Write-ahead mode with a wait time, writes that do not wait for the disk, and the write-ahead file cut back to
// 4 MB once it was written back. A write that its program did not live to finish leaves the file whole.
const settings = [
  'PRAGMA busy_timeout = 5000',
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA journal_size_limit = 4194304',
]

/**
 * Takes the path of a file of SQLite, or SQLite's own name of a file in memory. Answers the path that SQLite is
 * handed: on Windows the whole path in the namespace of the files of the system, `\\?\C:\...`, which SQLite opens
 * past the 260 letters that a plain path of Windows holds, as the runtime does for its own files. Elsewhere the path.
 */
export const sqlitePath = (path: string): string =>
  path === '' || path === ':memory:' || path.startsWith('file:') ? path : toNamespacedPath(resolve(path))

/**
 * Takes the path of a file, or SQLite's own name of a file in memory. Answers the runtime's own SQLite on it, set up
 * as every file of ours is. Throws what SQLite throws for a file that is no SQLite file, with nothing left open.
 */
export function openSqlite(path: string): DatabaseSync {
  const db = new DatabaseSync(sqlitePath(path))
  try {
    for (const setting of settings) db.exec(setting)
  } catch (error) {
    db.close()
    throw error
  }
  return db
}

/**
 * Takes the path of a file, which is made with its folder where it is not there. Answers the runtime's own SQLite
 * on it: `run` carries a statement out, `all` answers its rows, each as a record by the names of its columns with
 * bytes as bytes, `write` carries a function out as one write that is kept whole or not at all, and answers what
 * the function answers, and `close` closes the file. A write inside a write is part of the outer one. Throws
 * T0009 with the words of SQLite where a statement fails.
 */
export function sqliteFile(path: string): SqliteFile {
  mkdirSync(dirname(path), { recursive: true })
  const db = openSqlite(path)
  const statements = new Map<string, StatementSync>()
  const statement = (text: string): StatementSync => keptIn(statements, text, () => db.prepare(text))
  const carried = <T>(work: () => T): T => {
    try {
      return work()
    } catch (error) {
      if (error instanceof TentError) throw error
      const words = error instanceof Error ? error.message : String(error)
      const thrown = new TentError('T0009', `The file ${basename(path)} failed: ${words}`)
      thrown.cause = error
      throw thrown
    }
  }
  let writing = false
  return {
    run: (text, values) => {
      carried(() => statement(text).run(...values.map(bound)))
    },
    all: (text, values) => carried(() => statement(text).all(...values.map(bound))),
    write(fn) {
      if (writing) return fn()
      carried(() => db.exec('BEGIN IMMEDIATE'))
      writing = true
      try {
        const answer = fn()
        carried(() => db.exec('COMMIT'))
        return answer
      } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK')
        throw error
      } finally {
        writing = false
      }
    },
    close: () => {
      if (db.isOpen) db.close()
    },
  }
}
