import { rowIds } from '../../data/index.ts'
import type { Row, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import type { FillGroup } from './columns.ts'
import { fillGroups, readsOf } from './columns.ts'

const system = { kind: 'system' } as const
export const filledTable = '_t_filled'

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** The row of `_t_filled` of one value, inside a write, or nothing. */
export function filledRow(tx: Tx, table: string, id: string, column: string): Record<string, unknown> | undefined {
  const [row] = listOf(
    tx.read(
      {
        from: filledTable,
        where: {
          all: [
            { col: 'tableName', is: table },
            { col: 'rowId', is: id },
            { col: 'columnName', is: column },
          ],
        },
        limit: 1,
      },
      system,
    ),
  )
  return row
}

/** Writes the row of `_t_filled` of one value with these fields, adding it where there is none. */
export function setFilled(tx: Tx, table: string, id: string, column: string, values: Row): void {
  const key = { tableName: table, rowId: id, columnName: column }
  if (filledRow(tx, table, id, column)) tx.change(filledTable, key, values, system)
  else tx.add(filledTable, { ...key, state: 'due', tries: 0, ...values }, system)
}

/** Marks the values of a row due, at the moment of this write and `debounce`: their work is to be carried out anew. */
function markDue(o: Opened, tx: Tx, group: FillGroup, id: string): void {
  const dueAt = new Date(o.clock.now() + group.debounce)
  for (const one of group.columns)
    setFilled(tx, group.table, id, one.column, { state: 'due', dueAt, tries: 0, error: null })
  o.filling?.poke()
}

/** The groups that read a column of this table through a link from another table. */
const readThrough = (
  groups: FillGroup[],
  description: Opened['description'],
  table: string,
  columns: string[],
): boolean =>
  groups.some((group) =>
    readsOf(group).linked.some(([link, column]) => {
      const type: unknown = Reflect.get(Object(description.tables[group.table]?.columns), link)
      return Reflect.get(Object(type), 'table') === table && columns.includes(column)
    }),
  )

/**
 * Takes an app and a write of one of its files. Answers the write with each row it adds, changes and removes of
 * a table that has filled columns marked inside it: an added row is due, a change of a column that a work reads
 * makes its values due, a row whose columns are read through a link is marked under `*` for the pass to walk the
 * rows that read it, and a removed row takes its rows of `_t_filled` with it. A raw text sets no mark.
 */
export function fillTx(o: Opened, tx: Tx): Tx {
  const groups = fillGroups(o.description)
  if (!groups.length) return tx
  return {
    ...tx,
    add(table, values, caller) {
      const row = tx.add(table, values, caller)
      if (!table.startsWith('_t_'))
        for (const group of groups) if (group.table === table) markDue(o, tx, group, String(row.id))
      return row
    },
    change(table, id, values, caller) {
      const row = tx.change(table, id, values, caller)
      if (table.startsWith('_t_')) return row
      const changed = Object.keys(values)
      for (const group of groups)
        if (group.table === table && readsOf(group).own.some((column) => changed.includes(column)))
          markDue(o, tx, group, String(row.id))
      // The rows that read this row through a link are marked by the pass, page by page, and not in this write.
      if (readThrough(groups, o.description, table, changed))
        setFilled(tx, table, String(row.id), '*', { state: 'due', read: rowIds.next(), dueAt: new Date(o.clock.now()) })
      return row
    },
    remove(table, id, caller) {
      tx.remove(table, id, caller)
      if (table.startsWith('_t_')) return
      for (const one of listOf(
        tx.read(
          {
            from: filledTable,
            where: {
              all: [
                { col: 'tableName', is: table },
                { col: 'rowId', is: String(id) },
              ],
            },
          },
          system,
        ),
      ))
        tx.remove(filledTable, { tableName: table, rowId: String(id), columnName: one.columnName }, system)
    },
  }
}
