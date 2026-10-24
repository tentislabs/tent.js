import { heldIn } from './held.ts'
import { checkValue, valueOf } from '../core/internal.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { mustBeHeld, isSealed, takesLess } from './keptType.ts'
import { q } from './sqlite/names.ts'
import type { ColumnType, Row, Store, TableLayout, TableStep } from './store.ts'
import { visitFiles } from './visitFiles.ts'

const system = { kind: 'system' } as const

/** The rows of a table that do not fit a step of a table change, by the column they do not fit, and for a tenant's file with that file. */
export interface Misfit {
  table: string
  column: string
  rows: number
  file?: FileName
}

/** A table as the steps so far leave it: its layout, and where each of its columns lies in the file. */
interface Following {
  layout: TableLayout
  // The name of the table in the file, or nothing for one that the steps made.
  file?: string
  // The name of each column in the file. A column that the steps added is left out: it holds nothing in every row.
  columns: Map<string, string>
}

const made = (type: ColumnType): unknown => ('made' in type ? type.made : undefined)

/** What a value becomes where its column changes its kind: a number its text, a text the number it reads as, or nothing where it reads as none. */
function converted(old: ColumnType, to: ColumnType, value: unknown): unknown {
  if (old.kind === 'number' && to.kind === 'text') return valueOf({ concat: [value] })
  if (old.kind !== 'text' || to.kind !== 'number') return value
  const read = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(read) ? read : undefined
}

/**
 * Takes the type a column has, the type it is to have, and one value it holds. Answers whether the value does not
 * fit the new type: it does not convert, or the new type takes less than the value is.
 */
export function misfitsType(type: ColumnType, to: ColumnType, held: unknown): boolean {
  const { optional: _, ...needed } = to
  const value = converted(type, to, held)
  return value === undefined || (needed.kind !== 'bytes' && checkValue({ ...needed, optional: true }, value).length > 0)
}

/**
 * Takes a store and the steps of a table change. Answers, for each column that some rows do not fit, how many: a
 * column that must hold a value from now on and holds none, or whose revived link names a row that is gone; a new
 * `unique` rule that rows share a value under; a type that takes less than the old one, as a narrower limit and a
 * removed `choice` value; a value that does not convert; and a vector column whose model changed while it holds
 * vectors. It reads the rows through the store, under the names they have in the file, and writes nothing. Handed
 * the files of an app, it answers a promise: it reads the shared file, and visits, to read alone, every tenant's
 * file that holds a table the steps name, and each misfit of such a file holds its file.
 */
export function findMisfits(store: Store, steps: TableStep[]): Misfit[]
export function findMisfits(files: Files, steps: TableStep[]): Promise<Misfit[]>
export function findMisfits(on: Store | Files, steps: TableStep[]): Misfit[] | Promise<Misfit[]> {
  if (!('shared' in on)) return misfitsIn(on, steps)
  const shared = misfitsIn(on.shared, steps)
  return visitFiles(on, (store, file) => misfitsIn(store, steps).map((one) => ({ ...one, file }))).then((found) => [
    ...shared,
    ...found.flat(),
  ])
}

/** The misfits of one store. */
function misfitsIn(store: Store, steps: TableStep[]): Misfit[] {
  const file = new Map(store.layout().map((layout) => [layout.name, layout]))
  const tables = new Map<string, Following>()
  for (const layout of file.values())
    tables.set(layout.name, {
      layout: structuredClone(layout),
      file: layout.name,
      columns: new Map(Object.keys(layout.columns).map((name) => [name, name])),
    })
  const found = new Map<string, Misfit>()
  const note = (table: string, column: string, rows: number) => {
    const key = `${table} ${column}`
    if (rows > (found.get(key)?.rows ?? 0)) found.set(key, { table, column, rows })
  }

  /** The values that the rows of a table hold in some columns of the file, a row at a time. */
  const rowsOf = (at: Following, columns: string[]): Row[] => {
    if (at.file === undefined) return []
    const rows = store.read({ from: at.file, pick: columns }, system).value
    return Array.isArray(rows) ? rows : []
  }
  const count = (at: Following): number => {
    const rows = at.file === undefined ? 0 : store.read({ from: at.file, count: true }, system).value
    return typeof rows === 'number' ? rows : 0
  }
  /** Whether a column is kept in the file and no longer used there: no plan reads it. */
  const loose = (at: Following, inFile: string): boolean => {
    const layout = at.file === undefined ? undefined : file.get(at.file)
    return layout?.retired === true || layout?.unused?.includes(inFile) === true
  }

  /** The rows that hold nothing in a column which must hold a value from now on. */
  const lacking = (at: Following, column: string, type: ColumnType): number => {
    const inFile = at.columns.get(column)
    if (at.file === undefined) return 0
    if (inFile === undefined) return count(at)
    if (!loose(at, inFile)) return rowsOf(at, [inFile]).filter((row) => row[inFile] === undefined).length
    // A retired column is read as it is stored: a retired link holds the text id of its row, which may be gone.
    // The table it links to stands in the file under the name it had before the steps renamed it.
    const linked = type.kind === 'link' ? (tables.get(type.table)?.file ?? type.table) : ''
    const gone = type.kind === 'link' ? ` OR ${q(inFile)} NOT IN (SELECT "id" FROM ${q(linked)})` : ''
    const [row] = store.sql?.(`SELECT count(*) AS "n" FROM ${q(at.file)} WHERE ${q(inFile)} IS NULL${gone}`, []) ?? []
    return Number(heldIn(row, 'n') ?? 0)
  }

  for (const step of steps) {
    const at = tables.get(step.from !== undefined && step.do === 'renameTable' ? step.from : step.table)
    const column = step.column ?? ''
    if (step.do === 'addTable' && step.layout)
      tables.set(step.table, { layout: structuredClone(step.layout), columns: new Map() })
    if (!at) continue
    const type: ColumnType | undefined = at.layout.columns[column]
    switch (step.do) {
      case 'renameTable':
        tables.delete(at.layout.name)
        at.layout.name = step.table
        tables.set(step.table, at)
        break
      case 'dropTable':
        tables.delete(step.table)
        break
      case 'addColumn':
        if (step.to) at.layout.columns[column] = step.to
        break
      case 'renameColumn': {
        const from = step.from ?? ''
        at.layout.columns[column] = at.layout.columns[from]
        Reflect.deleteProperty(at.layout.columns, from)
        const inFile = at.columns.get(from)
        at.columns.delete(from)
        if (inFile !== undefined) at.columns.set(column, inFile)
        break
      }
      case 'addUnique': {
        const names = (step.columns ?? []).map((name) => at.columns.get(name))
        if (names.some((name) => name === undefined || loose(at, name))) break
        const inFile = names.filter((name) => name !== undefined)
        const seen = new Set<string>()
        let shared = 0
        for (const row of rowsOf(at, inFile)) {
          // A row that holds nothing in one of the columns shares its value with no row.
          if (inFile.some((name) => row[name] === undefined)) continue
          const key = JSON.stringify(inFile.map((name) => row[name]))
          if (seen.has(key)) shared++
          seen.add(key)
        }
        if (shared) note(step.table, (step.columns ?? []).join(', '), shared)
        break
      }
      case 'require': {
        const to = step.to ?? type
        if (to) note(step.table, column, lacking(at, column, to))
        if (to) at.layout.columns[column] = to
        break
      }
      case 'retype': {
        const to = step.to
        if (!type || !to) break
        at.layout.columns[column] = to
        const inFile = at.columns.get(column)
        if (to.kind === 'vector') {
          // The vectors of another model cannot be compared with those of the new one.
          if (made(type) === made(to) || at.file === undefined || inFile === undefined) break
          const held = store.read({ from: at.file, where: { col: inFile, empty: false }, count: true }, system).value
          note(step.table, column, typeof held === 'number' ? held : 0)
          break
        }
        const needs = mustBeHeld(to) && !mustBeHeld(type)
        if (needs && (inFile === undefined || loose(at, inFile))) note(step.table, column, lacking(at, column, to))
        if (inFile === undefined || loose(at, inFile) || isSealed(type) || isSealed(to) || to.kind === 'bytes') break
        if (!needs && !takesLess(type, to)) break
        const misfits = rowsOf(at, [inFile]).filter((row) =>
          row[inFile] === undefined ? needs : misfitsType(type, to, row[inFile]),
        )
        note(step.table, column, misfits.length)
        break
      }
      case 'relax':
      case 'empty':
        if (step.to) at.layout.columns[column] = step.to
        break
    }
  }
  return [...found.values()].filter((one) => one.rows > 0)
}
