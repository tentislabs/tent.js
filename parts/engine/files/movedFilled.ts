import type { Row, Store, Tx } from '../../data/index.ts'
import { table as filled } from '../tables/filled.ts'

const system = { kind: 'system' } as const

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

const ofTable = (table: string) => ({ from: filled.name, where: { col: 'tableName', is: table } })

/**
 * Takes a store, the name of a table, and the ids of rows of it where not all are meant. Answers the rows of
 * `_t_filled` of those rows, which move with them: none where the store holds no such table.
 */
export function filledOf(store: Store | undefined, table: string, ids?: Set<string>): Row[] {
  if (!store?.layout().some((one) => one.name === filled.name)) return []
  const rows = rowsOf(store.read(ofTable(table), system).value)
  return ids ? rows.filter((one) => ids.has(String(one.rowId))) : rows
}

/**
 * Writes rows of `_t_filled` where their rows go, inside a write, each as it stood: in place of the mark that the
 * adding of its row made there, so a value that was made is not made again.
 */
export function addFilled(tx: Tx, rows: Row[]): void {
  for (const one of rows) {
    const { tableName, rowId, columnName, ...rest } = one
    const key = { tableName, rowId, columnName }
    if (tx.read({ from: filled.name, one: 'get', id: key }, system) === undefined) tx.add(filled.name, one, system)
    else tx.change(filled.name, key, rest, system)
  }
}

/** Removes every row of `_t_filled` of the rows of a table, inside a write of the place that the rows left. */
export function dropFilled(tx: Tx, table: string): void {
  let rows: Row[]
  try {
    rows = rowsOf(tx.read(ofTable(table), system))
  } catch {
    // A file that never filled a column holds no table for it.
    return
  }
  for (const one of rows)
    tx.remove(filled.name, { tableName: one.tableName, rowId: one.rowId, columnName: one.columnName }, system)
}
