import type { Description } from '../core/internal.ts'
import { tenantTable } from './fileLayout.ts'
import type { TableLayout, TableStep } from './store.ts'

/** The columns that a backfill of a description fills, each as `<table>.<column>`. */
export function filledBy(description: Description): Set<string> {
  const found = new Set<string>()
  for (const record of Object.values(description.backfills ?? {}))
    if (typeof record.table === 'string' && typeof record.fills === 'string')
      found.add(`${record.table}.${record.fills}`)
  return found
}

/**
 * Takes a step of a table change and the columns that backfills fill. Answers whether the step makes a column
 * required that a backfill fills: such a step is checked against the rows after the backfill ran, not before.
 */
export const waitsForBackfill = (step: TableStep, fills: Set<string>): boolean =>
  step.do === 'require' && fills.has(`${step.table}.${step.column ?? ''}`)

/**
 * Takes the layouts of an app, a table of tenants, and the columns that backfills fill. Answers
 * the layouts that a file of that table is brought to before the backfills of its tables ran in it: a column that
 * one fills is still optional, and none is walked yet. Nothing where no backfill walks a table of such a file.
 */
export function beforeWalks(layouts: TableLayout[], table: string, fills: Set<string>): TableLayout[] | undefined {
  if (!layouts.some((one) => tenantTable(one) === table && one.walks?.length)) return undefined
  return layouts.map((one) => {
    if (tenantTable(one) !== table || !one.walks?.length) return one
    const { walks: _, ...rest } = one
    const columns = Object.entries(one.columns).map(([name, type]) => [
      name,
      fills.has(`${one.name}.${name}`) ? { ...type, optional: true } : type,
    ])
    return { ...rest, columns: Object.fromEntries(columns) }
  })
}
