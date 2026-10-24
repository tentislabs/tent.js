import type { Row } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table as filesTable } from '../tables/files.ts'
import { table } from '../tables/holds.ts'
import { fileRow, forgetFile } from './files.ts'
import { stands, tenantOf } from './holdsSwept.ts'

const system = { kind: 'system' } as const

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The key of a hold, as `_t_holds` keeps it. */
const keyOf = (hold: Row): Row => ({
  file: hold.file,
  tableName: hold.tableName,
  rowId: hold.rowId,
  column: hold.column,
  keptAt: hold.keptAt ?? '',
})

/**
 * The files' part of the removal of a person, after their rows are gone, in the files of tenants too. A hold of a
 * row that is no longer there, and of a kept earlier version that is no longer kept, is let go of. Then every file of the person that no row
 * holds is taken away for good, with its bytes where no other file has the same ones, and a file of theirs that a
 * row still holds says `removed` in place of the person.
 */
export async function forgetFilesOf(o: Opened, person: string): Promise<void> {
  const owner = `user:${person}`
  // The holds of rows of tenants that the pass of the removal took away: each file is opened to read them.
  const ofTenants = new Set<string>()
  const all = o.store.read({ from: table.name }, system).value
  for (const hold of Array.isArray(all) ? all.filter(isRow) : []) {
    const tenant = typeof hold.of === 'string' ? tenantOf(o, hold) : undefined
    const store = tenant && o.tenantFiles?.files.of(tenant)
    if (store && !stands((plan) => store.read(plan, system).value, hold)) ofTenants.add(JSON.stringify(keyOf(hold)))
  }
  const theirs = o.store.write((tx) => {
    const holds = tx.read({ from: table.name }, system)
    for (const hold of Array.isArray(holds) ? holds.filter(isRow) : []) {
      const [tableName, rowId, keptAt] = [String(hold.tableName), String(hold.rowId), String(hold.keptAt ?? '')]
      if (!Object.hasOwn(o.description.tables, tableName)) continue
      // A hold of a row of a tenant was read in the file of that tenant, before this write.
      if (typeof hold.of === 'string') {
        if (ofTenants.has(JSON.stringify(keyOf(hold)))) tx.remove(table.name, keyOf(hold), system)
        continue
      }
      const stands =
        keptAt === ''
          ? tx.read({ from: tableName, one: 'get', id: rowId }, system) !== undefined
          : Number(
              tx.read(
                {
                  from: '_t_history',
                  where: {
                    all: [
                      { col: 'tableName', is: tableName },
                      { col: 'rowId', is: rowId },
                    ],
                  },
                  count: true,
                },
                system,
              ),
            ) > 0
      if (stands) continue
      const { file, column } = hold
      tx.remove(table.name, { file, tableName, rowId, column, keptAt }, system)
    }
    const files = tx.read({ from: filesTable.name, where: { col: 'by', is: owner } }, system)
    const loose: string[] = []
    for (const file of Array.isArray(files) ? files.filter(isRow) : []) {
      const held = tx.read({ from: table.name, where: { col: 'file', is: String(file.id) }, count: true }, system)
      if (Number(held) > 0) tx.change(filesTable.name, String(file.id), { by: 'removed' }, system)
      else loose.push(String(file.id))
    }
    return loose
  }).value
  for (const id of theirs) {
    const file = fileRow(o, id)
    if (file) await forgetFile(o, file)
  }
}
