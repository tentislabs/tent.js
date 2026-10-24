import type { Description } from '../../core/internal.ts'
import type { FileName } from '../../data/index.ts'

/** The file of a tenant that the id of a run names, or nothing for a run of the shared file. */
export function fileOfRun(run: string): FileName | undefined {
  const [, table, id, more] = run.split('.')
  return table && id && more === undefined ? { table, id } : undefined
}

/** The file that a row lives in: the tenant that its `tenant` column names, or nothing for a row of the shared file. */
export function fileOfRow(description: Description, table: string, row: Record<string, unknown>): FileName | undefined {
  const stored = Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
  const column = stored?.tenant
  if (typeof column !== 'string') return undefined
  const to: unknown = Reflect.get(Object(Reflect.get(Object(stored?.columns), column)), 'table')
  const id = row[column]
  return typeof to === 'string' && typeof id === 'string' ? { table: to, id } : undefined
}
