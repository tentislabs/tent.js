import type { Change } from './changes.ts'
import { letGo } from './holdSteps.ts'
import { holdsIn } from './metaKeys.ts'
import type { OnThread } from './onThread.ts'
import { fileWrite } from './onThread.ts'
import type { Store } from './store.ts'

/**
 * Takes the store of one tenant's file and a version. Takes the holds of that version away, in one write, and
 * drops the index of each `unique` rule that was held: the check they were written for was refused, or the switch
 * went back. Answers nothing, and with `thread` the change of that write. A file that holds no hold of that
 * version is written nothing.
 */
export function dropHolds(store: Store, version: string, o: { thread?: OnThread } = {}): Change | undefined {
  if (!holdsIn(store).some((hold) => hold.version === version)) return undefined
  return fileWrite(store, { ...o, steps: true }, (tx, stepping) => {
    letGo(
      tx,
      (drops) => stepping.applyTableChanges(drops),
      (hold) => hold.version === version,
    )
    return true
  })
}
