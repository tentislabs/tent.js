import type { Description } from '../core/internal.ts'
import type { StoredType } from './columns.ts'
import { columnsOf } from './columns.ts'

/** The column that a table states in `tenant`, by its name, or nothing for a table that states none. */
export function tenantColumn(description: Description, table: string): string | undefined {
  const stated = Object.hasOwn(description.tables, table) ? description.tables[table].tenant : undefined
  return typeof stated === 'string' ? stated : undefined
}

/**
 * Takes a description and the name of a table. Answers the table of its tenants: the one that
 * its `tenant` column links to. Nothing for a table of the shared file, and for a `tenant` that names no link.
 */
export function tenantTable(description: Description, table: string): string | undefined {
  const column = tenantColumn(description, table)
  const type: StoredType | undefined = column === undefined ? undefined : columnsOf(description, table)[column]
  return type?.kind === 'link' && typeof type.table === 'string' ? type.table : undefined
}

/** The tables of a description that state `tenant`, in the order of their names. */
export const tenantTables = (description: Description): string[] =>
  Object.keys(description.tables)
    .filter((table) => tenantColumn(description, table) !== undefined)
    .sort()
