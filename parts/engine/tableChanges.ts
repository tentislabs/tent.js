import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import type { Seal, Store, TableLayout, TableStep } from '../data/index.ts'
import {
  applySteps,
  changesTable,
  factsOf,
  hereTable,
  historyTable,
  layoutOf,
  planTableChanges,
} from '../data/index.ts'
import { list } from './tables/list.ts'

// The tables of the engine that every data file holds beside the tables of its app: loaded when the first app opens.
let tables: Promise<TableLayout[]> | undefined

/** Answers the tables of the engine: those that the data part keeps for every data file, and the engine's own. */
export function engineTables(): Promise<TableLayout[]> {
  tables ??= Promise.all(list.map((one) => one.load())).then((loaded) => [
    hereTable,
    changesTable,
    historyTable,
    ...loaded.map((one) => one.table),
  ])
  return tables
}

/** Answers the layout that the data of an app is asked for: the tables of its description, and those of the engine. */
export const layoutFor = (description: Description, engine: TableLayout[]): TableLayout[] => [
  ...layoutOf(description),
  ...engine,
]

/** The steps that bring the tables of a data file to what a description asks for: the engine's own, and those of the app. */
export interface Planned {
  own: TableStep[]
  steps: TableStep[]
  // Whether the file held a table of an app before: data that is new holds nothing that a change could lose.
  held: boolean
}

/**
 * Takes the store of an app, which stands open, its description, and the tables of the engine. Answers the steps
 * from the layout the file holds to the layout that the description asks for, and the tables of the engine that
 * the file lacks. Changes nothing. Where a step would be refused, it throws the finding: T2001 to T2004.
 */
export function planTables(store: Store, description: Description, engine: TableLayout[]): Planned {
  const [refused] = factsOf(store, description).tableFindings
  if (refused) throw new TentError(refused.code, refused.message, refused.fix === undefined ? {} : { fix: refused.fix })
  const held = store.layout()
  const there = new Set(held.map((table) => table.name))
  const own: TableStep[] = engine
    .filter((table) => !there.has(table.name))
    .map((layout) => ({ do: 'addTable', table: layout.name, layout }))
  const stated = description.project.removed
  const { steps } = planTableChanges(
    held.filter((table) => !table.name.startsWith('_t_')),
    layoutOf(description),
    { removed: Array.isArray(stated) ? stated.map(String) : [] },
  )
  return { own, steps, held: held.some((table) => !table.name.startsWith('_t_')) }
}

/**
 * Applies the steps that were planned for a store, inside one write: all of them, or none. With the seal, the
 * rows of a column that gains or loses `sealed` are sealed and opened in that write.
 */
export function applyPlanned(store: Store, planned: Planned, o: { seal?: Seal } = {}): void {
  if (planned.own.length + planned.steps.length === 0) return
  store.write((tx) => applySteps(tx, store, [...planned.own, ...planned.steps], o), { steps: true })
}

/**
 * Takes the store of an app, which stands open, its description, and the tables of the engine. Brings the tables
 * of the data to what the description asks for, inside one write. Where a step is refused, nothing is changed, and
 * it throws the finding: T2001 to T2004.
 */
export function changeTables(store: Store, description: Description, engine: TableLayout[]): void {
  applyPlanned(store, planTables(store, description, engine))
}
