import type { Opened } from './opened.ts'
import { readAllAgain } from './readAgain.ts'

/**
 * Takes what the engine holds of an app. From now on, before each write of its store, the engine reads the count
 * that the store keeps of the changes of other connections: where it moved, another program wrote the file against
 * the rule. Then every live group is run again, and the log says that the file was written from outside. It is a
 * net and no more: what was written is met at the next write of the engine, and not before.
 */
export function watchOutside(o: Opened): void {
  const { store } = o
  const write = store.write.bind(store)
  let held: number | undefined
  /** Reads the count, and says whether it moved since it was last read. The first reading is where the engine begins. */
  const moved = (): boolean => {
    const now = store.changes()
    const was = held
    held = now
    return was !== undefined && was !== now
  }
  /** Whether this machine is a reader: its file is written by what the writer sends, and put anew where it fell behind. */
  const reads = (): boolean => {
    try {
      return o.machine.reader !== undefined
    } catch {
      return false
    }
  }
  store.write = (fn, how) => {
    if (moved() && !reads()) {
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'warn',
        message: 'The data file was written from outside the engine: every live query is run again.',
        data: JSON.stringify({
          fix: 'Let no other program write the data file of a running app: write through a change of the app.',
        }),
      })
      readAllAgain(o)
    }
    return write(fn, how)
  }
  // The file as it stands when the app opens is where the count begins.
  try {
    moved()
  } catch {
    // A store that is not open yet is read at its first write.
    held = undefined
  }
}
