import type { Description } from '../core/internal.ts'
import { tableOf } from './model.ts'
import type { Row, Tx } from './store.ts'
import { historyTable } from './tables.ts'
import type { Filter } from './worked.ts'

const system = { kind: 'system' } as const

/**
 * Takes the write of one file, a description, the rows that the removal of people took away in that file, and the
 * ids of those people. Removes the kept earlier versions of those rows, and writes `removed` in place of each of
 * them in `by` of every version that names them.
 */
export function forgetPeople(
  tx: Tx,
  description: Description,
  gone: { table: string; id: string }[],
  people: Iterable<string>,
): void {
  const kept = (where: Filter): Row[] => {
    const rows = tx.read({ from: historyTable.name, where }, system)
    return Array.isArray(rows) ? rows : []
  }
  for (const row of gone)
    for (const version of kept({
      all: [
        // A version stands under the name its table had when it was kept.
        { col: 'tableName', in: [row.table, ...tableOf(description, row.table).was] },
        { col: 'rowId', is: row.id },
      ],
    }))
      tx.remove(historyTable.name, String(version.id), system)
  for (const person of people)
    for (const version of kept({ col: 'by', is: `user:${person}` }))
      tx.change(historyTable.name, String(version.id), { by: 'removed' }, system)
}
