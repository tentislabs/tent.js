import type { Row, Store, Tx } from '../../data/index.ts'
import { historyTable } from '../../data/index.ts'

const system = { kind: 'system' } as const

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

const ofTable = (table: string) => ({ from: historyTable.name, where: { col: 'tableName', is: table } })

/**
 * Takes a store, the name of a table, and the ids of rows of it where not all are meant. Answers the kept earlier
 * versions of those rows, as the store holds them: none where the store never kept one.
 */
export function keptVersionsOf(store: Store | undefined, table: string, ids?: Set<string>): Row[] {
  if (!store?.layout().some((one) => one.name === historyTable.name)) return []
  const kept = rowsOf(store.read(ofTable(table), system).value)
  return ids ? kept.filter((one) => ids.has(String(one.rowId))) : kept
}

/** Adds kept earlier versions where their rows go, inside a write, each as it was kept: with its id and its moment. */
export function addKept(tx: Tx, kept: Row[]): void {
  for (const one of kept) tx.add(historyTable.name, one, system)
}

/** Removes every kept earlier version of the rows of a table, inside a write of the place that the rows left. */
export function dropKept(tx: Tx, table: string): void {
  let kept: Row[]
  try {
    kept = rowsOf(tx.read(ofTable(table), system))
  } catch {
    // A file that never kept a version holds no table for them.
    return
  }
  for (const one of kept) tx.remove(historyTable.name, String(one.id), system)
}
