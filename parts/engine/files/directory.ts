import type { FileName, Store, TableLayout, Tx } from '../../data/index.ts'
import type { Said } from './held.ts'

const system = { kind: 'system' } as const

/** `_t_tenants`: the directory of the data files of tenants, one row for each file. A table of this machine alone. */
export const directoryTable: TableLayout = {
  name: '_t_tenants',
  columns: {
    tableName: { kind: 'text' },
    rowId: { kind: 'text' },
    layout: { kind: 'text', optional: true },
    tables: { kind: 'json', optional: true },
    writes: { kind: 'number', whole: true, optional: true },
    lastId: { kind: 'text', optional: true },
    size: { kind: 'number', whole: true, optional: true },
    swept: { kind: 'text', optional: true },
    closedAt: { kind: 'date', optional: true },
    dueAt: { kind: 'date', optional: true },
    versions: { kind: 'json', optional: true },
    waits: { kind: 'json', optional: true },
    runs: { kind: 'number', whole: true },
    open: { kind: 'number', whole: true },
    failed: { kind: 'json', optional: true },
    fillAt: { kind: 'date', optional: true },
    fillsOf: { kind: 'text', optional: true },
    fills: { kind: 'json', optional: true },
  },
  key: ['tableName', 'rowId'],
  indexes: [],
  unique: [],
  search: [],
  own: true,
}

/** Why a file could not be brought up: the code of the error where it has one, and its words. */
export interface Failed {
  code?: string
  message: string
}

/** One row of the directory, as the engine reads it. */
export interface FileRow {
  file: FileName
  // The fingerprint of the layout that the file was last brought to, as the file says it.
  layout?: string
  tables: string[]
  // The number of the last write of the file.
  writes: number
  lastId?: string
  size: number
  swept?: string
  closedAt?: number
  open: boolean
  failed?: Failed
  // What the runner said of the runs of the file when it closed: when one must wake, the versions they are pinned to, the events they wait for.
  dueAt?: number
  versions?: string[]
  waits?: string[]
}

/** What the engine writes of one file: each field that is given, and nothing of the others. `failed: null` takes the mark away. */
export type RowFields = Partial<Omit<FileRow, 'file' | 'failed' | 'dueAt'>> & {
  failed?: Failed | null
  dueAt?: number | null
}

/** The fields of a row that a file says of itself: of a file that says nothing, no table and no write. */
export const saidFields = (said: Said | undefined): RowFields => ({
  tables: said?.tables ?? [],
  writes: said?.writes ?? 0,
  ...(said?.layout === undefined ? {} : { layout: said.layout }),
  ...(said?.swept === undefined ? {} : { swept: said.swept }),
  ...(said?.lastId === undefined ? {} : { lastId: said.lastId }),
})

const keyOf = (file: FileName): Record<string, unknown> => ({ tableName: file.table, rowId: file.id })

const isFailed = (value: unknown): value is Failed =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'message') === 'string'

/** One row as it is stored, read as the engine holds it. */
function rowOf(held: Record<string, unknown>): FileRow {
  const { layout, lastId, swept, closedAt, failed, dueAt, versions, waits } = held
  return {
    file: { table: String(held.tableName), id: String(held.rowId) },
    tables: Array.isArray(held.tables) ? held.tables.map(String) : [],
    writes: typeof held.writes === 'number' ? held.writes : 0,
    size: typeof held.size === 'number' ? held.size : 0,
    open: held.open === 1,
    ...(typeof layout === 'string' ? { layout } : {}),
    ...(typeof lastId === 'string' ? { lastId } : {}),
    ...(typeof swept === 'string' ? { swept } : {}),
    ...(closedAt instanceof Date ? { closedAt: closedAt.getTime() } : {}),
    ...(isFailed(failed) ? { failed } : {}),
    ...(dueAt instanceof Date ? { dueAt: dueAt.getTime() } : {}),
    ...(Array.isArray(versions) ? { versions: versions.map(String) } : {}),
    ...(Array.isArray(waits) ? { waits: waits.map(String) } : {}),
  }
}

/** Answers every row of the directory, in the order of the tables and the ids. */
export function rowsIn(shared: Store): FileRow[] {
  const rows = shared.read({ from: directoryTable.name }, system).value
  return (Array.isArray(rows) ? rows : [])
    .map(rowOf)
    .sort((a, b) => (`${a.file.table} ${a.file.id}` < `${b.file.table} ${b.file.id}` ? -1 : 1))
}

/** Answers the row of one file, or nothing where the directory holds none: a tenant with no file. */
export function directoryRowIn(on: Store | Tx, file: FileName): FileRow | undefined {
  const plan = { from: directoryTable.name, one: 'get' as const, id: keyOf(file) }
  const held: unknown = 'write' in on ? on.read(plan, system).value : on.read(plan, system)
  return typeof held === 'object' && held !== null && !Array.isArray(held) ? rowOf(Object(held)) : undefined
}

/** What the fields of a row are stored as. */
function stored(fields: RowFields): Record<string, unknown> {
  const { open, closedAt, failed, dueAt, versions, ...rest } = fields
  return {
    ...rest,
    ...(dueAt === undefined ? {} : { dueAt: dueAt === null ? null : new Date(dueAt) }),
    // Whether the file holds a run that has not ended.
    ...(versions === undefined ? {} : { versions, runs: versions.length ? 1 : 0 }),
    ...(open === undefined ? {} : { open: open ? 1 : 0 }),
    ...(closedAt === undefined ? {} : { closedAt: new Date(closedAt) }),
    ...(failed === undefined ? {} : { failed }),
  }
}

/** Writes the row of one file inside a write of the shared file: the fields that are given, into the row that is there or into a new one. */
export function setRow(tx: Tx, file: FileName, fields: RowFields): void {
  const values = stored(fields)
  if (directoryRowIn(tx, file)) {
    if (Object.keys(values).length) tx.change(directoryTable.name, keyOf(file), values, system)
    return
  }
  const { failed, ...rest } = values
  tx.add(directoryTable.name, { ...keyOf(file), runs: 0, open: 0, ...rest, ...(failed ? { failed } : {}) }, system)
}

// How many files are marked open in the directory by one write of the shared file, before they are handed over.
const marksAtOnce = 64

/**
 * Takes what writes the shared file, the files that are handed over next, and the fields of their marks. Marks the
 * first of them open, as many as one write marks, in one write that waits for the disk once. Answers those it marked.
 */
export function markedNext(
  write: (work: (tx: Tx) => void, toDisk: boolean) => void,
  next: FileName[],
  fields: RowFields = { open: true },
): FileName[] {
  const marked = next.slice(0, marksAtOnce)
  write((tx) => {
    for (const file of marked) setRow(tx, file, fields)
  }, true)
  return marked
}

/** Takes the row of one file away, inside a write of the shared file: its tenant has no file. */
export function removeRow(tx: Tx, file: FileName): void {
  if (directoryRowIn(tx, file)) tx.remove(directoryTable.name, keyOf(file), system)
}
