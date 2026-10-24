import type { DbContext } from './context.ts'
import type { TableModel } from './model.ts'
import { rowUnder } from './rowUnder.ts'
import type { Ruling } from './rules.ts'
import { ruled } from './rules.ts'
import type { Row } from './store.ts'
import type { Filter } from './worked.ts'

/**
 * What the read rules of the columns of a table let one caller read: the columns it reads of no row, and those
 * it reads of the rows that a filter fits. A `db` with full access reads every column.
 */
export interface Hidden {
  never: string[]
  byRow: Map<string, Filter>
}

const none: Hidden = { never: [], byRow: new Map() }

// What each `db` was found to read of each table, worked out once.
const found = new WeakMap<DbContext, Map<string, Hidden>>()

/**
 * Takes the context of a `db`, a table, and what its rules are worked out with. Answers what the read rules of the
 * columns of the table hide from the caller: a rule is worked out as the `read` rule of a table is, under the name
 * `<table>__<column>`, so a rule that is code is handed in as `<table>__<column>_access_read`.
 */
export function hiddenOf(cx: DbContext, model: TableModel, ruling: () => Ruling): Hidden {
  if (cx.full || !Object.keys(model.readRules).length) return none
  const held = found.get(cx)?.get(model.name)
  if (held) return held
  const hidden: Hidden = { never: [], byRow: new Map() }
  for (const [column, rule] of Object.entries(model.readRules)) {
    const { reach } = ruled(ruling(), { ...model, name: `${model.name}__${column}`, access: { read: rule } }, 'read')
    if (reach === 'none') hidden.never.push(column)
    else if (reach !== 'all') hidden.byRow.set(column, reach)
  }
  const mine = found.get(cx) ?? new Map<string, Hidden>()
  mine.set(model.name, hidden)
  found.set(cx, mine)
  return hidden
}

/** The columns that a caller may not name in a filter, a sort or a group: those it reads of no row, and of some rows alone. */
export const unnamed = (hidden: Hidden): string[] => [...hidden.never, ...hidden.byRow.keys()]

/** Takes away, in place, the columns of a row that the read rules of its table hide from the caller. */
export function withoutHidden(cx: DbContext, model: TableModel, row: Row, hidden: Hidden, id: unknown): void {
  for (const column of hidden.never) Reflect.deleteProperty(row, column)
  for (const [column, reach] of hidden.byRow)
    if (column in row && (typeof id !== 'string' || !rowUnder(cx, model, id, reach)))
      Reflect.deleteProperty(row, column)
}
