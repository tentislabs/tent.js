import type { Seal } from './context.ts'
import { boundOf, noKey } from './context.ts'
import { formerNames } from './formerNames.ts'
import type { Row, Store, Tx } from './store.ts'
import { historyTable } from './tables.ts'

const system = { kind: 'system' } as const

/**
 * Takes the write of a table change, its store once the steps are carried out, a column that `sealed` was added to
 * or taken from, and the `Seal`. Seals or opens the value of that column in every kept version of a row of its
 * table, those kept under a former name of the table or of the column among them. Each is written under the names
 * it was kept under, by which `history` opens it. So what a column seals lies open in nothing that was kept of it.
 * Throws T0019 where a kept version holds a value and no key is at hand.
 */
export function turnKept(
  tx: Tx,
  store: Store,
  turn: { table: string; column: string; seals: boolean },
  seal: Seal | undefined,
): void {
  const layouts = store.layout()
  const layout = layouts.find((one) => one.name === turn.table)
  if (!layout || !layouts.some((one) => one.name === historyTable.name)) return
  const former = formerNames(tx, turn.table, turn.column)
  // A former name that a table of today has names the versions of that table, and a former name of the column
  // that a column of today has names that column: `history` reads both so.
  const tables = [turn.table, ...former.tables.filter((name) => !layouts.some((one) => one.name === name))]
  const names = [turn.column, ...former.columns.filter((name) => !Object.hasOwn(layout.columns, name))]
  const kept = tx.read({ from: historyTable.name, where: { col: 'tableName', in: tables } }, system)
  const versions: Row[] = Array.isArray(kept) ? kept : []
  for (const version of versions) {
    const value: unknown = version.value
    if (typeof value !== 'object' || value === null) continue
    const name = names.find((one) => Object.hasOwn(value, one))
    const held: unknown = name === undefined ? undefined : Reflect.get(value, name)
    if (name === undefined || held === undefined || held === null) continue
    if (!seal) throw noKey(turn.table, turn.column)
    const bound = boundOf(String(version.tableName), name, version.rowId)
    const turned = turn.seals ? seal.close(held, bound) : seal.open(String(held), bound)
    tx.change(historyTable.name, String(version.id), { value: { ...value, [name]: turned } }, system)
  }
}
