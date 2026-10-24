import type { FileName, Row, Store, Tx } from '../../data/index.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { table as filesTable } from '../tables/files.ts'
import { table } from '../tables/holds.ts'
import { fileRow } from './files.ts'
import { holdsOf } from './holds.ts'

const system = { kind: 'system' } as const

// How far apart the moment of a hold of a kept version and the moment that the version was kept may lie: the two
// are read of the clock in one write, one after the other.
const sameMoment = 1000

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What reads the rows that a hold names: the shared file in the write, or the file of a tenant that is open. */
export type HoldsReading = (plan: Parameters<Tx['read']>[0]) => unknown

/** Whether the row, or the kept version, that a hold names is still there. */
export function stands(read: HoldsReading, hold: Row): boolean {
  const [tableName, rowId, keptAt] = [String(hold.tableName), String(hold.rowId), String(hold.keptAt ?? '')]
  if (keptAt === '') return read({ from: tableName, one: 'get', id: rowId }) !== undefined
  const versions = read({
    from: '_t_history',
    where: {
      all: [
        { col: 'tableName', is: tableName },
        { col: 'rowId', is: rowId },
      ],
    },
  })
  const kept = Date.parse(keptAt)
  return (Array.isArray(versions) ? versions.filter(isRow) : []).some(
    (version) => Math.abs((momentOf(version.at) ?? Number.NaN) - kept) <= sameMoment,
  )
}

/** The file of the tenant whose row a hold names, where that table is a tenant table: by the table that its rows link to. */
export function tenantOf(o: Opened, hold: Row): FileName | undefined {
  const tableName = String(hold.tableName)
  const stored = Object.hasOwn(o.description.tables, tableName) ? o.description.tables[tableName] : undefined
  const column: unknown = Reflect.get(Object(stored), 'tenant')
  const linked: unknown = typeof column === 'string' ? Reflect.get(Object(stored?.columns), column) : undefined
  const to: unknown = Reflect.get(Object(linked), 'table')
  return typeof to === 'string' && typeof hold.of === 'string' ? { table: to, id: hold.of } : undefined
}

/**
 * Takes what the engine holds of an app. Takes away each hold whose row is not there: of the shared file, a hold
 * of a row that is gone and of a kept earlier version that is no longer kept, as a version that ages out leaves
 * one; and a hold of a row of a tenant whose file is open, as a stop between the hold and the row, or a write of
 * the tenant that was undone, leaves one. A file that no row holds then is loose from that moment. A hold of a
 * table that the app does not hold, and of a tenant whose file is closed, is left as it is. Answers how many it
 * took away.
 */
export function sweepHolds(o: Opened): number {
  const moment = new Date(o.clock.now())
  const open = new Map<string, Store>()
  for (const file of o.tenantFiles?.files.open() ?? []) {
    const store = o.tenantFiles?.files.of(file)
    if (store) open.set(`${file.table}\n${file.id}`, store)
  }
  // They are found by reading: where every hold stands, nothing is written.
  const shared = (plan: Parameters<Tx['read']>[0]): unknown => o.store.read(plan, system).value
  const holds = shared({ from: table.name })
  const gone: Row[] = []
  for (const hold of Array.isArray(holds) ? holds.filter(isRow) : []) {
    if (!Object.hasOwn(o.description.tables, String(hold.tableName))) continue
    if (typeof hold.of === 'string') {
      const tenant = tenantOf(o, hold)
      const store = tenant && open.get(`${tenant.table}\n${tenant.id}`)
      if (store && !stands((plan) => store.read(plan, system).value, hold)) gone.push(hold)
      continue
    }
    if (!stands(shared, hold)) gone.push(hold)
  }
  if (!gone.length) return 0
  return o.store.write((tx) => {
    for (const hold of gone) {
      const { file, tableName, rowId, column, keptAt } = hold
      tx.remove(table.name, { file, tableName, rowId, column, keptAt }, system)
    }
    for (const file of new Set(gone.map((one) => String(one.file))))
      if (!holdsOf(o, file, tx).length && fileRow(o, file, tx))
        tx.change(filesTable.name, file, { looseAt: moment }, system)
    return gone.length
  }).value
}
