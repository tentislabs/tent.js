import type { DatabaseSync } from 'node:sqlite'
import type { TableLayout } from '../store.ts'
import { metaTable } from '../tables.ts'
import { tableSql } from './ddl.ts'

// The number of the way this store lays a file out, which each file holds from its making: one that holds a higher
// number was laid out by a newer store, and the engine does not open it.
export const shapeNumber = 1

const layoutKey = (table: string): string => `layout:${table}`

/** Answers the value that `_t_meta` holds under a key, or nothing. */
export function metaOf(db: DatabaseSync, key: string): unknown {
  const row = db.prepare('SELECT "value" FROM "_t_meta" WHERE "key" = ?').get(key)
  return typeof row?.value === 'string' ? JSON.parse(row.value) : undefined
}

/** Writes a value into `_t_meta` under a key, or takes the key away where the value is nothing. */
function setMeta(db: DatabaseSync, key: string, value: unknown): void {
  if (value === undefined) db.prepare('DELETE FROM "_t_meta" WHERE "key" = ?').run(key)
  else
    db.prepare(
      'INSERT INTO "_t_meta" ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"',
    ).run(key, JSON.stringify(value))
}

/** Writes down the layout of a table as the file now holds it, or takes it away for a table that is gone. */
export function keepLayout(db: DatabaseSync, table: string, layout: TableLayout | undefined): void {
  // A table kept in memory is no part of the file: it is made anew when the file is opened again.
  if (layout?.memory) return
  setMeta(db, layoutKey(table), layout)
}

/** Makes `_t_meta` in a file that has none, with the shape number and its own shape. */
export function makeMeta(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const sql of tableSql(metaTable)) db.exec(sql)
    setMeta(db, 'shapeNumber', shapeNumber)
    keepLayout(db, metaTable.name, metaTable)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Whether a file holds `_t_meta`: one that does not was never opened by a store. */
export const hasMeta = (db: DatabaseSync): boolean =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_t_meta'").get() !== undefined

/**
 * Answers the layout of each table the file holds, as the store wrote it down: SQLite's own list of tables cannot
 * say a `choice`, a `date` or a link.
 */
export function layoutsIn(db: DatabaseSync): TableLayout[] {
  return db
    .prepare(`SELECT "value" FROM "_t_meta" WHERE "key" LIKE 'layout:%' ORDER BY rowid`)
    .all()
    .map((row): TableLayout => JSON.parse(String(row.value)))
}
