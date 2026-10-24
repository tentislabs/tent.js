import { sqlitePath } from '../../data/index.ts'
import { join } from 'node:path'
import type { StatementSync } from 'node:sqlite'
import { DatabaseSync } from 'node:sqlite'
import type { LogTable } from './tables.ts'
import { logTables } from './tables.ts'

/** A row of the log as it is read: its columns by their names, and `n`, its place among the rows of its table. */
type LogRow = Record<string, string | number | null>

/** The log of one app: a row is written into one of its tables, and the file is closed with the app. */
export interface Log {
  write(table: LogTable, row: Record<string, string | number | boolean | undefined>): void
  /** Writes many rows of one table in one write of the file: a write each would cost the disk each time. */
  writeAll(table: LogTable, rows: Record<string, string | number | boolean | undefined>[]): void
  /**
   * Answers rows of one table in the order they were written: those written at or after the moment `since`, those
   * after the place `after`, and of what is left the `newest` so many.
   */
  rows(table: LogTable, o?: { since?: number; after?: number; newest?: number }): LogRow[]
  /** Answers the rows of one table that were written in a trace, in the order they were written. */
  withTrace(table: LogTable, trace: string): LogRow[]
  /** Answers the trace that the log kept the first stretch of work of a run in, or nothing. */
  traceOfRun(run: string): string | undefined
  /** Answers the place of the row that was written last into a table, and 0 for a table that holds none. */
  last(table: LogTable): number
  /** Removes the rows of a table that were written before a moment, and answers how many. */
  dropBefore(table: LogTable, at: number): number
  /** Writes `removed` in place of a caller wherever the log names them, and answers how many rows it changed. */
  forget(callerId: string): number
  close(): void
}

const quoted = (name: string): string => `"${name}"`

// How many rows are written between two looks at the size of the log.
const lookEvery = 64

// The share of its cap at which the log is cut, which leaves room for what is written until the next look and for
// the file beside it; and the share it is cut down to, so that it is not cut at every look.
const cutAt = 0.8
const cutTo = 0.6

/**
 * Takes the data folder of an app, and the cap of its log in bytes. Opens `logs.db` there, which the engine alone
 * writes, and makes each table of the log that the file does not hold yet. Answers the log. A column that a row
 * does not name holds nothing. A log that has grown past its cap drops its oldest rows, and gives the room back.
 */
export function openLog(dataFolder: string, cap: number): Log {
  const file = new DatabaseSync(sqlitePath(join(dataFolder, 'logs.db')))
  // The log may lose its last moments at a power cut, and never waits for the disk: a call is not held up by it.
  // A file that gives room back piece by piece is asked for before its first table is made, as the store asks.
  file.exec('PRAGMA auto_vacuum = INCREMENTAL')
  file.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000')
  // The file beside the log, which holds its newest writes, is written into it often: it counts on the cap too.
  file.exec('PRAGMA wal_autocheckpoint = 16; PRAGMA journal_size_limit = 0')
  const names = Object.keys(logTables).filter((name): name is LogTable => name in logTables)
  for (const table of names) {
    const columns = Object.entries(logTables[table]).map(
      ([name, held]) => `${quoted(name)} ${held === 'number' ? 'INTEGER' : held === 'real' ? 'REAL' : 'TEXT'}`,
    )
    file.exec(`CREATE TABLE IF NOT EXISTS ${quoted(table)} (${columns.join(', ')}) STRICT`)
    // A log that an older engine made lacks the columns that came later: each is added at its end, holding nothing.
    const there = new Set(
      file
        .prepare(`SELECT name FROM pragma_table_info('${table}')`)
        .all()
        .map((row) => String(row.name)),
    )
    for (const [name, held] of Object.entries(logTables[table]))
      if (!there.has(name))
        file.exec(
          `ALTER TABLE ${quoted(table)} ADD COLUMN ${quoted(name)} ${held === 'number' ? 'INTEGER' : held === 'real' ? 'REAL' : 'TEXT'}`,
        )
  }
  // A trace is read by its id.
  file.exec('CREATE INDEX IF NOT EXISTS "spans_trace" ON "spans" ("trace")')
  /** A row as it is read: its columns by their names, a value of another kind than text or number as nothing. */
  const readRow = (row: Record<string, unknown>): LogRow => {
    const kept: LogRow = {}
    for (const [name, value] of Object.entries(row))
      kept[name] = typeof value === 'string' || typeof value === 'number' ? value : null
    return kept
  }
  const adds = new Map(
    names.map((table) => {
      const columns = Object.keys(logTables[table])
      const text = `INSERT INTO ${quoted(table)} (${columns.map(quoted).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      return [table, { columns, add: file.prepare(text) }] as const
    }),
  )
  const sizes = file.prepare('SELECT page_count * page_size AS "bytes" FROM pragma_page_count(), pragma_page_size()')
  const size = (): number => Number(sizes.get()?.bytes)
  /** Drops the oldest tenth of every table, again and again, until the file is well under its cap. */
  const held = (): void => {
    if (size() <= cap * cutAt) return
    for (let round = 0; round < 60 && size() > cap * cutTo; round++) {
      for (const table of names)
        file.exec(
          `DELETE FROM ${quoted(table)} WHERE rowid IN (SELECT rowid FROM ${quoted(table)} ORDER BY rowid LIMIT (SELECT count(*) / 10 + 1 FROM ${quoted(table)}))`,
        )
      file.exec('PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE)')
    }
  }
  let open = true
  let written = 0
  held()
  /** Adds one row to a table, its columns in their order: a yes or no as a number, and what it does not name as nothing. */
  const add = (
    into: { columns: string[]; add: StatementSync },
    row: Record<string, string | number | boolean | undefined>,
  ): void => {
    into.add.run(
      ...into.columns.map((name) => {
        const value = row[name]
        return typeof value === 'boolean' ? Number(value) : (value ?? null)
      }),
    )
  }
  /** Counts rows that were written, and looks at the size of the log once so many more have been. */
  const counted = (rows: number): void => {
    const before = Math.floor(written / lookEvery)
    written += rows
    if (Math.floor(written / lookEvery) > before) held()
  }
  return {
    write(table, row) {
      const into = adds.get(table)
      if (!open || !into) return
      add(into, row)
      counted(1)
    },
    writeAll(table, rows) {
      const into = adds.get(table)
      if (!open || !into || !rows.length) return
      file.exec('BEGIN')
      try {
        for (const row of rows) add(into, row)
        file.exec('COMMIT')
      } catch (error) {
        file.exec('ROLLBACK')
        throw error
      }
      counted(rows.length)
    },
    rows(table, o = {}) {
      if (!open || !adds.has(table)) return []
      const read = file.prepare(
        `SELECT rowid AS "n", * FROM ${quoted(table)} WHERE "at" >= ? AND rowid > ? ORDER BY rowid DESC LIMIT ?`,
      )
      return read
        .all(o.since ?? 0, o.after ?? 0, o.newest ?? -1)
        .map(readRow)
        .reverse()
    },
    withTrace(table, trace) {
      if (!open || !adds.has(table)) return []
      const read = file.prepare(`SELECT rowid AS "n", * FROM ${quoted(table)} WHERE "trace" = ? ORDER BY rowid`)
      return read.all(trace).map(readRow)
    },
    traceOfRun(run) {
      if (!open) return undefined
      const found = file
        .prepare(
          `SELECT "trace" FROM "spans" WHERE "kind" IN ('run', 'entry') AND "facts" LIKE ? ORDER BY rowid LIMIT 1`,
        )
        .get(`%"run":${JSON.stringify(run)}%`)
      return typeof found?.trace === 'string' ? found.trace : undefined
    },
    last(table) {
      if (!open || !adds.has(table)) return 0
      return Number(file.prepare(`SELECT coalesce(max(rowid), 0) AS "n" FROM ${quoted(table)}`).get()?.n)
    },
    dropBefore(table, at) {
      if (!open || !adds.has(table)) return 0
      return Number(file.prepare(`DELETE FROM ${quoted(table)} WHERE "at" < ?`).run(at).changes)
    },
    forget(callerId) {
      if (!open) return 0
      let changed = 0
      for (const table of ['calls', 'denied'])
        changed += Number(
          file.prepare(`UPDATE ${quoted(table)} SET "callerId" = 'removed' WHERE "callerId" = ?`).run(callerId).changes,
        )
      // A model call names its caller as the data part writes a caller: `user:<id>`.
      changed += Number(
        file.prepare(`UPDATE "modelCalls" SET "caller" = 'removed' WHERE "caller" = ?`).run(`user:${callerId}`).changes,
      )
      return changed
    },
    close() {
      if (!open) return
      held()
      file.close()
      open = false
    },
  }
}
