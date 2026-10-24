import type { Description } from '../core/internal.ts'
import { matches } from '../core/internal.ts'
import type { DbContext } from './context.ts'
import { plansAnswered, throughShared } from './fileReads.ts'
import { layoutOf } from './layoutOf.ts'
import type { TableModel } from './model.ts'
import { workedColumns, workedOut } from './sqlite/from.ts'
import type { ColumnType, Row } from './store.ts'
import type { Filter } from './worked.ts'

// The columns of each table of a description, as its layout holds them: worked out once for a description, and not
// for each row that is added.
const columnsBy = new WeakMap<Description, Map<string, Record<string, ColumnType>>>()

/** The columns of one table, as the layout of the description holds them. */
function columnsOf(description: Description, table: string): Record<string, ColumnType> {
  let columns = columnsBy.get(description)
  if (!columns) {
    columns = new Map(layoutOf(description).map((one) => [one.name, one.columns]))
    columnsBy.set(description, columns)
  }
  return columns.get(table) ?? {}
}

/**
 * Takes the context of a `db` that is at work in the file of a tenant, a table of that file, the filter of a
 * rule, and a row that is about to be added. Answers whether the row fits the filter, with nothing read of the
 * file: it is how a rule is asked of a row before the file of its tenant is made. Each condition through a link
 * into the shared file, and each plan inside the filter, is answered first. The row is then held against the lists
 * as the store would hold it, with what is worked out from its own columns.
 */
export function fitsInMemory(cx: DbContext, model: TableModel, filter: Filter, row: Row): boolean {
  // The layout holds a `from` as the store works it out, with the zone of the project in it.
  const columns = columnsOf(cx.description, model.name)
  const worked = Object.entries(workedOut(workedColumns(Object.entries(columns)), row))
  const held = { ...row, ...Object.fromEntries(worked.filter(([, value]) => value !== null)) }
  return matches(plansAnswered(cx, throughShared(cx, model, filter)), held)
}
