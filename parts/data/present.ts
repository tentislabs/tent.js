import type { DbContext } from './context.ts'
import { boundOf, noKey } from './context.ts'
import { frozen, hand } from './handed.ts'
import { withoutHidden } from './columnRules.ts'
import { foundColumn } from './found.ts'
import { keptIn } from './kept.ts'
import type { TableModel } from './model.ts'
import type { Row } from './store.ts'

/**
 * Takes a row as the store holds it. Answers it as the code of this `db` sees it, in place: each sealed value
 * opened under the bound of its row, and each column that its read rule keeps from the caller left out, a private
 * one among them, where the `db` is limited to its caller.
 * `id` is the id of the row, for a row that was read without it. `bound` answers the bound of a sealed column,
 * for a value that was sealed under other names than those of today. Throws T0019 with no key at hand.
 */
export function shown(
  cx: DbContext,
  model: TableModel,
  row: Row,
  id: unknown = row.id,
  bound?: (column: string) => string,
): Row {
  for (const column of model.sealed) {
    const sealed = row[column]
    if (typeof sealed !== 'string') continue
    if (!cx.o.seal) throw noKey(model.name, column)
    row[column] = cx.o.seal.open(sealed, bound ? bound(column) : boundOf(model.name, column, id))
  }
  if (cx.hidden) withoutHidden(cx, model, row, cx.hidden(model), id)
  // The fingerprint of a sealed value that is found is the store's, and no code's.
  for (const column of model.findable) Reflect.deleteProperty(row, foundColumn(column))
  return row
}

// What a row of each table is kept as, made once for the table.
const rowsOf = new WeakMap<TableModel, { kind: 'row'; private: readonly string[] }>()
const list = { kind: 'list' } as const

/**
 * Keeps a row as one that this `db` handed out, with the private columns of its table, and freezes it with every
 * list and object that one of its columns holds. A `db` that is no query's hands the row out as it is.
 */
export function handedRow(cx: DbContext, model: TableModel, row: Row): Row {
  handedRows(cx, model, [row])
  return row
}

/** Keeps each row of a read as `handedRow` does: what a row is kept as is looked up once for them all. */
export function handedRows(cx: DbContext, model: TableModel, rows: Row[]): void {
  if (!cx.freeze) return
  const hidden = cx.leaving ? cx.leaving(model) : []
  const kind = hidden.length
    ? { kind: 'row' as const, private: [...new Set([...model.private, ...hidden])] }
    : keptIn(rowsOf, model, () => ({ kind: 'row' as const, private: model.private }))
  const deep = [...model.deep, ...model.sealed]
  for (const row of rows) {
    for (const column of deep) frozen(row[column])
    hand(row, kind)
  }
}

/** Keeps a list as one that this `db` handed out. */
export const handedList = <Entry>(cx: DbContext, entries: Entry[]): Entry[] =>
  cx.freeze ? hand(entries, list) : entries
