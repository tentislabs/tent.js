import { mustBeHeld, isSealed } from '../keptType.ts'
import type { ColumnType, TableLayout } from '../store.ts'
import { q, quoted } from './names.ts'
import { searchSql } from './search.ts'

/** The type of a link column. */
type Link = Extract<ColumnType, { kind: 'link' }>

/**
 * Whether a link runs from a tenant's file into the shared file. Such a link is kept as the text id of its row:
 * a real link cannot cross two files.
 */
export const isShared = (type: ColumnType): boolean => type.kind === 'link' && 'shared' in type && type.shared === true

/** Whether a column holds the inside number of the row it links to: a link that is not sealed, inside one file. */
export const isRowLink = (type: ColumnType): type is Link => type.kind === 'link' && !type.sealed && !isShared(type)

/** Whether a column of a table is kept and no longer used: one that was retired, and every column of a retired table. */
export const isLoose = (layout: TableLayout, name: string): boolean =>
  layout.retired === true || layout.unused?.includes(name) === true

/** The columns that a table holds in its own rows, in their order: every one but a vector, a retired one among them. */
export const heldColumns = (layout: TableLayout): [string, ColumnType][] =>
  Object.entries(layout.columns).filter(([, type]) => type.kind !== 'vector')

/** The columns that a table holds in its own rows and still uses, in their order. */
export const columnsOf = (layout: TableLayout): [string, ColumnType][] =>
  heldColumns(layout).filter(([name]) => !layout.unused?.includes(name))

/** The vector columns of a table, each of which is kept in a table of its own. */
export const vectorColumns = (layout: TableLayout): string[] =>
  Object.keys(layout.columns).filter((name) => layout.columns[name].kind === 'vector')

/** The name of the table that keeps a vector column beside its table. */
export const vectorTable = (table: string, column: string): string => `${table}__${column}`

/** The statement that makes the table of a vector column: the inside number of the row, and the vector as raw bytes. */
export const vectorSql = (table: string, column: string): string =>
  `CREATE TABLE ${q(vectorTable(table, column))} ("_n" INTEGER PRIMARY KEY, "v" BLOB NOT NULL) STRICT`

/**
 * The kind of value that SQLite keeps for a column. A link that is kept and no longer used holds the text id of
 * its row, with no link between the two tables: the inside number of a removed row can be handed out again. So
 * does a link into the shared file.
 */
export function storedAs(type: ColumnType, loose = false): 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'LINK' {
  if (isSealed(type)) return 'TEXT'
  if (type.kind === 'number') return type.whole ? 'INTEGER' : 'REAL'
  if (type.kind === 'boolean' || type.kind === 'date') return 'INTEGER'
  if (type.kind === 'link') return loose || isShared(type) ? 'TEXT' : 'LINK'
  return type.kind === 'bytes' ? 'BLOB' : 'TEXT'
}

/** A column as the statement that makes its table writes it. One that is kept and no longer used may hold nothing. */
export function columnSql(name: string, type: ColumnType, loose = false): string {
  const stored = storedAs(type, loose)
  const kept = stored === 'LINK' && type.kind === 'link' ? `INTEGER REFERENCES ${q(type.table)} ("_n")` : stored
  return `${q(name)} ${kept}${mustBeHeld(type) && !loose ? ' NOT NULL' : ''}`
}

/** The name of an index of a table over some columns. */
const indexName = (table: string, columns: string[], unique = false): string =>
  `${table}__${unique ? 'u' : 'i'}__${columns.join('__')}`

/** The statement that makes an index of a table over some columns. */
export const indexSql = (table: string, columns: string[], unique = false): string =>
  `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${q(indexName(table, columns, unique))} ON ${q(table)} (${columns.map(q).join(', ')})`

/** The statement that takes an index of a table over some columns away. */
export const dropIndexSql = (table: string, columns: string[], unique = false): string =>
  `DROP INDEX IF EXISTS ${q(indexName(table, columns, unique))}`

const choiceName = (table: string, column: string, i: number): string => `${table}__choice__${column}__${i}`

/**
 * The check of a choice column: two triggers of the store and no part of the table, so that a value is added or
 * taken away with no rebuild. A sealed column holds text that the store cannot read, and has none.
 */
export function choiceSql(table: string, name: string, type: ColumnType): string[] {
  if (type.kind !== 'choice' || isSealed(type)) return []
  return ['INSERT', `UPDATE OF ${q(name)}`].map(
    (on, i) =>
      `CREATE TRIGGER ${q(choiceName(table, name, i))} BEFORE ${on} ON ${q(table)} ` +
      `WHEN new.${q(name)} IS NOT NULL AND new.${q(name)} NOT IN (${type.values.map(quoted).join(', ')}) ` +
      `BEGIN SELECT RAISE(ABORT, ${quoted(name)}); END`,
  )
}

/** The statements that take the check of a choice column away. */
export const dropChoiceSql = (table: string, name: string): string[] =>
  [0, 1].map((i) => `DROP TRIGGER IF EXISTS ${q(choiceName(table, name, i))}`)

/**
 * Takes the layout of a table, and the name it is made under where that is not its own. Answers the statement that
 * makes the table itself, with strict typing on. A table of an app has the inside number `_n` as its key, the text
 * `id` with a unique index, and the two moments every row has. A table that states `key` has exactly its own columns.
 */
export function createSql(layout: TableLayout, as = layout.name): string {
  const columns = heldColumns(layout).map(([name, type]) => columnSql(name, type, isLoose(layout, name)))
  const made = layout.key
    ? [...columns, `PRIMARY KEY (${layout.key.map(q).join(', ')})`]
    : [
        '"_n" INTEGER PRIMARY KEY',
        '"id" TEXT NOT NULL UNIQUE',
        '"createdAt" INTEGER NOT NULL',
        '"updatedAt" INTEGER NOT NULL',
        ...columns,
      ]
  // A table kept in memory lives in the temporary space of the connection, which no file and no backup holds.
  return `CREATE ${layout.memory ? 'TEMP ' : ''}TABLE ${q(as)} (${made.join(', ')}) STRICT`
}

/**
 * Takes the layout of a table. Answers the statements that make what stands beside it: an index for each link, each
 * entry of `indexes` and of `unique`, the checks of its choices, and its search index, but with `noSearch`. A
 * retired table has none of them, and an index that names a retired column is left out.
 */
export function besideSql(layout: TableLayout, noSearch = false): string[] {
  if (layout.retired) return []
  const used = (columns: string[]) => columns.every((name) => !layout.unused?.includes(name))
  // In a tenant's file every row holds the one tenant, so the tenant column has no index.
  const links = columnsOf(layout).filter(([name, type]) => type.kind === 'link' && name !== layout.tenant)
  return [
    ...links.map(([name]) => indexSql(layout.name, [name])),
    ...layout.indexes.filter(used).map((columns) => indexSql(layout.name, columns)),
    ...layout.unique.filter(used).map((columns) => indexSql(layout.name, columns, true)),
    ...columnsOf(layout).flatMap(([name, type]) => choiceSql(layout.name, name, type)),
    ...(noSearch ? [] : searchSql(layout)),
  ]
}

/** Takes the layout of a table. Answers the statements that make it whole: the table, the table of each vector column, and what stands beside it. */
export function tableSql(layout: TableLayout, noSearch = false): string[] {
  return [
    createSql(layout),
    ...vectorColumns(layout).map((column) => vectorSql(layout.name, column)),
    ...besideSql(layout, noSearch),
  ]
}
