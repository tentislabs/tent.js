import type { Description } from '../core/internal.ts'
import type { Store } from '../data/index.ts'
import { layoutOf } from '../data/index.ts'

const wasOf = (stated: object): string[] => ('was' in stated && Array.isArray(stated.was) ? stated.was.map(String) : [])

/**
 * Turns each rename round that the newer description states and the older one does not know: a table and a column
 * that the newer files renamed, with `was`, from a name that the older files hold, is stated in the older
 * description as having had the newer name. So it takes its old name again with its values.
 */
function turnRound(back: Description, from: Description): void {
  for (const [newer, table] of Object.entries(from.tables)) {
    const name = Object.hasOwn(back.tables, newer)
      ? newer
      : wasOf(table).find((older) => Object.hasOwn(back.tables, older) && !Object.hasOwn(from.tables, older))
    if (name === undefined) continue
    const older = back.tables[name]
    if (name !== newer) older.was = [...wasOf(older), newer]
    const columns: Record<string, object> = Object(older.columns)
    const newerColumns: Record<string, object> = Object(table.columns)
    for (const [column, type] of Object.entries(newerColumns)) {
      if (Object.hasOwn(columns, column)) continue
      const had = wasOf(type).find((one) => Object.hasOwn(columns, one) && !Object.hasOwn(newerColumns, one))
      if (had !== undefined) columns[had] = { ...columns[had], was: [...wasOf(columns[had]), column] }
    }
  }
}

/**
 * Takes the store of an app, the description of an older point or version, and the description that runs. Answers
 * the older description as a switch back plans its table changes by. A table and a column that was renamed since,
 * with `was`, takes its old name again with its values. Each table and each column that the data holds and the
 * older files do not know, because it was added since, is stated as removed: so it is retired without a statement,
 * nothing is dropped, and going forward again revives it.
 */
export function backOf(store: Store, to: Description, from: Description): Description {
  const back: Description = structuredClone(to)
  turnRound(back, from)
  const tables = new Set<string>(Array.isArray(back.project.removed) ? back.project.removed.map(String) : [])
  const wanted = layoutOf(back)
  for (const held of store.layout()) {
    if (held.name.startsWith('_t_') || held.retired) continue
    const layout = wanted.find((one) => one.name === held.name || wasOf(one).includes(held.name))
    const table = layout && Object.hasOwn(back.tables, layout.name) ? back.tables[layout.name] : undefined
    if (!table || !layout) {
      tables.add(held.name)
      continue
    }
    const renamed = new Set(Object.values(layout.columns).flatMap((type) => wasOf(type)))
    const removed = new Set<string>(Array.isArray(table.removed) ? table.removed.map(String) : [])
    for (const column of Object.keys(held.columns))
      if (!Object.hasOwn(layout.columns, column) && !renamed.has(column) && !held.unused?.includes(column))
        removed.add(column)
    if (removed.size) table.removed = [...removed]
  }
  if (tables.size) back.project.removed = [...tables]
  return back
}
