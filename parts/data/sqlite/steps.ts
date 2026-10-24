import { TentError } from '../../core/index.ts'
import { isSealed } from '../keptType.ts'
import type { ColumnType, TableLayout, TableStep } from '../store.ts'
import {
  besideSql,
  choiceSql,
  columnSql,
  dropChoiceSql,
  dropIndexSql,
  indexSql,
  storedAs,
  tableSql,
  vectorColumns,
  vectorSql,
  vectorTable,
} from './ddl.ts'
import { mustBeHeld } from '../keptType.ts'
import { failed } from './failed.ts'
import { keepLayout } from './meta.ts'
import { q } from './names.ts'
import type { Stepping } from './rebuild.ts'
import { rebuild } from './rebuild.ts'
import { dropSearchSql, searchSql } from './search.ts'
import { toStored } from './values.ts'

// The steps that a write takes which did not say it holds table steps: what a file makes with a first row.
export const withARow: TableStep['do'][] = ['addTable', 'addIndex', 'addUnique']

const wrong = (step: TableStep, why: string): TentError =>
  new TentError('T0013', `The table step \`${step.do}\` of \`${step.table}\` ${why}.`)

/** The table that a step names, as the file holds it. */
function tableOf(work: Stepping, step: TableStep, name = step.table): TableLayout {
  const layout = work.layouts.get(name)
  if (!layout) throw wrong(step, 'names a table that the file does not hold')
  return layout
}

/** The columns that a step names: one at least. */
function columnsOf(step: TableStep): string[] {
  if (!step.columns?.length) throw wrong(step, 'names no columns')
  return step.columns
}

/** The column that a step names, with its type as the file holds it. */
function columnOf(step: TableStep, layout: TableLayout): [string, ColumnType] {
  const type = step.column === undefined ? undefined : layout.columns[step.column]
  if (step.column === undefined || !type) throw wrong(step, 'names a column that the table does not hold')
  return [step.column, type]
}

const same = (a: string[], b: string[]): boolean => a.join() === b.join()
const without = (list: string[] | undefined, name: string): string[] => (list ?? []).filter((one) => one !== name)

/** A layout with its list of retired columns, which is left out where it names none. */
function withUnused(layout: TableLayout, unused: string[]): TableLayout {
  const { unused: _, ...rest } = layout
  return unused.length ? { ...rest, unused } : rest
}

/** Takes what stands beside a table away: its indexes, its triggers and its search index. */
function dropBeside(work: Stepping, table: string): void {
  const beside = work.db
    .prepare(`SELECT "type", "name" FROM sqlite_master WHERE "tbl_name" = ? AND "type" IN ('index', 'trigger')`)
    .all(table)
  // An index that SQLite made by itself, for a key or a unique column, goes with its table.
  for (const { type, name } of beside)
    if (!String(name).startsWith('sqlite_'))
      work.db.exec(`DROP ${String(type).toUpperCase()} IF EXISTS ${q(String(name))}`)
  for (const sql of dropSearchSql(table)) work.db.exec(sql)
}

/**
 * What a new column holds in the rows that are there: its default where that is a value as it is written, and
 * what the step carries where the default is worked out from the moment of the write. The store works none out:
 * a reader then fills what its writer filled.
 */
function filledBy(step: TableStep, type: ColumnType): unknown {
  const stored: unknown = 'default' in type ? type.default : undefined
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return stored
  if (!('now' in stored) && !('today' in stored)) return undefined
  if (step.value === undefined)
    throw wrong(step, 'adds a column whose default is worked out from the moment of the write, and carries no value')
  return step.value
}

/** A name in a list of columns, under the name it goes on with. */
const renamedIn = (lists: string[][], from: string, to: string): string[][] =>
  lists.map((columns) => columns.map((name) => (name === from ? to : name)))

// Each step as what it does to the file and to the layout that is kept of it.
const does: Record<TableStep['do'], (work: Stepping, step: TableStep) => void> = {
  addTable(work, step) {
    if (!step.layout || step.layout.name !== step.table) throw wrong(step, 'holds no layout of that table')
    if (work.layouts.has(step.table)) throw wrong(step, 'names a table that is already there')
    for (const sql of tableSql(step.layout, work.noSearch)) work.db.exec(sql)
    work.layouts.set(step.table, structuredClone(step.layout))
  },

  renameTable(work, step) {
    const layout = tableOf(work, step, step.from)
    if (work.layouts.has(step.table)) throw wrong(step, 'names a table that is already there')
    dropBeside(work, layout.name)
    // SQLite writes the new name into every link that points at the table.
    work.db.exec(`ALTER TABLE ${q(layout.name)} RENAME TO ${q(step.table)}`)
    for (const column of vectorColumns(layout))
      work.db.exec(`ALTER TABLE ${q(vectorTable(layout.name, column))} RENAME TO ${q(vectorTable(step.table, column))}`)
    const next: TableLayout = { ...layout, name: step.table }
    work.layouts.delete(layout.name)
    keepLayout(work.db, layout.name, undefined)
    work.layouts.set(step.table, next)
    for (const sql of besideSql(next, work.noSearch)) work.db.exec(sql)
    for (const other of work.layouts.values()) {
      const links = Object.values(other.columns).filter((type) => type.kind === 'link' && type.table === layout.name)
      for (const type of links) if (type.kind === 'link') type.table = step.table
      if (links.length) keepLayout(work.db, other.name, other)
    }
  },

  retireTable(work, step) {
    const layout = tableOf(work, step)
    // The links of a retired table are taken away, and nothing stands beside it any more.
    rebuild(work, layout, { ...layout, retired: true })
  },

  reviveTable(work, step) {
    const { retired: _, ...next } = tableOf(work, step)
    rebuild(work, tableOf(work, step), next)
  },

  dropTable(work, step) {
    const layout = tableOf(work, step)
    for (const sql of dropSearchSql(layout.name)) work.db.exec(sql)
    for (const column of vectorColumns(layout)) work.db.exec(`DROP TABLE ${q(vectorTable(layout.name, column))}`)
    work.db.exec(`DROP TABLE ${q(layout.name)}`)
    work.layouts.delete(layout.name)
  },

  addColumn(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = [step.column, step.to]
    if (name === undefined || !type) throw wrong(step, 'names no column with its type')
    if (layout.columns[name]) throw wrong(step, 'names a column that is already there')
    layout.columns[name] = structuredClone(type)
    if (type.kind === 'vector') {
      work.db.exec(vectorSql(layout.name, name))
      return
    }
    // A new column may hold nothing in the rows that are there: `require` and `rebuild` make it what its type says.
    work.db.exec(`ALTER TABLE ${q(layout.name)} ADD COLUMN ${columnSql(name, { ...type, optional: true })}`)
    if (type.kind === 'link' && name !== layout.tenant) work.db.exec(indexSql(layout.name, [name]))
    for (const sql of choiceSql(layout.name, name, type)) work.db.exec(sql)
    const value = 'from' in type && type.from !== undefined ? undefined : filledBy(step, type)
    if (value !== undefined && type.kind !== 'link' && !isSealed(type))
      work.db.prepare(`UPDATE ${q(layout.name)} SET ${q(name)} = ?`).run(toStored(type, value, layout.name, name))
  },

  renameColumn(work, step) {
    const layout = tableOf(work, step)
    const [name, from] = [step.column, step.from]
    if (name === undefined || from === undefined || !layout.columns[from])
      throw wrong(step, 'names a column that the table does not hold')
    if (layout.columns[name]) throw wrong(step, 'names a column that is already there')
    const next: TableLayout = {
      ...layout,
      columns: Object.fromEntries(
        Object.entries(layout.columns).map(([one, type]) => [one === from ? name : one, type]),
      ),
      indexes: renamedIn(layout.indexes, from, name),
      unique: renamedIn(layout.unique, from, name),
      search: renamedIn([layout.search], from, name)[0],
      ...(layout.unused ? { unused: renamedIn([layout.unused], from, name)[0] } : {}),
      ...(layout.tenant === from ? { tenant: name } : {}),
    }
    if (layout.columns[from].kind === 'vector')
      work.db.exec(`ALTER TABLE ${q(vectorTable(layout.name, from))} RENAME TO ${q(vectorTable(layout.name, name))}`)
    else {
      dropBeside(work, layout.name)
      work.db.exec(`ALTER TABLE ${q(layout.name)} RENAME COLUMN ${q(from)} TO ${q(name)}`)
      for (const sql of besideSql(next, work.noSearch)) work.db.exec(sql)
    }
    work.layouts.set(layout.name, next)
  },

  retireColumn(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    const next = withUnused({ ...layout, columns: { ...layout.columns, [name]: { ...type, optional: true } } }, [
      ...without(layout.unused, name),
      name,
    ])
    // A retired column may hold nothing, so that new rows still fit, and a retired link is a link no more.
    if (type.kind !== 'vector' && (mustBeHeld(type) || type.kind === 'link')) rebuild(work, layout, next)
    else work.layouts.set(layout.name, next)
  },

  reviveColumn(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    const next = withUnused(layout, without(layout.unused, name))
    if (type.kind === 'vector') work.layouts.set(layout.name, next)
    else rebuild(work, layout, next)
  },

  dropColumn(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    const { [name]: _, ...columns } = layout.columns
    const next = withUnused({ ...layout, columns }, without(layout.unused, name))
    if (type.kind !== 'vector') rebuild(work, layout, next)
    else {
      work.db.exec(`DROP TABLE ${q(vectorTable(layout.name, name))}`)
      work.layouts.set(layout.name, next)
    }
  },

  addIndex(work, step) {
    const layout = tableOf(work, step)
    const columns = columnsOf(step)
    work.db.exec(indexSql(step.table, columns))
    if (!layout.indexes.some((one) => same(one, columns))) layout.indexes.push([...columns])
  },

  // Takes the index over the named columns away: the plain one where the table has one, and its `unique` rule otherwise.
  dropIndex(work, step) {
    const layout = tableOf(work, step)
    const columns = columnsOf(step)
    const unique = !layout.indexes.some((one) => same(one, columns))
    work.db.exec(dropIndexSql(step.table, columns, unique))
    if (unique) layout.unique = layout.unique.filter((one) => !same(one, columns))
    else layout.indexes = layout.indexes.filter((one) => !same(one, columns))
  },

  // The columns a table is searched by, and the way, which the layout of the step states: the index is built again.
  addSearch(work, step) {
    const { by: _, ...layout } = tableOf(work, step)
    const next: TableLayout = { ...layout, search: [...(step.columns ?? [])] }
    if (step.layout?.by) next.by = step.layout.by
    for (const sql of dropSearchSql(layout.name)) work.db.exec(sql)
    if (!work.noSearch) for (const sql of searchSql(next)) work.db.exec(sql)
    work.layouts.set(layout.name, next)
  },

  addUnique(work, step) {
    const layout = tableOf(work, step)
    const columns = columnsOf(step)
    work.db.exec(indexSql(step.table, columns, true))
    if (!layout.unique.some((one) => same(one, columns))) layout.unique.push([...columns])
  },

  // Makes a column one that must hold a value: of the type `to`, where the step gives one.
  require(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    const { optional: _, ...required } = type
    const to = step.to ? structuredClone(step.to) : required
    rebuild(work, layout, { ...layout, columns: { ...layout.columns, [name]: to } })
  },

  // Makes a column one that may hold nothing, or, with `to`, writes down a type that asks nothing more of the rows.
  relax(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    const to = step.to ? structuredClone(step.to) : { ...type, optional: true }
    const next = { ...layout, columns: { ...layout.columns, [name]: to } }
    if (type.kind !== 'vector' && mustBeHeld(type) && !mustBeHeld(to)) rebuild(work, layout, next)
    else work.layouts.set(layout.name, next)
  },

  /**
   * Makes a column of the type `to`. Where the kind it is kept as changes, where it must hold a value from now on or
   * no longer, or where `sealed` is added or taken away, the table is built anew: a sealed column and one that was sealed are carried empty, and whoever holds the key
   * writes their values. The check of a choice is a trigger, which is changed with no rebuild. Anything else, as a
   * limit, is written into the layout alone.
   */
  retype(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    if (!step.to) throw wrong(step, 'names no type')
    const to = structuredClone(step.to)
    const next = { ...layout, columns: { ...layout.columns, [name]: to } }
    const sealing = isSealed(type) !== isSealed(to)
    if (sealing || storedAs(type) !== storedAs(to) || mustBeHeld(type) !== mustBeHeld(to))
      return rebuild(work, layout, next, sealing ? { blank: [name] } : {})
    for (const sql of [...dropChoiceSql(layout.name, name), ...choiceSql(layout.name, name, to)]) work.db.exec(sql)
    work.layouts.set(layout.name, next)
  },

  rebuild(work, step) {
    const layout = tableOf(work, step)
    rebuild(work, layout, layout)
  },

  // Takes every value of a column away, and with `to` writes down the type it then has.
  empty(work, step) {
    const layout = tableOf(work, step)
    const [name, type] = columnOf(step, layout)
    if (type.kind === 'vector') work.db.exec(`DELETE FROM ${q(vectorTable(layout.name, name))}`)
    else work.db.exec(`UPDATE ${q(layout.name)} SET ${q(name)} = NULL`)
    if (step.to) layout.columns[name] = structuredClone(step.to)
  },
}

/**
 * Takes the connection, the layouts the file holds, the steps of a table change, and whether the write said that
 * it holds table steps. Carries each step out in its order, changes the layouts in place, and writes down the
 * layout of each table that a step touched. Throws T0013 for a step that the write may not hold, and for a step
 * that does not fit the file.
 */
export function runSteps(work: Stepping, steps: TableStep[], said: boolean): void {
  for (const step of steps) {
    if (!Object.hasOwn(does, step.do) || (!said && !withARow.includes(step.do)))
      throw wrong(step, 'stands in a write that did not say it holds table steps')
    try {
      does[step.do](work, step)
    } catch (error) {
      throw failed(error, step.table)
    }
    keepLayout(work.db, step.table, work.layouts.get(step.table))
  }
}
