import type { Row, Tables } from '../core/index.ts'
import type { App } from '../engine/index.ts'

/** A row as a test reads it: its columns by their names. */
export type TestRow = Record<string, unknown>

const isRow = (value: unknown): value is TestRow => typeof value === 'object' && value !== null

/** The table of the tenants of a table, or nothing for a table of the shared file. */
function tenantTable(app: App, table: string): string | undefined {
  const record = Object.hasOwn(app.description.tables, table) ? app.description.tables[table] : undefined
  const column: unknown =
    typeof record?.tenant === 'string' ? Reflect.get(Object(record.columns), record.tenant) : undefined
  const linked: unknown = Reflect.get(Object(column), 'table')
  return typeof linked === 'string' ? linked : undefined
}

/** The names of the tables of the project, which its type list holds. */
type TableName = Extract<keyof Tables, string>

/** How a test reads the rows of a table: typed by the type list where it holds the name, as a call is. */
export interface Rows {
  /** Every row of a table that the type list of the project holds, typed as the rows of that table are. */
  <Name extends TableName>(table: Name, o?: { of?: string }): Promise<Row<Name>[]>
  (table: string | { readonly definition: string }, o?: { of?: string }): Promise<TestRow[]>
}

/**
 * `app.rows(table)`: every row of a table, with full access. A table is named by its name, or by its definition.
 * For a tenant table, `of` reads the rows of one tenant, and without it every tenant in turn.
 */
export const rows = (app: App): Rows => {
  const read = async (plan: object): Promise<TestRow[]> => {
    const answered = await app.read(plan, { as: 'system' })
    return Array.isArray(answered) ? answered.filter(isRow) : []
  }
  // One reading, which the types of `Rows` say two things of: its rows by a name of the type list, and by any other.
  function all<Name extends TableName>(table: Name, o?: { of?: string }): Promise<Row<Name>[]>
  function all(table: string | { readonly definition: string }, o?: { of?: string }): Promise<TestRow[]>
  async function all(table: string | { readonly definition: string }, o: { of?: string } = {}): Promise<TestRow[]> {
    const from = typeof table === 'string' ? table : table.definition
    const tenants = tenantTable(app, from)
    if (tenants === undefined) return read({ from })
    if (o.of !== undefined) return read({ from, of: o.of })
    const found: TestRow[] = []
    for (const tenant of await read({ from: tenants })) found.push(...(await read({ from, of: String(tenant.id) })))
    return found
  }
  return all
}
