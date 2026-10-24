import { isDeepStrictEqual } from 'node:util'
import { setMeta } from './here.ts'
import type { Hold } from './metaKeys.ts'
import { holdsIn } from './metaKeys.ts'
import type { TableLayout, TableStep, Tx } from './store.ts'

const sameColumns = (a: string[] | undefined, b: string[] | undefined): boolean => (a ?? []).join() === (b ?? []).join()

/** Whether a table holds a `unique` rule over the columns that a step names. */
const holdsUnique = (layout: TableLayout | undefined, step: TableStep): boolean =>
  layout?.unique.some((columns) => sameColumns(columns, step.columns)) === true

/**
 * Takes the write of a file, what carries table steps out in it, a version, the steps to hold the file to, and
 * the tables of the file by their names. Writes a hold for each step into the file, and for a new `unique` rule
 * makes its index at once, so that the store itself holds the rows to it. A rule that the table holds already
 * needs no hold, and neither does a step that the file is held to already. Answers how many holds it wrote.
 */
export function holdTo(
  tx: Tx,
  apply: (steps: TableStep[]) => void,
  version: string,
  steps: TableStep[],
  tables: Map<string, TableLayout>,
): number {
  const held = holdsIn(tx)
  const needed = steps.filter(
    (step) =>
      !(step.do === 'addUnique' && holdsUnique(tables.get(step.table), step)) &&
      !held.some((hold) => hold.version === version && isDeepStrictEqual(hold.step, step)),
  )
  if (!needed.length) return 0
  const indexes = needed.filter((step) => step.do === 'addUnique')
  if (indexes.length) apply(indexes)
  setMeta(tx, 'holds', [...held, ...needed.map((step): Hold => ({ version, step }))])
  return needed.length
}

/**
 * Takes the write of a file, what carries table steps out in it, and what picks the holds that go. Takes those
 * holds away, and drops the index of each `unique` rule that was held and that no hold which stays asks for. The
 * steps are the first act of a write that said it holds table steps. Answers the table steps it carried out.
 */
export function letGo(tx: Tx, apply: (steps: TableStep[]) => void, goes: (hold: Hold) => boolean): TableStep[] {
  const held = holdsIn(tx)
  const stays = held.filter((hold) => !goes(hold))
  if (stays.length === held.length) return []
  const drops = held
    .filter((hold) => goes(hold) && hold.step.do === 'addUnique')
    .filter(
      ({ step }) => !stays.some((one) => one.step.table === step.table && sameColumns(one.step.columns, step.columns)),
    )
    .map(({ step }): TableStep => ({ do: 'dropIndex', table: step.table, columns: step.columns }))
  if (drops.length) apply(drops)
  setMeta(tx, 'holds', stays.length ? stays : undefined)
  return drops
}
