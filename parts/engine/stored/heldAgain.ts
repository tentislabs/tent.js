import type { FileName, Row } from '../../data/index.ts'
import { momentOf } from '../moment.ts'
import type { Opened } from '../opened.ts'
import { table as filesTable } from '../tables/files.ts'
import { table } from '../tables/holds.ts'
import { fileRow } from './files.ts'
import { filesIn, holdsOf, storesFiles } from './holds.ts'

const system = { kind: 'system' } as const

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** One hold as `_t_holds` keeps it, by its key. */
interface Hold {
  file: string
  tableName: string
  rowId: string
  column: string
  keptAt: string
}

const keyText = (hold: Hold): string =>
  JSON.stringify([hold.file, hold.tableName, hold.rowId, hold.column, hold.keptAt])

/** The tenant tables in the files of the tenants of one table, whose rows can hold a file. */
function tablesOf(o: Opened, tenants: string): string[] {
  return Object.entries(o.description.tables)
    .filter(([name, stored]) => {
      const column: unknown = Reflect.get(stored, 'tenant')
      const linked: unknown = typeof column === 'string' ? Reflect.get(Object(stored.columns), column) : undefined
      return Reflect.get(Object(linked), 'table') === tenants && storesFiles(o, name)
    })
    .map(([name]) => name)
}

/** Every hold that the rows of one tenant's file, and their kept earlier versions, make. */
function heldBy(o: Opened, tenant: FileName): Hold[] | undefined {
  const store = o.tenantFiles?.files.of(tenant)
  if (!store) return undefined
  const held: Hold[] = []
  const read = (plan: Parameters<typeof store.read>[0]): Row[] => {
    const rows: unknown = store.read(plan, system).value
    return Array.isArray(rows) ? rows.filter(isRow) : []
  }
  const there = new Set(store.layout().map((one) => one.name))
  for (const tableName of tablesOf(o, tenant.table)) {
    const columns: Record<string, unknown> = Object(o.description.tables[tableName].columns)
    const of = (row: Row, rowId: string, keptAt: string): void => {
      for (const [column, type] of Object.entries(columns))
        for (const one of filesIn(type, row[column], column))
          held.push({ file: one.id, tableName, rowId, column: one.field, keptAt })
    }
    if (there.has(tableName)) for (const row of read({ from: tableName })) of(row, String(row.id), '')
    if (!there.has('_t_history')) continue
    for (const version of read({ from: '_t_history', where: { col: 'tableName', is: tableName } })) {
      const at = momentOf(version.at)
      if (at !== undefined && isRow(version.value)) of(version.value, String(version.rowId), new Date(at).toISOString())
    }
  }
  return held
}

/**
 * Takes an app that keeps a data file for each tenant, and the file of one tenant that was just put back. Makes the
 * holds of that tenant those of the rows and the kept earlier versions that its file holds now: a hold that is not
 * there is written, and its file is held again from then on, neither loose nor removed; a hold of that tenant that
 * no row of the file makes any more is taken away, and a file that no row holds then is loose from that moment. A
 * file that is gone for good is held by nothing.
 */
export function heldAgain(o: Opened, tenant: FileName): void {
  const wanted = heldBy(o, tenant)
  if (!wanted) return
  const moment = new Date(o.clock.now())
  o.store.write((tx) => {
    const standing: unknown = tx.read({ from: table.name, where: { col: 'of', is: tenant.id } }, system)
    const had = new Map(
      (Array.isArray(standing) ? standing.filter(isRow) : []).map((row) => {
        const hold: Hold = {
          file: String(row.file),
          tableName: String(row.tableName),
          rowId: String(row.rowId),
          column: String(row.column),
          keptAt: String(row.keptAt ?? ''),
        }
        return [keyText(hold), hold]
      }),
    )
    const keys = new Set<string>()
    for (const hold of wanted) {
      if (!fileRow(o, hold.file, tx)) continue
      keys.add(keyText(hold))
      if (!had.has(keyText(hold))) tx.add(table.name, { ...hold, of: tenant.id }, system)
      tx.change(filesTable.name, hold.file, { looseAt: null, removedAt: null }, system)
    }
    for (const [key, hold] of had) {
      if (keys.has(key)) continue
      tx.remove(table.name, { ...hold }, system)
      if (!holdsOf(o, hold.file, tx).length && fileRow(o, hold.file, tx))
        tx.change(filesTable.name, hold.file, { looseAt: moment }, system)
    }
  })
}
