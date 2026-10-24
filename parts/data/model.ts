import type { Type } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { Kept } from './counting.ts'
import { keepsOf, keptBy } from './counting.ts'
import { isStored, shownLayouts, tableColumns } from '../core/internal.ts'
import { keptIn } from './kept.ts'
import { wasOf } from './wasOf.ts'

type Stored = Record<string, unknown>

/** A link column of another table that points at a table, with what happens to its rows when the row they point at is removed. */
interface Referrer {
  table: string
  column: string
  onRemove: 'refuse' | 'remove' | 'clear'
}

/** What `data` needs of one table of a description, read once. */
export interface TableModel {
  name: string
  columns: Record<string, Type>
  private: string[]
  sealed: string[]
  // The columns the table is searched by.
  search: string[]
  vectors: string[]
  worked: string[]
  // The columns whose value can hold a list or an object.
  deep: string[]
  owner?: string
  access: Record<string, Stored>
  keepHistory: boolean
  referrers: Referrer[]
  // The link column that says whose file a row lives in, and the table it links to, for a tenant table.
  tenant?: string
  tenantTable?: string
  // The names the table had before, and the name of today by each name a column had before.
  was: string[]
  formerly: Record<string, string>
  // The columns of the table that the engine keeps from the rows that link to its rows, which no write names.
  kept: string[]
  // The kept columns of the tables of the same file that count the rows of this table.
  counted: Kept[]
  // The rule of each column that states who may read it.
  readRules: Record<string, Stored>
  // The sealed columns that are found by an equal value: a fingerprint of each stands beside it.
  findable: string[]
  // Of a table kept in memory, how long a row stays after its last write, in milliseconds.
  memory?: { lasts?: number }
  // The engine's own table that a table which states `shows` is, under the builder's name: read, and never written.
  stored?: string
}

/** Whether a record of the description is a type: the shape of the description holds the rest of it. */
const isType = (value: unknown): value is Type => isStored(value) && typeof value.kind === 'string'

// What every row of a table of an app has beside its columns.
const everyRow: Record<string, Type> = {
  id: { kind: 'text' },
  createdAt: { kind: 'date' },
  updatedAt: { kind: 'date' },
}

const models = new WeakMap<Description, Map<string, TableModel>>()

/** The tenant column of a table, with the table of the tenants that it links to. */
function tenantOf(table: Stored, columns: Record<string, Type>): { tenant?: string; tenantTable?: string } {
  const type = typeof table.tenant === 'string' ? columns[table.tenant] : undefined
  return type?.kind === 'link' ? { tenant: String(table.tenant), tenantTable: type.table } : {}
}

/** The columns that a table states in `search`: a list of them, or a record that holds the list. */
function searchOf(stated: unknown): string[] {
  const columns = isStored(stated) ? stated.columns : stated
  return Array.isArray(columns) ? columns.map(String) : []
}

/** The name of today by each name that a column had before and that no column has today. */
function formerlyOf(columns: Record<string, Type>): Record<string, string> {
  const formerly: Record<string, string> = {}
  for (const [column, type] of Object.entries(columns))
    for (const was of wasOf(type))
      if (!Object.hasOwn(columns, was) && !Object.hasOwn(formerly, was)) formerly[was] = column
  return formerly
}

/** Reads the tables of a description, once for each description. */
function read(description: Description): Map<string, TableModel> {
  const tables = new Map<string, TableModel>()
  for (const [name, table] of Object.entries(description.tables)) {
    const columns: Record<string, Type> = {}
    // A table that shows the counts has the columns of the engine's table, as `core` gives them.
    for (const [column, type] of Object.entries(tableColumns(description, name)))
      if (isType(type)) columns[column] = type
    const flagged = (flag: 'private' | 'sealed' | 'from') =>
      Object.keys(columns).filter(
        (column) =>
          flag in columns[column] &&
          Reflect.get(columns[column], flag) !== undefined &&
          Reflect.get(columns[column], flag) !== false,
      )
    tables.set(name, {
      name,
      columns,
      private: flagged('private'),
      sealed: flagged('sealed'),
      search: searchOf(table.search),
      vectors: Object.keys(columns).filter((column) => columns[column].kind === 'vector'),
      worked: flagged('from'),
      deep: Object.keys(columns).filter((column) => ['list', 'object', 'json'].includes(columns[column].kind)),
      ...(typeof table.owner === 'string' ? { owner: table.owner } : {}),
      // The counts are a person's own by the user they name.
      ...(typeof table.shows === 'string' && Object.hasOwn(shownLayouts, table.shows)
        ? { stored: shownLayouts[table.shows].name, ...('user' in columns ? { owner: 'user' } : {}) }
        : {}),
      access: Object.fromEntries(
        Object.entries(isStored(table.access) ? table.access : {}).filter((entry): entry is [string, Stored] =>
          isStored(entry[1]),
        ),
      ),
      keepHistory: table.keepHistory === true,
      referrers: [],
      ...tenantOf(table, columns),
      was: wasOf(table).filter((was) => !Object.hasOwn(description.tables, was)),
      formerly: formerlyOf(columns),
      kept: Object.keys(columns).filter((column) => keepsOf(columns[column]) !== undefined),
      counted: [],
      // A private column is the case of a read rule that no caller passes but full access.
      readRules: Object.fromEntries(
        Object.entries(columns).flatMap(([column, type]): [string, Stored][] => {
          const rule: unknown = Reflect.get(type, 'private') === true ? { rule: 'nobody' } : Reflect.get(type, 'read')
          return isStored(rule) ? [[column, rule]] : []
        }),
      ),
      findable: Object.keys(columns).filter((column) => Reflect.get(columns[column], 'findable') === true),
      ...(table.kept === 'memory' ? { memory: typeof table.lasts === 'number' ? { lasts: table.lasts } : {} } : {}),
    })
  }
  // A count of the rows of another file cannot move in their write, which is one file: the check refuses it (T2025).
  for (const [of, kept] of keptBy([...tables.values()]))
    for (const one of kept)
      if (tables.get(of)?.tenantTable === tables.get(one.table)?.tenantTable) tables.get(of)?.counted.push(one)
  for (const table of tables.values())
    for (const [column, type] of Object.entries(table.columns))
      if (type.kind === 'link')
        tables.get(type.table)?.referrers.push({ table: table.name, column, onRemove: type.onRemove ?? 'refuse' })
  return tables
}

/** Takes a description and the name of a table. Answers what `data` needs of that table. Throws T0009 for a table the description does not hold. */
export function tableOf(description: Description, name: string): TableModel {
  const table = keptIn(models, description, () => read(description)).get(name)
  if (!table) throw new TentError('T0009', `The app has no table \`${name}\`.`)
  return table
}

/** Answers the names of the tables of a description. */
export const tableNames = (description: Description): string[] => [
  ...keptIn(models, description, () => read(description)).keys(),
]

const linkedFrom = new WeakMap<Description, Set<string>>()

/**
 * Answers the tables of the shared file that a tenant table links to: the rows that link to a row of one
 * stand in files that may be closed, so a removal there is counted and each file is swept by the count.
 */
export const linkedFromFiles = (description: Description): Set<string> =>
  keptIn(linkedFrom, description, () => {
    const tables = keptIn(models, description, () => read(description))
    const far = [...tables.values()].flatMap((table) =>
      table.referrers.some((link) => tables.get(link.table)?.tenantTable !== table.tenantTable) ? [table.name] : [],
    )
    return new Set(far.filter((name) => tables.get(name)?.tenantTable === undefined))
  })

/** The type of a name that a row of a table has: a column, or one of the three that every row has. */
export const typeIn = (table: TableModel, column: string): Type | undefined =>
  Object.hasOwn(table.columns, column)
    ? table.columns[column]
    : Object.hasOwn(everyRow, column)
      ? everyRow[column]
      : undefined
