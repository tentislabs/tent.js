import { isDeepStrictEqual } from 'node:util'
import type { Keeps } from '../core/internal.ts'
import { isStored, matches } from '../core/internal.ts'
import type { Wrote } from './context.ts'
import type { Row, Store, TableLayout, TableStep, Tx } from './store.ts'
import { pagePlan, walkAt, walkedOn } from './walk.ts'
import type { Filter } from './worked.ts'

const system = { kind: 'system' } as const

/** One kept column: the table that holds it, its name, and how it is kept. */
export interface Kept {
  table: string
  column: string
  keeps: Keeps
}

/** Whether a stored value is a filter: a record, as the description holds every filter. */
const isFilter = (value: unknown): value is Filter => isStored(value)

/** How a column is kept, where its type says it is. */
export function keepsOf(type: unknown): Keeps | undefined {
  const keeps: unknown = isStored(type) ? type.keeps : undefined
  if (!isStored(keeps) || typeof keeps.of !== 'string' || typeof keeps.by !== 'string') return undefined
  if (keeps.do !== 'count' && keeps.do !== 'sum' && keeps.do !== 'min' && keeps.do !== 'max') return undefined
  return {
    do: keeps.do,
    of: keeps.of,
    by: keeps.by,
    ...(typeof keeps.column === 'string' ? { column: keeps.column } : {}),
    ...(isFilter(keeps.where) ? { where: keeps.where } : {}),
  }
}

/** Every kept column of a set of tables, by the tables whose rows they count. */
export function keptBy(tables: { name: string; columns: Record<string, unknown> }[]): Map<string, Kept[]> {
  const by = new Map<string, Kept[]>()
  for (const table of tables)
    for (const [column, type] of Object.entries(table.columns)) {
      const keeps = keepsOf(type)
      if (keeps) by.set(keeps.of, [...(by.get(keeps.of) ?? []), { table: table.name, column, keeps }])
    }
  return by
}

/** A value of a kept column, or of the column it reads, as a number: a moment by its milliseconds. */
const numberOf = (value: unknown): number | undefined =>
  value instanceof Date ? value.getTime() : typeof value === 'number' ? value : undefined

/** What the rows that link to one row are asked: those of that row that fit the filter of the kept column. */
const linkedTo = (kept: Kept, id: string): Filter => ({
  all: [{ col: kept.keeps.by, is: id }, ...(kept.keeps.where === undefined ? [] : [kept.keeps.where])],
})

/**
 * The least or the most value that the rows linked to one row hold, through the write: the one row the store finds
 * first in that order, so no other row is read.
 */
function extremeOf(tx: Tx, kept: Kept, id: string): number | undefined {
  const column = kept.keeps.column ?? ''
  const where = { all: [linkedTo(kept, id), { col: column, empty: false }] }
  const sort = [{ by: column, ...(kept.keeps.do === 'max' ? { down: true as const } : {}) }]
  const read: unknown = tx.read({ from: kept.keeps.of, where, sort, limit: 1, pick: [column] }, system)
  const [first] = Array.isArray(read) ? read : []
  return isStored(first) ? numberOf(first[column]) : undefined
}

/** The number a kept column holds for one row, worked out from every row that links to it, through the write. */
function workedOut(tx: Tx, kept: Kept, id: string): number | undefined {
  const { keeps } = kept
  const where = linkedTo(kept, id)
  if (keeps.do === 'count') return Number(tx.read({ from: keeps.of, where, count: true }, system))
  if (keeps.do !== 'sum') return extremeOf(tx, kept, id)
  const column = keeps.column ?? ''
  const read: unknown = tx.read({ from: keeps.of, where, pick: [column] }, system)
  return (Array.isArray(read) ? read : [])
    .map((row: Row) => numberOf(row[column]))
    .reduce((all: number, n) => all + (n ?? 0), 0)
}

/**
 * What one linked row gives the kept column of the row of that id: nothing where it is not counted there, and with
 * the value it is counted by for a sum, a least and a most, where it holds one.
 */
function givenBy(kept: Kept, row: Row | undefined, id: string): { value?: number } | undefined {
  if (!row || row[kept.keeps.by] !== id) return undefined
  if (kept.keeps.where !== undefined && !matches(kept.keeps.where, row)) return undefined
  const value = kept.keeps.do === 'count' ? undefined : numberOf(row[kept.keeps.column ?? ''])
  return value === undefined ? {} : { value }
}

/**
 * The number a kept column moves to where one linked row was counted as `was` and is counted as `is`: moved by
 * what the row gave and gives. Only where the row that held the least or the most gave it up is the store asked.
 */
function movedTo(
  tx: Tx,
  kept: Kept,
  id: string,
  stands: number | undefined,
  was: { value?: number } | undefined,
  is: { value?: number } | undefined,
): number | undefined {
  const { keeps } = kept
  if (keeps.do === 'count') return (stands ?? 0) + (is ? 1 : 0) - (was ? 1 : 0)
  if (keeps.do === 'sum') return (stands ?? 0) + (is?.value ?? 0) - (was?.value ?? 0)
  const better = (a: number, b: number): number => (keeps.do === 'min' ? Math.min(a, b) : Math.max(a, b))
  const [gave, gives] = [was?.value, is?.value]
  // The row that held the least or the most gave it up: the next is the one row the store finds first.
  if (gave !== undefined && gave === stands && (gives === undefined || better(gives, gave) !== gives))
    return extremeOf(tx, kept, id)
  if (gives === undefined) return stands
  return stands === undefined ? gives : better(stands, gives)
}

/**
 * Takes the write, a kept column, the id of the row that holds it, and the number it moves to, worked out from the
 * row it stands at. Writes it where it moved, in the same write. Answers what was written, as a write of `db`
 * tells it, or nothing where the number stands or the row is gone.
 */
function keptAt(
  tx: Tx,
  kept: Kept,
  id: string,
  worked: (stands: number | undefined) => number | undefined,
): Wrote | undefined {
  const before: unknown = tx.read({ from: kept.table, one: 'get', id }, system)
  if (!isStored(before)) return undefined
  const stands = numberOf(before[kept.column])
  const to = worked(stands)
  if (isDeepStrictEqual(stands, to)) return undefined
  const value = to === undefined ? null : before[kept.column] instanceof Date ? new Date(to) : to
  const row = tx.change(kept.table, id, { [kept.column]: value }, system)
  return { table: kept.table, kind: 'changed', row, before, columns: [kept.column] }
}

/** Works the number of a kept column out anew from every row that links to it, and writes it where it moved. */
const keptAgain = (tx: Tx, kept: Kept, id: string): Wrote | undefined =>
  keptAt(tx, kept, id, () => workedOut(tx, kept, id))

/**
 * Takes the write, the kept columns that count a table, and a row of that table as it was and as it is. Moves the
 * number of each row it linked to and links to by what it gave and gives, reading no other linked row but where a
 * least or a most is given up, and answers what was written.
 */
export function countedRow(tx: Tx, kept: Kept[], before: Row | undefined, after: Row | undefined): Wrote[] {
  const wrote: Wrote[] = []
  for (const one of kept) {
    const ids = new Set([before?.[one.keeps.by], after?.[one.keeps.by]].filter((id) => typeof id === 'string'))
    for (const id of ids) {
      const [was, is] = [givenBy(one, before, id), givenBy(one, after, id)]
      if (!was && !is) continue
      const done = keptAt(tx, one, id, (stands) => movedTo(tx, one, id, stands, was, is))
      if (done) wrote.push(done)
    }
  }
  return wrote
}

/** Works every number of some kept columns out anew, over every row that holds one, after a raw write: it names no row it wrote. */
export function keptAnew(tx: Tx, kept: Kept[]): Wrote[] {
  const wrote: Wrote[] = []
  for (const one of kept) {
    const read: unknown = tx.read({ from: one.table, pick: ['id'] }, system)
    for (const row of Array.isArray(read) ? read : []) {
      const done = keptAgain(tx, one, String(row.id))
      if (done) wrote.push(done)
    }
  }
  return wrote
}

/** The name of the walk that fills a kept column first. */
export const keptWalkName = (kept: Kept): string => `${kept.table}.${kept.column}`

/**
 * The kept columns that the steps of a table change make or change, as the store holds them after the steps: each
 * is filled first by the one walk of the switch.
 */
export function keptBySteps(store: Store, steps: TableStep[]): Kept[] {
  const layouts = new Map(store.layout().map((layout: TableLayout) => [layout.name, layout]))
  const found: Kept[] = []
  for (const step of steps) {
    const layout = layouts.get(step.table)
    const columns =
      step.do === 'addTable'
        ? []
        : step.do === 'addColumn' || step.do === 'retype' || step.do === 'reviveColumn'
          ? [step.column ?? '']
          : step.do === 'rebuild'
            ? Object.keys(layout?.columns ?? {})
            : []
    for (const column of columns) {
      const keeps = keepsOf(layout?.columns[column])
      if (layout && keeps && !found.some((one) => one.table === layout.name && one.column === column))
        found.push({ table: layout.name, column, keeps })
    }
  }
  return found
}

/**
 * Takes the write of a file, its tables, and how many rows make a page. Works out the numbers of the next page of
 * the first kept column whose walk the file notes, and moves its note on in the same write. Answers what was
 * written, and nothing where no walk of a kept column is noted in the file.
 */
export function keptPage(tx: Tx, layouts: TableLayout[], size: number): Wrote[] | undefined {
  for (const layout of layouts)
    for (const [column, type] of Object.entries(layout.columns)) {
      const keeps = keepsOf(type)
      if (!keeps) continue
      const kept = { table: layout.name, column, keeps }
      const at = walkAt(tx, keptWalkName(kept))
      if (at === undefined || at === 'done') continue
      const read: unknown = tx.read(pagePlan(layout.name, at.after, size), system)
      const ids = (Array.isArray(read) ? read : []).map((row: Row) => String(row.id))
      const wrote: Wrote[] = []
      for (const id of ids) {
        const done = keptAgain(tx, kept, id)
        if (done) wrote.push(done)
      }
      walkedOn(tx, keptWalkName(kept), ids.length < size ? undefined : ids.at(-1))
      return wrote
    }
  return undefined
}
