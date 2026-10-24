import { fingerprintOf } from '../core/internal.ts'
import { keptLayout } from './keptType.ts'
import { isShared } from './sqlite/ddl.ts'
import type { TableLayout, TableStep } from './store.ts'

/** Answers the table of the tenants of a table: the one its `tenant` column links to. Nothing for a table of the shared file. */
export function tenantTable(layout: TableLayout): string | undefined {
  const type = layout.tenant === undefined ? undefined : layout.columns[layout.tenant]
  return type?.kind === 'link' ? type.table : undefined
}

/** Answers the tenant tables of a layout whose tenants are of one table, in their order. */
const tenantTablesOf = (layouts: TableLayout[], table: string): TableLayout[] =>
  layouts.filter((layout) => tenantTable(layout) === table)

/**
 * Takes the layout of a tenant table, and every table of the app by its name. Answers the table as a
 * tenant's file keeps it: each link that runs out of the file - the `tenant` column itself, a link to a user -
 * says so, and is kept as the text id of its row.
 */
function inFile(layout: TableLayout, all: Map<string, TableLayout>): TableLayout {
  const by = tenantTable(layout)
  const columns = Object.entries(layout.columns).map(([name, type]) => {
    const linked = type.kind === 'link' ? all.get(type.table) : undefined
    const inside = linked !== undefined && tenantTable(linked) === by
    return [name, type.kind === 'link' && !inside ? { ...type, shared: true } : type]
  })
  return { ...layout, columns: Object.fromEntries(columns) }
}

/** Takes the layouts of an app. Answers the tenant tables as a tenant's file keeps them. */
export function inFiles(layouts: TableLayout[]): TableLayout[] {
  const all = new Map(layouts.map((layout) => [layout.name, layout]))
  return layouts.filter((layout) => tenantTable(layout) !== undefined).map((layout) => inFile(layout, all))
}

/**
 * Takes the tables of a file by their names, and the name of one. Answers that table with the tables its links
 * name inside the file, and theirs, each once: making a table in a file makes those too.
 */
export function withLinked(tables: Map<string, TableLayout>, name: string, found: TableLayout[] = []): TableLayout[] {
  const layout = tables.get(name)
  if (!layout || found.includes(layout)) return found
  found.push(layout)
  for (const type of Object.values(layout.columns))
    if (type.kind === 'link' && !isShared(type)) withLinked(tables, type.table, found)
  return found
}

/** The step that makes a table, as a file keeps it. */
export const makes = (layout: TableLayout): TableStep => ({
  do: 'addTable',
  table: layout.name,
  layout: keptLayout(layout),
})

/** A value as JSON text with the names of every record in their order, so that one value has one text. */
function oneText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(oneText).join(',')}]`
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  const names = Object.keys(value).sort()
  return `{${names.map((name) => `${JSON.stringify(name)}:${oneText(Reflect.get(value, name))}`).join(',')}}`
}

/**
 * Takes the layouts of an app and a table of tenants. Answers the fingerprint of the layout that
 * a file of that table is brought to: the layouts of the tenant tables whose tenants are of it, as the description gives them.
 */
export function layoutFingerprint(layouts: TableLayout[], table: string): string {
  const tables = tenantTablesOf(layouts, table).sort((a, b) => (a.name < b.name ? -1 : 1))
  return fingerprintOf(new TextEncoder().encode(oneText(tables)))
}
