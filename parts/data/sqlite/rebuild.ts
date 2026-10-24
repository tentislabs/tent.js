import type { DatabaseSync } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import { valueOf } from '../../core/internal.ts'
import { mustBeHeld, isSealed } from '../keptType.ts'
import type { ColumnType, TableLayout } from '../store.ts'
import { besideSql, createSql, heldColumns, isLoose, storedAs } from './ddl.ts'
import { workedOut } from './from.ts'
import { q } from './names.ts'
import { dropSearchSql } from './search.ts'
import { rowOf, shapeOf } from './shape.ts'
import { toStored } from './values.ts'
import { allRows, isExact } from './wide.ts'

/** What a rebuild works on: the connection, and the layout of each table as the file holds it. */
export interface Stepping {
  db: DatabaseSync
  layouts: Map<string, TableLayout>
  // The store keeps no search index: a searcher of the builder's own is connected.
  noSearch?: boolean
}

/** How a rebuild carries the rows over. `from`: the old name of a column that goes on under a new one. `blank`: the columns whose values are written anew by whoever asked. */
export interface Carried {
  from?: Record<string, string>
  blank?: string[]
}

// The name a table is built under before it takes the place of the old one: no table of an app can have it.
const building = (table: string): string => `${table}:new`

// How many rows are worked out between two reads, while a column with `from` is filled.
const batch = 1000

/** What a column holds for a row whose value is written after the copy: the empty value of its kind. */
function emptyOf(type: ColumnType, loose: boolean): string {
  const stored = storedAs(type, loose)
  if (stored === 'TEXT' && !isSealed(type)) {
    if (type.kind === 'list') return "'[]'"
    if (type.kind === 'object' || type.kind === 'json') return "'null'"
  }
  if (stored === 'TEXT') return "''"
  return stored === 'BLOB' ? "x''" : '0'
}

/** A value that is worked out in code after the copy: the rows that hold one, and what each becomes. */
interface Later {
  name: string
  source: string
  type: ColumnType
  turn(value: unknown): unknown
}

/** A number as text, as JavaScript writes it. */
const asText = (value: unknown): unknown => valueOf({ concat: [value] })

/** A text as the number it reads as. Throws T2107 for one that reads as none. */
function asNumber(table: string, name: string): (value: unknown) => number {
  return (value) => {
    const read = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
    if (!Number.isFinite(read))
      throw new TentError('T2107', `A value of \`${name}\` of \`${table}\` does not read as a number.`, {
        fields: { [name]: 'type' },
      })
    return read
  }
}

/**
 * The one routine that builds a table anew. Takes the connection with the layouts, the layout the file holds of
 * the table, the layout it is to have, and how the rows are carried. It makes the new table, copies every row with
 * its inside number, so that each link to it stays whole, turns what a column holds where the kind it is kept as
 * changed, drops the old table, gives the new one its name, makes what stands beside it, and works every column
 * with `from` out. A number becomes text as JavaScript writes it, a text the number it reads as, a link that is
 * retired the text id of its row, and one that is revived the link again, or nothing where its row is gone. It runs
 * inside a write that said it holds table steps: SQLite drops a table that others link to only while its check of
 * links is off. Throws T2107 for a row that the new table does not take.
 */
export function rebuild(work: Stepping, old: TableLayout, next: TableLayout, carried: Carried = {}): void {
  const { db } = work
  const table = old.name
  const made = building(table)
  const rowid = '"_rowid_"'
  const later: Later[] = []

  const copied = heldColumns(next).map(([name, type]): [string, string] => {
    const source = carried.from?.[name] ?? name
    const before = old.columns[source]
    const loose = isLoose(next, name)
    // A column with `from` is worked out once the table stands.
    if ('from' in type && type.from !== undefined && !loose)
      return [name, mustBeHeld(type) ? emptyOf(type, loose) : 'NULL']
    if (!before || before.kind === 'vector') return [name, 'NULL']
    const held = `"o".${q(source)}`
    const empty = `CASE WHEN ${held} IS NULL THEN NULL ELSE ${emptyOf(type, loose)} END`
    if (carried.blank?.includes(name)) return [name, empty]
    const [was, is] = [storedAs(before, isLoose(old, source)), storedAs(type, loose)]
    if (was === is) return [name, held]
    if (before.kind === 'link' && was === 'LINK')
      return [name, `(SELECT "id" FROM ${q(before.table)} WHERE "_n" = ${held})`]
    if (type.kind === 'link' && is === 'LINK') return [name, `(SELECT "_n" FROM ${q(type.table)} WHERE "id" = ${held})`]
    if (before.kind === 'number' && type.kind === 'text') {
      later.push({ name, source, type, turn: asText })
      return [name, empty]
    }
    if (before.kind === 'text' && type.kind === 'number') {
      later.push({ name, source, type, turn: asNumber(table, name) })
      return [name, empty]
    }
    return [name, `CAST(${held} AS ${is})`]
  })
  const every: [string, string][] = [
    ...(next.key
      ? []
      : ['_n', 'id', 'createdAt', 'updatedAt'].map((name): [string, string] => [name, `"o".${q(name)}`])),
    ...copied,
  ]

  db.exec(createSql(next, made))
  db.exec(
    `INSERT INTO ${q(made)} (${every.map(([name]) => q(name)).join(', ')}) ` +
      `SELECT ${every.map(([, from]) => from).join(', ')} FROM ${q(table)} AS "o" ORDER BY "o".${rowid}`,
  )
  for (const { name, source, type, turn } of later) {
    const write = db.prepare(`UPDATE ${q(made)} SET ${q(name)} = ? WHERE ${rowid} = ?`)
    const read = db.prepare(
      `SELECT ${rowid} AS "r", ${q(source)} AS "v" FROM ${q(table)} WHERE ${q(source)} IS NOT NULL`,
    )
    // A whole number that the runtime cannot hold is read as it stands, and becomes the text of its digits.
    read.setReadBigInts(true)
    for (const row of read.iterate()) {
      const held = typeof row.v === 'bigint' && isExact(row.v) ? Number(row.v) : row.v
      write.run(toStored(type, typeof held === 'bigint' ? String(held) : turn(held), table, name), row.r)
    }
  }
  for (const sql of dropSearchSql(table)) db.exec(sql)
  db.exec(`DROP TABLE ${q(table)}`)
  db.exec(`ALTER TABLE ${q(made)} RENAME TO ${q(table)}`)
  for (const sql of besideSql(next, work.noSearch)) db.exec(sql)
  work.layouts.set(table, next)
  workFrom(db, next)
}

/** Works every column with `from` of a table out, for each row it holds, a batch of rows at a time. */
function workFrom(db: DatabaseSync, layout: TableLayout): void {
  const shape = shapeOf(layout)
  if (!shape.worked.length || layout.retired) return
  const table = q(layout.name)
  const names = shape.worked.map((one) => one.name)
  const write = db.prepare(
    `UPDATE ${table} SET ${names.map((name) => `${q(name)} = ?`).join(', ')} WHERE "_rowid_" = ?`,
  )
  const read = db.prepare(
    `SELECT ${table}."_rowid_" AS "_rowid_", ${shape.select.slice('SELECT '.length)} WHERE ${table}."_rowid_" > ? ORDER BY ${table}."_rowid_" LIMIT ${batch}`,
  )
  let last = 0
  for (;;) {
    const rows = allRows(read, [last])
    for (const row of rows) {
      const made = workedOut(shape.worked, rowOf(shape, row))
      last = Number(row._rowid_)
      write.run(...names.map((name) => toStored(shape.types[name], made[name], layout.name, name)), last)
    }
    if (rows.length < batch) return
  }
}
