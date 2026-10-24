import type { DbContext } from './context.ts'
import { throughShared } from './fileReads.ts'
import type { TableModel } from './model.ts'
import type { Row } from './store.ts'
import type { Filter } from './worked.ts'

/** Reads one row of a table as the store holds it, under what a rule lets the caller reach, with no limit of time counted. */
export function rowUnder(
  cx: DbContext,
  model: TableModel,
  id: string,
  reach: Filter | 'all' | 'none',
): Row | undefined {
  if (reach === 'none') return undefined
  const where = reach === 'all' || !cx.at || !model.tenant ? reach : throughShared(cx, model, reach)
  const value = cx.read({ from: model.name, one: 'get', id, ...(where === 'all' ? {} : { where }) })
  return typeof value === 'object' && value !== null ? { ...value } : undefined
}
