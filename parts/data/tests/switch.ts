import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { Seal, Store, TableLayout, TableStep } from '../index.ts'
import { applySteps, findMisfits, layoutOf, planTableChanges } from '../index.ts'
import { described } from './shop.ts'
import { opened, workFolder } from './work.ts'

/** The tables of an app that a store holds: every one but the engine's own. */
export const appTables = (store: Store): TableLayout[] =>
  store.layout().filter((table) => !table.name.startsWith('_t_'))

/** Answers the steps that lead from what a store holds to what a description asks for, with what was found. */
export function planned(store: Store, description: Description) {
  const removed = description.project.removed
  return planTableChanges(appTables(store), layoutOf(description), {
    removed: Array.isArray(removed) ? removed.map(String) : [],
  })
}

/**
 * Switches a store to a description, as a start does: the steps are planned, nothing is found and every row fits,
 * and they are applied as the first act of one write that said it holds table steps. Answers the steps.
 */
export function switched(store: Store, description: Description, o: { seal?: Seal } = {}): TableStep[] {
  const { steps, findings } = planned(store, description)
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    [],
  )
  assert.deepEqual(findMisfits(store, steps), [])
  store.write((tx) => applySteps(tx, store, steps, o), { steps: true })
  // What the file then holds is what the description asks for: a second plan holds no step.
  assert.deepEqual(planned(store, description).steps, [])
  return steps
}

/** Opens a store on a new folder of the test, with the tables of the definitions it is handed. Answers both. */
export function started(t: TestContext, definitions: object[], o: { seal?: Seal } = {}) {
  const description = described(definitions)
  const store = opened(workFolder(t))
  switched(store, description, o)
  return { store, description }
}

/** The codes of what a plan found, in their order. */
export const foundIn = (store: Store, description: Description): string[] =>
  planned(store, description).findings.map((one) => one.code)

/** Where SQLite keeps a table in the file: a table that was built anew is kept at another place. */
export const placeOf = (store: Store, table: string): unknown =>
  Object(store.sql?.('SELECT "rootpage" FROM sqlite_master WHERE "type" = \'table\' AND "name" = ?', [table])[0])
    .rootpage
