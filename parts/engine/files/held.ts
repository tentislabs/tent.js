import { closeSync, openSync, readSync, renameSync, rmSync, statSync } from 'node:fs'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { FileName, Store } from '../../data/index.ts'
import { changesTable, hereTable } from '../../data/index.ts'
import { metaOf } from '../held.ts'
import { storedLimit } from '../limits.ts'

const system = { kind: 'system' } as const

/** One text for one file, by which the engine keeps what it holds of the files that are open. */
export const fileKeyOf = (file: FileName): string => `${file.table} ${file.id}`

/** The limits of the files of tenants, by their names. */
export type FileLimit = 'openFiles' | 'fileCloseAfter' | 'filesAtOnce' | 'upkeepEvery'

/** Answers a limit of the files of tenants: what the project states, as it is stored, or what holds where it states none. */
export const fileLimit = (description: Description, name: FileLimit): number => storedLimit(description, name)

/**
 * The count of removals that the shared file tells, as `<mark>.<count>`: a tenant's file is swept where it stands
 * at another. A shared file that removed no row which a file may link to tells `0.0`.
 */
export function toldCount(shared: Store): string {
  const held: unknown = metaOf(shared, 'removals')
  const [mark, count]: unknown[] = [Reflect.get(Object(held), 'mark'), Reflect.get(Object(held), 'count')]
  return `${typeof mark === 'string' ? mark : '0'}.${typeof count === 'number' ? count : 0}`
}

/** What one tenant's file says of itself: whose it is, where it stands, and what it holds. */
export interface Said {
  table?: string
  tenant?: string
  // The fingerprint of the layout it was last brought to.
  layout?: string
  swept?: string
  // The number of its last write.
  writes: number
  // The tables of the app that it holds, in the order of their names.
  tables: string[]
  // The highest id that a row of it holds.
  lastId?: string
}

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/**
 * Whether what a file says of itself names another table or another tenant than the place it lies at: such a file
 * is the file of nobody. A file that names no tenant yet and holds no row was just made, and lies where it was
 * made. One that names none and holds a row was made by no engine at that place, and is the file of nobody too.
 */
export const liesElsewhere = (
  said: { table?: unknown; tenant?: unknown; lastId?: unknown },
  file: FileName,
): boolean =>
  said.tenant === undefined ? said.lastId !== undefined : said.tenant !== file.id || said.table !== file.table

/**
 * What an open file says of the place it is for, as `liesElsewhere` asks it: its table and its tenant, and where
 * it names no tenant whether it holds a row, for which the file is asked.
 */
export function placeSaid(store: Store): { table?: unknown; tenant?: unknown; lastId?: unknown } {
  const tenant = metaOf(store, 'tenant')
  return tenant === undefined ? saidBy(store) : { table: metaOf(store, 'table'), tenant }
}

/** Moves a file that lies at the place of another tenant aside, beside that place, where nothing reads it. */
export function setAside(path: string): void {
  rmSync(`${path}.refused`, { recursive: true, force: true })
  renameSync(path, `${path}.refused`)
}

/** The first bytes of a file, by which a store tells its own files: nothing for what is no ordinary file. */
function beginning(path: string): string | undefined {
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return undefined
  const file = openSync(path, 'r')
  try {
    const bytes = Buffer.alloc(16)
    return bytes.subarray(0, readSync(file, bytes, 0, 16, 0)).toString('hex')
  } finally {
    closeSync(file)
  }
}

/**
 * Takes what lies at the place of a data file of a tenant, and the shared file of the same app. Answers whether
 * it may be a data file, by a look that opens no store: an ordinary file that begins as the shared file begins,
 * which the same store made, or that holds nothing. A folder is none, and neither are bytes of another kind.
 * What passes this look is a data file only where it also opens and says what it is.
 */
export function mayBeDataFile(path: string, shared: string): boolean {
  const begins = beginning(path)
  return begins !== undefined && (begins === '' || begins === beginning(shared))
}

/**
 * The highest id of a row in a table that a file holds and says nothing of: a table of the app that stands in the
 * file itself, and that its `_t_meta` does not list. A file that the engine made lists every table it holds, so
 * such a table was laid there by a hand. Nothing where the file holds none, or where its store gives no raw SQL.
 */
function unlistedId(store: Store, listed: string[]): string | undefined {
  if (!store.sql) return undefined
  const names = store
    .sql(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table'`, [])
    .map((row) => String(Reflect.get(Object(row), 'name')))
    .filter((name) => !name.startsWith('_t_') && !name.startsWith('sqlite_') && !listed.includes(name))
  let highest: string | undefined
  for (const name of names) {
    const [row] = store.sql(`SELECT "id" FROM "${name.replaceAll('"', '""')}" ORDER BY "id" DESC LIMIT 1`, [])
    const id = text(Reflect.get(Object(row), 'id'))
    if (id !== undefined && (highest === undefined || id > highest)) highest = id
  }
  return highest
}

/** Reads what a tenant's file says of itself, through its store. */
export function saidBy(store: Store): Said {
  const tables = store
    .layout()
    .map((one) => one.name)
    .filter((name) => !name.startsWith('_t_'))
    .sort()
  let lastId: string | undefined
  for (const name of tables) {
    const plan = { from: name, sort: [{ by: 'id', down: true as const }], limit: 1, pick: ['id'] }
    const rows = store.read(plan, system).value
    const id = Array.isArray(rows) ? text(rows[0]?.id) : undefined
    if (id !== undefined && (lastId === undefined || id > lastId)) lastId = id
  }
  const [table, tenant, layout, swept] = ['table', 'tenant', 'fingerprint', 'swept'].map((key) =>
    text(metaOf(store, key)),
  )
  // A file that names no tenant is asked for its rows as the file holds them, and not as it lists them.
  if (tenant === undefined && lastId === undefined) lastId = unlistedId(store, tables)
  const writes = metaOf(store, 'n')
  return {
    writes: typeof writes === 'number' ? writes : 0,
    tables,
    ...(table === undefined ? {} : { table }),
    ...(tenant === undefined ? {} : { tenant }),
    ...(layout === undefined ? {} : { layout }),
    ...(swept === undefined ? {} : { swept }),
    ...(lastId === undefined ? {} : { lastId }),
  }
}

/** The running fingerprint of one tenant's file, over the records of that file. */
export function sumOf(store: Store): string | undefined {
  if (!store.layout().some((one) => one.name === hereTable.name)) return undefined
  const row = store.read({ from: hereTable.name, one: 'get', id: 'sum' }, system).value
  return typeof row === 'object' && row !== null && !Array.isArray(row) ? text(row.value) : undefined
}

/**
 * Takes what makes a store, and where the data file of a tenant stands that nothing holds open. Answers its
 * running fingerprint, read alone: that of no bytes for a file whose writes were never kept.
 */
export function sumAt(make: () => Store, path: string): string {
  const store = make()
  store.open(path, { readOnly: true, lazy: true })
  try {
    return sumOf(store) ?? fingerprintOf(new Uint8Array())
  } finally {
    store.close()
  }
}

/** The bytes that a data file takes on the disk, with what SQLite keeps beside it while it is open. */
export function sizeOf(path: string): number {
  let bytes = 0
  for (const ending of ['', '-wal']) bytes += statSync(`${path}${ending}`, { throwIfNoEntry: false })?.size ?? 0
  return bytes
}

/** Whether SQLite left its two files beside a data file: a file that was closed in order has none. */
export const hasBeside = (path: string): boolean =>
  ['-wal', '-shm'].some((ending) => statSync(`${path}${ending}`, { throwIfNoEntry: false }) !== undefined)

/** The number and the `sum` of the newest change that a shared file keeps, or nothing where it keeps none. */
export function newestKept(shared: Store): { n: number; sum: string } | undefined {
  if (!shared.layout().some((one) => one.name === changesTable.name)) return undefined
  const plan = { from: changesTable.name, sort: [{ by: 'n', down: true as const }], limit: 1, pick: ['n', 'sum'] }
  const rows = shared.read(plan, system).value
  const [row] = Array.isArray(rows) ? rows : []
  return row ? { n: Number(row.n), sum: String(row.sum) } : undefined
}

/**
 * The first number that no kept change of a shared file holds, below a number that one holds: the commits of an
 * app are kept under numbers with none left out, so the shared file lost writes there. Nothing where none is missing.
 */
export function firstMissing(shared: Store): number | undefined {
  if (!shared.layout().some((one) => one.name === changesTable.name)) return undefined
  const rows = shared.read({ from: changesTable.name, sort: [{ by: 'n' }], pick: ['n'] }, system).value
  let before: number | undefined
  for (const row of Array.isArray(rows) ? rows : []) {
    const n = Number(row.n)
    if (before !== undefined && n > before + 1) return before + 1
    before = n
  }
  return undefined
}
