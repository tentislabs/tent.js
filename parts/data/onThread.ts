import type { Change } from './changes.ts'
import { madeChange } from './changes.ts'
import { firstSum, hereIn, setHere, setMeta } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import { nothingNoted, watching } from './noted.ts'
import type { Store, Tx } from './store.ts'
import { changesTable, hereTable } from './tables.ts'

/**
 * What the one write of a file thread is handed. `number` is asked as the last act of the write, and answers the
 * app's next number, which the main thread hands out. `keep`: the changes of the app are kept. `epoch`: the epoch
 * of the app, as `<number>.<writer id>`.
 */
export type OnThread = { number: () => number; keep: boolean; epoch: string }

// The tables of a file that are this machine's own: no record covers them, and no change names them.
const own = new Set([hereTable.name, changesTable.name])

/**
 * Carries one write of one tenant's file out: `work` is handed the write, and the store by which it carries out
 * table steps, and answers whether it wrote anything. Without `thread` the write is one of the store it was
 * handed, as any write of the main thread is, and nothing is answered. With `thread` it is the write of a file
 * thread: the number that the thread is handed and the epoch of the app are written into the file, and the change
 * is answered. Where the changes are kept, the store is told so before the write begins, and is asked for its
 * record once, after the number is written: the file's running fingerprint moves on by it. Where they are not, the
 * store is told nothing and asked for nothing, and the change holds an empty record.
 */
export function fileWrite(
  store: Store,
  o: { thread?: OnThread; steps: boolean },
  work: (tx: Tx, stepping: Store) => boolean,
): Change | undefined {
  const { thread } = o
  if (!thread) {
    store.write((tx) => work(tx, store), { steps: o.steps })
    return undefined
  }
  if (thread.keep) store.copy?.keep()
  const noted = nothingNoted()
  const stepping: Store = {
    ...store,
    applyTableChanges(steps) {
      store.applyTableChanges(steps)
      noted.steps.push(...steps.filter((step) => !own.has(step.table)))
      noted.stepped = true
    },
  }
  let change: Change | undefined
  store.write(
    (tx) => {
      if (!work(watching(tx, noted, own, false), stepping)) return
      const n = thread.number()
      setMeta(tx, 'n', n)
      // The first write of a file under an epoch writes that epoch into the file.
      const [number, writer] = [Number(thread.epoch.split('.')[0]), thread.epoch.split('.').slice(1).join('.')]
      if (heldMeta(tx, 'epoch') !== number || heldMeta(tx, 'writer') !== writer) {
        setMeta(tx, 'epoch', number)
        setMeta(tx, 'writer', writer)
      }
      change = madeChange(store, noted, own, {
        n,
        epoch: thread.epoch,
        at: Date.now(),
        sum: String(hereIn(tx).sum ?? firstSum),
        keep: thread.keep,
        file: { table: String(heldMeta(tx, 'table')), id: String(heldMeta(tx, 'tenant')) },
      })
      if (thread.keep) setHere(tx, { sum: change.sum })
    },
    { steps: o.steps },
  )
  return change
}
