import type { Change } from './changes.ts'
import type { Misfit } from './findMisfits.ts'
import { findMisfits } from './findMisfits.ts'
import { holdTo } from './holdSteps.ts'
import { isChecked } from './metaKeys.ts'
import type { OnThread } from './onThread.ts'
import { fileWrite } from './onThread.ts'
import type { Store, TableStep } from './store.ts'

/**
 * Takes the store of one tenant's file, the steps of a table change, and the version they lead to. Counts the
 * rows of that file that do not fit a step, for the tables the file holds. Where there are none, it writes, in one
 * write, a hold for each step that is checked against the rows: from then on every write of that file is held to
 * the step, and for a new `unique` rule the store makes the index at once. Answers the misfits, and with `thread`
 * the change of that write. A file that holds none of the checked tables, and one that is held to each step
 * already, is written nothing.
 */
export function checkAndHold(
  store: Store,
  steps: TableStep[],
  version: string,
  o: { thread?: OnThread } = {},
): { misfits: Misfit[]; change?: Change } {
  const tables = new Map(store.layout().map((one) => [one.name, one]))
  const mine = steps.filter((step) => tables.has(step.table))
  const misfits = findMisfits(store, mine)
  if (misfits.length) return { misfits }
  const checked = mine.filter((step) => isChecked(step, tables.get(step.table)))
  if (!checked.length) return { misfits }
  const change = fileWrite(store, { ...o, steps: false }, (tx, stepping) => {
    return holdTo(tx, (indexes) => stepping.applyTableChanges(indexes), version, checked, tables) > 0
  })
  return change ? { misfits, change } : { misfits }
}
