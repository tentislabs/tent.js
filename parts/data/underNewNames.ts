import { isShared } from './sqlite/ddl.ts'
import type { ColumnType, TableLayout, TableStep } from './store.ts'

/**
 * Takes the tables that one tenant's file holds, and the layout of the app. A table of the shared file that goes
 * on under a new name moves no file: a file names it by the name it had, as its own table and in each link that
 * runs out of the file, until it is brought up. Answers the old names by the new ones, the tables of the file with
 * the new name in each such link, and the steps that write those names into the file.
 */
export function underNewNames(
  held: TableLayout[],
  to: TableLayout[],
): { renamed: Map<string, string>; held: TableLayout[]; steps: TableStep[] } {
  const names = new Set(to.map((one) => one.name))
  const renamed = new Map(
    to.flatMap((one) =>
      (one.was ?? []).filter((was) => !names.has(was)).map((was): [string, string] => [was, one.name]),
    ),
  )
  const steps: TableStep[] = []
  const under = held.map((layout) => {
    const columns = Object.entries(layout.columns).map(([name, type]): [string, ColumnType] => {
      const now = type.kind === 'link' && isShared(type) ? renamed.get(type.table) : undefined
      if (type.kind !== 'link' || now === undefined) return [name, type]
      steps.push({ do: 'retype', table: layout.name, column: name, to: { ...type, table: now } })
      return [name, { ...type, table: now }]
    })
    return { ...layout, columns: Object.fromEntries(columns) }
  })
  return { renamed, held: under, steps }
}
