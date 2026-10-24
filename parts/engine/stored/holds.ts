import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Row, Tx, Wrote } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table as filesTable } from '../tables/files.ts'
import { table } from '../tables/holds.ts'
import type { StoredFile } from './files.ts'
import { fileRow } from './files.ts'
import { kindFits } from './kind.ts'
import { isStored } from '../../core/internal.ts'

const system = { kind: 'system' } as const

/** One file id that a value holds, with the type of the `file` it stands in. */
export interface FileHeld {
  id: string
  type: Record<string, unknown>
  // The dotted name of the field or the column, as a form writes it.
  field: string
}

/**
 * Takes a type as the description stores it, a value of it, and the name of its field. Answers every file id
 * that the value holds: of a `file`, and of a `file` inside a `list` or an `object`. An id inside a `json` value is
 * not seen.
 */
export function filesIn(type: unknown, value: unknown, field: string): FileHeld[] {
  if (!isStored(type) || value === undefined || value === null) return []
  if (type.kind === 'file') return typeof value === 'string' ? [{ id: value, type, field }] : []
  if (type.kind === 'list' && Array.isArray(value)) return value.flatMap((one) => filesIn(type.of, one, field))
  if (type.kind === 'object' && isStored(value) && isStored(type.shape))
    return Object.entries(type.shape).flatMap(([name, inner]) => filesIn(inner, value[name], `${field}.${name}`))
  return []
}

/** Whether a type is a `file`, or holds one inside a `list` or an `object`. */
function holdsFile(type: unknown): boolean {
  if (!isStored(type)) return false
  if (type.kind === 'file') return true
  if (type.kind === 'list') return holdsFile(type.of)
  return type.kind === 'object' && isStored(type.shape) && Object.values(type.shape).some(holdsFile)
}

// For the tables of each description, whether a row of the table can hold a file at all.
const storing = new WeakMap<object, Map<string, boolean>>()

/** Whether a row of a table can hold a file: a write of a table that cannot is told nothing of holds. */
export function storesFiles(o: Opened, tableName: string): boolean {
  let known = storing.get(o.description)
  if (!known) {
    known = new Map()
    storing.set(o.description, known)
  }
  let stores = known.get(tableName)
  if (stores === undefined) {
    const { tables } = o.description
    const columns: unknown = Object.hasOwn(tables, tableName) ? tables[tableName].columns : undefined
    stores = Object.values(Object(columns)).some(holdsFile)
    known.set(tableName, stores)
  }
  return stores
}

// For each description, the tables whose rows are tenants: those that a tenant table links to by its `tenant`.
const tenants = new WeakMap<object, Set<string>>()

/** Whether the rows of a table are tenants, each with a data file of its own. */
export function isTenants(o: Opened, tableName: string): boolean {
  let known = tenants.get(o.description)
  if (!known) {
    known = new Set()
    for (const one of Object.values(o.description.tables)) {
      const column: unknown = Reflect.get(one, 'tenant')
      const linked: unknown = typeof column === 'string' ? Reflect.get(Object(one.columns), column) : undefined
      const to: unknown = Reflect.get(Object(linked), 'table')
      if (typeof to === 'string') known.add(to)
    }
    tenants.set(o.description, known)
  }
  return known.has(tableName)
}

/**
 * Takes an app, the write of the shared file that removes the row of a tenant, and the id of the tenant. Removes
 * the holds of that tenant, in the same write: its rows go with its file, so nothing of it holds a file any
 * longer. A file that no other row holds is loose again from that moment.
 */
export function dropTenantHolds(o: Opened, tx: Tx, tenant: string): void {
  const held = tx.read({ from: table.name, where: { col: 'of', is: tenant } }, system)
  const moment = new Date(o.clock.now())
  for (const hold of Array.isArray(held) ? held : []) {
    const file = String(hold.file)
    tx.remove(
      table.name,
      keyOf(file, String(hold.tableName), String(hold.rowId), String(hold.column), String(hold.keptAt ?? '')),
      system,
    )
    if (!holdsOf(o, file, tx).length && fileRow(o, file, tx))
      tx.change(filesTable.name, file, { looseAt: moment }, system)
  }
}

/** The error of a file id that names no file, or one that the caller may not download: the two are told alike. */
export const noFile = (id: string): TentError =>
  new TentError('T2104', `No file has the id ${JSON.stringify(id).slice(0, 60)}.`, {
    fix: 'Name the id of a file that was uploaded, and that this caller may download.',
  })

/**
 * Holds a file to what the type of a field or of a column asks of it: its kinds and its most bytes. Answers the
 * name of the check that it fails, `values` for its kind and `max` for its size, or nothing where it fits.
 */
export function misfit(file: StoredFile, type: Record<string, unknown>): 'values' | 'max' | undefined {
  if (!kindFits(file.kind, type.kinds)) return 'values'
  return typeof type.maxSize === 'number' && file.size > type.maxSize ? 'max' : undefined
}

const keyOf = (
  file: string,
  tableName: string,
  rowId: string,
  column: string,
  keptAt: string,
): Record<string, string> => ({
  file,
  tableName,
  rowId,
  column,
  keptAt,
})

/** The tenant whose file a row of a table lives in, for a tenant table, and nothing for any other. */
function tenantOf(stored: unknown, row: Row | undefined): string | undefined {
  const column: unknown = Reflect.get(Object(stored), 'tenant')
  const tenant: unknown = typeof column === 'string' ? row?.[column] : undefined
  return typeof tenant === 'string' ? tenant : undefined
}

/** The rows that hold a file, as `_t_holds` keeps them. */
export function holdsOf(
  o: Opened,
  file: string,
  tx?: Tx,
): { tableName: string; rowId: string; column: string; keptAt: string; of?: string }[] {
  const plan = { from: table.name, where: { col: 'file', is: file } } as const
  const rows = tx ? tx.read(plan, system) : o.store.read(plan, system).value
  return (Array.isArray(rows) ? rows : []).map((row: Row) => ({
    tableName: String(row.tableName),
    rowId: String(row.rowId),
    column: String(row.column),
    keptAt: String(row.keptAt ?? ''),
    ...(typeof row.of === 'string' ? { of: row.of } : {}),
  }))
}

/** What the holding of the files of one written row needs: the write, its caller, and what says whether a caller may download a file. */
export interface HoldingWrite {
  o: Opened
  tx: Tx
  caller: Caller
  // Code with full access stores any file that is there.
  full: boolean
  // Putting a file into a row is held tighter than downloading it.
  mayPut(file: StoredFile): boolean
  // Where the holds stand in another file than the row: is handed what lets go of the files that the row stores
  // no more, to carry out in a write of its own once the write of the row is committed. Left out, the row lets go
  // in the same write.
  later?(letGo: (tx: Tx) => void): void
}

/**
 * Takes what the holding needs, and one row that a `db` added, changed or removed. Makes the row hold each file
 * that it stores in a `file` column, or in a `file` inside a `list` or an `object` column, in the same write, and
 * lets go of each that it stores no more: a file that no row holds any longer is loose again from that moment.
 * Where the table keeps earlier versions of its rows, the version that a change or a removal leaves holds its
 * files, with its time. Throws T2104 for an id that names no file, a removed one, and one that the caller may not
 * put into a row, unless the code has full access, and T2107 for a file that the type of its column does not take:
 * thrown inside the write, each undoes it.
 */
export function holdFiles(h: HoldingWrite, w: Wrote): void {
  const { o, tx } = h
  const stored = Object.hasOwn(o.description.tables, w.table) ? o.description.tables[w.table] : undefined
  const columns: Record<string, unknown> = Object(stored?.columns)
  const inRow = (row: Row | undefined): Map<string, FileHeld> => {
    const found = new Map<string, FileHeld>()
    if (row)
      for (const [column, type] of Object.entries(columns))
        for (const held of filesIn(type, row[column], column))
          found.set(`${column}\n${held.id}`, { ...held, field: column })
    return found
  }
  const [now, was] = [
    inRow(w.kind === 'removed' ? undefined : w.row),
    inRow(w.kind === 'added' ? undefined : (w.before ?? w.row)),
  ]
  if (!now.size && !was.size) return
  const rowId = String(w.row.id)
  const moment = new Date(o.clock.now())
  // A hold of a row of a tenant table names its tenant: the one file that holds the row.
  const tenant = tenantOf(stored, w.kind === 'removed' ? (w.before ?? w.row) : w.row)
  const of = tenant === undefined ? {} : { of: tenant }
  for (const [key, held] of now) {
    if (was.has(key)) continue
    const file = fileRow(o, held.id, tx)
    if (!file || file.removedAt !== undefined || !(h.full || h.mayPut(file))) throw noFile(held.id)
    const fails = misfit(file, held.type)
    if (fails)
      throw new TentError(
        'T2107',
        `The file ${held.id} does not fit \`${held.field}\` of \`${w.table}\`: ${fails === 'values' ? `its kind is ${file.kind}` : `it holds ${file.size} bytes`}.`,
        { fix: 'Store a file of a kind and a size that the type of the column takes.' },
      )
    const at = keyOf(held.id, w.table, rowId, held.field, '')
    if (tx.read({ from: table.name, one: 'get', id: at }, system) === undefined)
      tx.add(table.name, { ...at, ...of }, system)
    if (file.looseAt !== undefined) tx.change(filesTable.name, held.id, { looseAt: null }, system)
  }
  // A kept earlier version of the row holds the files that the row held then, under the time of that version.
  const keeps = stored?.keepHistory === true && w.kind !== 'added'
  const keptAt = keeps ? moment.toISOString() : ''
  for (const held of keeps ? was.values() : []) {
    const at = keyOf(held.id, w.table, rowId, held.field, keptAt)
    if (tx.read({ from: table.name, one: 'get', id: at }, system) === undefined)
      tx.add(table.name, { ...at, ...of }, system)
  }
  const gone = [...was].filter(([key]) => !now.has(key)).map(([, held]) => held)
  if (!gone.length) return
  /** Lets go of each file that the row stores no more. */
  const letGo = (at: Tx): void => {
    for (const held of gone) {
      const key = keyOf(held.id, w.table, rowId, held.field, '')
      if (at.read({ from: table.name, one: 'get', id: key }, system) !== undefined) at.remove(table.name, key, system)
      // The last row that held the file let go of it: it is loose again from this moment.
      if (!holdsOf(o, held.id, at).length && fileRow(o, held.id, at))
        at.change(filesTable.name, held.id, { looseAt: moment }, system)
    }
  }
  if (h.later) h.later(letGo)
  else letGo(tx)
}
