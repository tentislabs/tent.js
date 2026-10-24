import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { isStored, projectZone } from '../core/internal.ts'
import { foundColumn } from './found.ts'
import type { ColumnType, TableLayout } from './store.ts'

type Stored = Record<string, unknown>

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
const lists = (value: unknown): string[][] => (Array.isArray(value) ? value.map(textsOf) : [])

/** A `from` with the zone of the project written into each `dayOf` that names none, so that a change of the zone is a change of the expression. */
function withZone(value: unknown, zone: string): unknown {
  if (Array.isArray(value)) return value.map((one) => withZone(one, zone))
  if (!isStored(value)) return value
  const made = Object.fromEntries(Object.entries(value).map(([name, one]) => [name, withZone(one, zone)]))
  return made.fn === 'dayOf' && Array.isArray(made.args) && made.args.length === 1
    ? { ...made, args: [...made.args, zone] }
    : made
}

/** The type of a column as a layout holds it. */
function columnOf(type: Stored, description: Description, zone: string): ColumnType {
  const { model, from, ...rest } = type
  const column: Stored = { ...rest }
  if (from !== undefined) column.from = withZone(from, zone)
  // The day of `today` is a day in the zone of the project: whoever fills a new column reads the zone here.
  if (isStored(rest.default) && 'today' in rest.default) column.default = { ...rest.default, zone }
  // The provider and the name of the model stand in place of its definition, so a definition that is only renamed
  // changes nothing, and a change of the definition itself is a change of the column.
  const made = typeof model === 'string' ? description.models[model] : undefined
  if (made) column.made = `${String(made.provider)}/${String(made.name)}`
  if (!isColumn(column)) throw new TentError('T0011', 'A column of the description holds no type.')
  return column
}

/** Whether a record of the description is the type of a column: the shape of the description holds the rest of it. */
const isColumn = (column: Stored): column is Stored & ColumnType => typeof column.kind === 'string'

/**
 * Takes a description. Answers the layout it asks for: each table of the app with its columns, its indexes, the
 * columns it is searched by, the `was` of the table and of its columns, and its `removed`. A table that shows one
 * of the engine's own has no table of its own, and is left out.
 */
export function layoutOf(description: Description): TableLayout[] {
  const zone = projectZone(description.project)
  return Object.entries(description.tables)
    .filter(([, table]) => table.shows === undefined)
    .map(([name, table]) => {
      const columns = Object.entries(isStored(table.columns) ? table.columns : {}).filter(
        (entry): entry is [string, Stored] => isStored(entry[1]),
      )
      const search = isStored(table.search) ? table.search : { columns: table.search }
      const flagged = (flag: string) => columns.filter(([, type]) => type[flag] === true).map(([column]) => [column])
      const layout: TableLayout = {
        name,
        columns: Object.fromEntries(columns.map(([column, type]) => [column, columnOf(type, description, zone)])),
        indexes: [...lists(table.indexes), ...flagged('index')],
        unique: [...lists(table.unique), ...flagged('unique')],
        search: textsOf(search.columns),
      }
      // A sealed column that is found keeps the fingerprint of its value in a column of the store beside it.
      for (const [column, type] of columns)
        if (type.findable === true) {
          layout.columns[foundColumn(column)] = { kind: 'text', optional: true }
          layout.indexes.push([foundColumn(column)])
        }
      if (search.by === 'pieces') layout.by = 'pieces'
      if (textsOf(table.was).length) layout.was = textsOf(table.was)
      if (textsOf(table.removed).length) layout.removed = textsOf(table.removed)
      if (typeof table.tenant === 'string') layout.tenant = table.tenant
      // A file of a tenant is behind until the backfills of its tables ran in it: they are a part of its layout.
      const walks = Object.entries(description.backfills ?? {})
        .filter(([, record]) => record.table === name)
        .map(([backfill]) => backfill)
        .sort()
      if (layout.tenant !== undefined && walks.length) layout.walks = walks
      // A table kept in memory is this machine's own: no record, no sink and no backup holds it, and its links are
      // kept as the text ids of their rows, since a link cannot reach out of the memory of a connection.
      if (table.kept === 'memory') {
        layout.memory = true
        layout.own = true
        if (typeof table.lasts === 'number') layout.lasts = table.lasts
        layout.columns = Object.fromEntries(
          Object.entries(layout.columns).map(([column, type]) => [
            column,
            type.kind === 'link' ? { ...type, shared: true } : type,
          ]),
        )
      }
      return layout
    })
}
