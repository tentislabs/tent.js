import type { Caller, Type } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { Filter } from './worked.ts'

/** A row as code sees it: its columns by name, with a column that holds nothing left out. */
export type Row = Record<string, unknown>

/**
 * A plan as a store is handed it: every value worked out, and each rule written into it as a filter. `linked`
 * holds, for each table whose rows a sort or a group reads through a link, what the caller may read of it: a
 * filter, or `false` for no row. A linked row that it leaves out is read as a row with no value.
 */
export type StorePlan = Plan & { linked?: Record<string, Filter | false> }

/** The rows that a plan answers. */
export type Rows = Row[]

/** Raw bytes. */
export type Bytes = Uint8Array

/** A column that holds raw bytes: a table of the engine's own may have one, and no type word makes it. */
export interface BytesType {
  kind: 'bytes'
  optional?: boolean
}

/** What a column of a layout holds: a type, or raw bytes. */
export type ColumnType = Type | BytesType

/**
 * One table as a store keeps it. `key` stands for a table whose key is not `id`. `unused` lists the columns that
 * are kept and no longer used, and `retired` says the same of the whole table. `own` marks a table of this machine
 * alone. `tenant` names the link column that says whose file a row lives in. `memory` marks a table whose rows live in
 * the memory of the store's connection alone: it is no part of the file, and is made anew each time the file is
 * opened. `lasts` is how long a row of it stays after its last write, in milliseconds. `walks` names the backfills
 * of the version over a tenant table: a file stands at the layout once they ran in it, and one that the version
 * makes needs none of them.
 */
export interface TableLayout {
  name: string
  columns: Record<string, ColumnType>
  key?: string[]
  indexes: string[][]
  unique: string[][]
  search: string[]
  by?: 'pieces'
  unused?: string[]
  retired?: true
  was?: string[]
  removed?: string[]
  own?: true
  tenant?: string
  memory?: true
  lasts?: number
  walks?: string[]
}

/**
 * One step of a table change. `layout` is the table that `addTable` makes, whole. `value` is what `addColumn`
 * gives the rows that are there, where the default of the column is `now` or `today`: the writer works it out once,
 * and it travels with the step, so that a reader fills what the writer filled.
 */
export interface TableStep {
  do:
    | 'addTable'
    | 'renameTable'
    | 'retireTable'
    | 'reviveTable'
    | 'dropTable'
    | 'addColumn'
    | 'renameColumn'
    | 'retireColumn'
    | 'reviveColumn'
    | 'dropColumn'
    | 'addIndex'
    | 'dropIndex'
    | 'addSearch'
    | 'addUnique'
    | 'require'
    | 'relax'
    | 'retype'
    | 'rebuild'
    | 'empty'
  table: string
  column?: string
  columns?: string[]
  from?: string
  to?: ColumnType
  layout?: TableLayout
  value?: unknown
}

/** What names one row: its text id, or the key of a row of a table whose key is not `id`. */
export type RowKey = string | number | Record<string, unknown>

/**
 * By whom a write was made, as the record of its change keeps it: the caller, written as a caller kept in one
 * column is, and the run the write was part of, where it was part of one.
 */
export interface By {
  caller: string
  run?: string
}

/** What a write may do. Each call is part of the one write it was made for. */
export interface Tx {
  read(plan: StorePlan, caller: Caller): unknown
  add(table: string, values: Row, caller: Caller): Row
  change(table: string, id: RowKey, values: Row, caller: Caller): Row
  remove(table: string, id: RowKey, caller: Caller): void
  sql(text: string, values: unknown[], touches?: string[]): unknown[]
  /** A raw text that may only read, also while a write is open: one that writes is T0012. */
  sqlRead(text: string, values: unknown[]): unknown[]
}

/** A write that was begun, and that whoever began it ends: by committing it, or by undoing it. */
export interface OpenWrite {
  tx: Tx
  /** Commits the write, and answers each table it touched with the ids of its rows. */
  commit(): { touched: { table: string; ids: string[] }[] }
  /** Undoes the write. `error` is what was thrown inside it, for a store that keeps a log of its own. */
  undo(error?: unknown): void
}

/** What one read answers: its value, and the tables it read. */
export interface ReadAnswer {
  value: Rows | Row | number | undefined
  tables: string[]
}

/** What one write answers: the value of its function, and each table it touched with the ids of its rows. */
export interface WriteAnswer<T> {
  value: T
  touched: { table: string; ids: string[] }[]
}

/** The small interface through which the data part talks to storage, so that the store can be swapped. */
export interface Store {
  open(folder: string, o?: { readOnly?: boolean; lazy?: boolean }): void
  close(): void
  read(plan: StorePlan, caller: Caller): ReadAnswer
  /** What the store's own plan of a read says it does, one line for each step: a store of another kind tells nothing. */
  explain?(plan: StorePlan): string[]
  /**
   * One write. `steps`: the write will hold table steps. `toDisk`: the write has reached the disk when the call
   * answers. `by`: by whom it is made, which the record of its change keeps.
   */
  write<T>(fn: (tx: Tx) => T, o?: { steps?: boolean; toDisk?: boolean; by?: By }): WriteAnswer<T>
  /**
   * A write that is begun and ended apart, for a write that is held to one file of a tenant and opens it in
   * its course. A store that does not offer it keeps no file for each tenant.
   */
  begin?(o?: { steps?: boolean; toDisk?: boolean }): OpenWrite
  layout(): TableLayout[]
  applyTableChanges(steps: TableStep[]): void
  snapshot(toFile: string): Promise<{ n: number }>
  forget(table: string): void
  sql?(text: string, values: unknown[]): unknown[]
  /** Runs the store's own optimiser, which the upkeep of the engine asks for daily. A store with none leaves it out. */
  optimize?(): void
  version(): { engine: string; layout: number }
  /**
   * SQLite's own count of the changes that other connections made to the file. It moves each time a connection
   * that is not this store's commits a write, and stays where it is while the store alone writes.
   */
  changes(): number
  /**
   * A store that can be copied to the readers of an app on many machines. `keep`: from this call on the store
   * records every write. `record` and `apply` are called inside a write. `record` answers the store's own record
   * of what the write did to the tables a record covers. `apply` puts one record into a store that holds every
   * write before it; `rows` are the rows the change names.
   */
  copy?: StoreCopy
}

/** The two halves of a store that can be copied. */
export interface StoreCopy {
  keep(): void
  record(): Bytes
  apply(record: Bytes, rows?: { table: string; kind: 'added' | 'changed' | 'removed'; row: Row }[]): void
}
