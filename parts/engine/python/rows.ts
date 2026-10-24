import { sqlitePath } from '../../data/index.ts'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { Description } from '../../core/internal.ts'
import { isFields } from '../../core/internal.ts'

/** One table of a rows file: its columns, in their order, and its rows, each a value for each column. */
interface Table {
  columns: string[]
  rows: Record<string, number | string | null>[]
}

/** A linked row, as a plan that follows a link answers it in the place of the link. */
const isLinked = (value: unknown): value is Record<string, unknown> => isFields(value) && typeof value.id === 'string'

/** A value as a column of the rows file holds it: text, a number, 1 or 0, a date as text, the rest as JSON text. */
function cellOf(value: unknown): number | string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

/** The columns of a table of the app, by their names, as the description stores them. */
function columnsOf(description: Description, table: string | undefined): Record<string, unknown> {
  const stored = table !== undefined && Object.hasOwn(description.tables, table) ? description.tables[table] : undefined
  return Object(stored?.columns)
}

/** The columns a table answers where it answered no row: those of its table that are not private, with `id`. */
function columnsOfPlan(description: Description, plan: unknown, table: string | undefined): string[] {
  const pick: unknown = Reflect.get(Object(plan), 'pick')
  if (Array.isArray(pick))
    return ['id', ...pick.filter((one): one is string => typeof one === 'string' && one !== 'id')]
  const columns = Object.entries(columnsOf(description, table))
    .filter(([, column]) => Reflect.get(Object(column), 'private') !== true)
    .map(([name]) => name)
  return ['id', 'createdAt', 'updatedAt', ...columns]
}

/**
 * Lays rows of one table of the app into a table of the file: under the name of the entry, and each row that a
 * link reached under the name of the entry and the link with an underscore between, each once, with its id in the
 * link column, so a link reached through a link adds its name the same way. A private column is never laid.
 */
function laid(
  description: Description,
  tables: Map<string, Table>,
  name: string,
  of: string | undefined,
  rows: Record<string, unknown>[],
  columns: string[],
): void {
  const table: Table = tables.get(name) ?? { columns: [...columns], rows: [] }
  tables.set(name, table)
  const stored = columnsOf(description, of)
  const seen = new Set(table.rows.map((row) => row.id))
  for (const row of rows) {
    const cells: Record<string, number | string | null> = {}
    for (const [column, value] of Object.entries(row)) {
      const kind: unknown = stored[column]
      if (Reflect.get(Object(kind), 'private') === true) continue
      if (!table.columns.includes(column)) table.columns.push(column)
      // A row in the place of a link is a row of its table; any other record, as a json value, is JSON text.
      if (Reflect.get(Object(kind), 'kind') === 'link' && isLinked(value)) {
        const target: unknown = Reflect.get(Object(kind), 'table')
        laid(description, tables, `${name}_${column}`, typeof target === 'string' ? target : undefined, [value], ['id'])
        cells[column] = String(value.id)
      } else cells[column] = cellOf(value)
    }
    if (typeof cells.id === 'string' && seen.has(cells.id)) continue
    seen.add(cells.id)
    table.rows.push(cells)
  }
}

/**
 * Takes the description, the plans of `rows` by their names, how a plan is read as the caller, and the folder of
 * the call. Writes the rows file under it on a thread of its own: one table for each entry, as the Python side
 * says, a plan that answers a number as one row with `value`, and one that answers one row as a table of that
 * row. Answers the path of the file.
 */
export async function rowsFile(
  description: Description,
  plans: Record<string, unknown>,
  read: (plan: unknown, entry: string) => Promise<unknown>,
  folder: string,
): Promise<string> {
  const tables = new Map<string, Table>()
  for (const [name, plan] of Object.entries(plans)) {
    const answer = await read(plan, name)
    if (typeof answer === 'number') {
      tables.set(name, { columns: ['value'], rows: [{ value: answer }] })
      continue
    }
    const from: unknown = Reflect.get(Object(plan), 'from')
    const of = typeof from === 'string' ? from : undefined
    const listed: unknown = isFields(answer) && Array.isArray(answer.rows) ? answer.rows : answer
    const rows = Array.isArray(listed) ? listed : isFields(listed) ? [listed] : []
    laid(description, tables, name, of, rows.filter(isFields), columnsOfPlan(description, plan, of))
  }
  const path = join(folder, 'rows.db')
  await new Promise<void>((done, failed) => {
    const writer = new Worker(new URL('./rowsWriter.ts', import.meta.url), {
      workerData: { path: sqlitePath(path), tables: Object.fromEntries(tables) },
    })
    writer.once('error', failed)
    writer.once('exit', (code) => (code === 0 ? done() : failed(new Error(`the rows file was not written: ${code}`))))
  })
  return path
}
