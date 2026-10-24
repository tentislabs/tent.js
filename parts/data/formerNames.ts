import { setMeta } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import type { Store, TableStep, Tx } from './store.ts'

/** The names that the tables and the columns of a data file had in it before, by the name each has now. */
interface Names {
  tables: Record<string, string[]>
  // By the table and the column, with a space between: no name of either holds one.
  columns: Record<string, string[]>
}

// Where `_t_meta` of a file keeps them.
const key = 'names'

const isLists = (value: unknown): value is Record<string, string[]> =>
  typeof value === 'object' && value !== null && Object.values(value).every(Array.isArray)

/** Reads the names that a file keeps, as a copy that may be changed. */
function namesIn(on: Store | Tx): Names {
  const held = heldMeta(on, key)
  const part = (name: 'tables' | 'columns'): Record<string, string[]> => {
    const lists: unknown = typeof held === 'object' && held !== null ? Reflect.get(held, name) : undefined
    return isLists(lists) ? { ...lists } : {}
  }
  return { tables: part('tables'), columns: part('columns') }
}

/** A thing under a new name: the names it had, with the one it had last, and without the one it has now. */
const after = (had: string[] | undefined, last: string, now: string): string[] =>
  [...new Set([...(had ?? []), last])].filter((name) => name !== now)

/** Takes away what is kept of a table, or of one column of it. */
function forget(names: Names, table: string, column?: string): void {
  if (column === undefined) Reflect.deleteProperty(names.tables, table)
  for (const one of Object.keys(names.columns))
    if (column === undefined ? one.startsWith(`${table} `) : one === `${table} ${column}`)
      Reflect.deleteProperty(names.columns, one)
}

/**
 * Takes the write of a table change and its steps, once the store has carried them out. Keeps in `_t_meta` of the
 * file each name that a table and a column had in it before a step gave it another. What was kept of a row stands
 * under the names of its day, and neither a step nor the layout of a file says which those were. A table and a
 * column that are made or dropped have no former name. It writes nothing where the steps change no name.
 */
export function keepNames(tx: Tx, steps: TableStep[]): void {
  const naming = ['renameTable', 'renameColumn', 'addTable', 'addColumn', 'dropTable', 'dropColumn']
  if (!steps.some((step) => naming.includes(step.do))) return
  const names = namesIn(tx)
  const before = JSON.stringify(names)
  for (const { do: what, table, column, from } of steps) {
    if (what === 'renameTable' && from !== undefined) {
      names.tables[table] = after(names.tables[from], from, table)
      for (const one of Object.keys(names.columns).filter((name) => name.startsWith(`${from} `)))
        names.columns[`${table} ${one.slice(from.length + 1)}`] = names.columns[one]
      forget(names, from)
    } else if (what === 'renameColumn' && column !== undefined && from !== undefined) {
      names.columns[`${table} ${column}`] = after(names.columns[`${table} ${from}`], from, column)
      forget(names, table, from)
    } else if (what === 'addTable' || what === 'dropTable') forget(names, table)
    else if ((what === 'addColumn' || what === 'dropColumn') && column !== undefined) forget(names, table, column)
  }
  if (JSON.stringify(names) === before) return
  const none = !Object.keys(names.tables).length && !Object.keys(names.columns).length
  setMeta(tx, key, none ? undefined : names)
}

/**
 * Takes a store or the write to work in, a table, and one of its columns. Answers the names that the table had in
 * the file before, and the names that the column had.
 */
export function formerNames(on: Store | Tx, table: string, column: string): { tables: string[]; columns: string[] } {
  const names = namesIn(on)
  return { tables: names.tables[table] ?? [], columns: names.columns[`${table} ${column}`] ?? [] }
}
