import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { TentError } from '../../core/index.ts'
import type { IdMaker } from '../ids.ts'
import type { ColumnType, Row, TableLayout } from '../store.ts'
import { vectorFrom } from '../vector.ts'
import type { VectorCopy } from './copy.ts'
import { columnsOf, isRowLink, vectorTable } from './ddl.ts'
import type { Worked } from './from.ts'
import { workedColumns } from './from.ts'
import { q } from './names.ts'
import { fromStored } from './values.ts'

/**
 * What the store works a table by: its layout, the columns its rows hold, the type of each name a row has, those
 * names in their order, and the two statements that every write of a row needs, written once.
 */
export interface Shape {
  layout: TableLayout
  columns: [string, ColumnType][]
  types: Record<string, ColumnType>
  names: string[]
  // The vector columns the table uses, each with how many numbers it holds: they are kept in tables of their own.
  vectors: Record<string, number>
  worked: Worked[]
  insert: string
  select: string
}

/** What an open store holds, for the files that read and write its rows. */
export interface Held {
  db: DatabaseSync
  ids: IdMaker
  /** Answers the compiled statement of a text of the store's own, which is kept. */
  statement(sql: string): StatementSync
  /** Answers the shape of a table. Throws T0009 for a table the file does not hold. */
  shape(table: string): Shape
  /** Answers the copy of the vectors of a column, which a store that only reads makes for the one search. */
  copy(table: string, column: string): VectorCopy
  /** Answers the inside numbers of the rows of a table that the write under way added: the copy holds no vector of theirs. */
  fresh(table: string): ReadonlySet<number> | undefined
  /** Holds that the search index of a table is there, and makes it where it is not. Throws T0009 for a store that keeps none. */
  indexed(table: string): void
}

// What every row of a table of an app has beside its columns.
const everyRow: Record<string, ColumnType> = {
  id: { kind: 'text' },
  createdAt: { kind: 'date' },
  updatedAt: { kind: 'date' },
}

/** Takes the layout of a table. Answers its shape. */
export function shapeOf(layout: TableLayout): Shape {
  const columns = columnsOf(layout)
  const types = { ...(layout.key ? {} : everyRow), ...Object.fromEntries(columns) }
  const names = Object.keys(types)
  const table = q(layout.name)
  const vectors = Object.fromEntries(
    Object.entries(layout.columns).flatMap(([name, type]): [string, number][] =>
      type.kind === 'vector' && !layout.unused?.includes(name) ? [[name, type.size]] : [],
    ),
  )
  const worked = workedColumns(columns)
  const shape: Shape = { layout, columns, types, names, vectors, worked, insert: '', select: '' }
  shape.insert = `INSERT INTO ${table} (${names.map(q).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
  shape.select = `SELECT ${selected(shape, table)} FROM ${table}`
  return shape
}

/** The error for a table that the file does not hold. */
export const noTable = (table: string): TentError => new TentError('T0009', `The store holds no table \`${table}\`.`)

/**
 * Takes a shape, the name its rows are read under, and the names to read, every one where none are given. Answers
 * what a statement reads of each row: each column under its own name, and a link as the text id of the row it
 * points to, since the inside number never leaves the store.
 */
export function selected(shape: Shape, rows: string, names: string[] = Object.keys(shape.types)): string {
  return names
    .map((name) => {
      const type = shape.types[name]
      if (Object.hasOwn(shape.vectors, name))
        return `(SELECT "v" FROM ${q(vectorTable(shape.layout.name, name))} WHERE "_n" = ${rows}."_n") AS ${q(name)}`
      return type && isRowLink(type)
        ? `(SELECT "id" FROM ${q(type.table)} WHERE "_n" = ${rows}.${q(name)}) AS ${q(name)}`
        : `${rows}.${q(name)}`
    })
    .join(', ')
}

/** A vector as code holds it, where a statement read one of the vector columns of the table. */
const vectorIn = (shape: Shape, name: string, stored: unknown): number[] | undefined =>
  Object.hasOwn(shape.vectors, name) && stored instanceof Uint8Array ? Array.from(vectorFrom(stored)) : undefined

/** Takes a shape and a row as a statement read it. Answers the row as code sees it, with a column that holds nothing left out. */
export function rowOf(shape: Shape, read: Record<string, unknown>): Row {
  const row: Row = {}
  for (const [name, stored] of Object.entries(read)) {
    const type = shape.types[name]
    const value = type ? fromStored(type, stored) : vectorIn(shape, name, stored)
    if (value !== undefined) row[name] = value
  }
  return row
}
