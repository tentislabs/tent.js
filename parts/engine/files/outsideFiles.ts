import type { Store } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { readAllAgain } from '../readAgain.ts'

// The count of the changes of other connections that each open file of a tenant was last read at.
const held = new WeakMap<Store, number>()

/** Begins the count of a file of a tenant that was just opened, where it is not counted yet. Answers the store. */
export function countFrom(store: Store): Store {
  if (!held.has(store))
    try {
      held.set(store, store.changes())
    } catch {
      // A store that cannot tell is read at its first write.
    }
  return store
}

/** Whether this machine is a reader. A machine that is ended or not yet made is none: the write goes on as it would. */
function reads(o: Opened): boolean {
  try {
    return o.machine.reader !== undefined
  } catch {
    return false
  }
}

/**
 * The net for a write from outside, for the file of a tenant, while it stands open: before a write of the engine
 * reaches the file, the count of the changes of other connections is read, and where it moved, every live group
 * is run again and the log says so. A reader is left out: its files are written by what its writer sends. What a
 * program writes while the file is closed is not seen: the count begins anew at each opening.
 */
export function filesOutside(o: Opened, store: Store | undefined): void {
  if (!store || reads(o)) return
  const was = held.get(store)
  const now = store.changes()
  held.set(store, now)
  if (was === undefined || was === now) return
  o.log.write('lines', {
    at: o.clock.now(),
    level: 'warn',
    message: 'The data file of a tenant was written from outside the engine: every live query is run again.',
    data: JSON.stringify({
      fix: 'Let no other program write the data files of a running app: write through a change of the app.',
    }),
  })
  readAllAgain(o)
}
