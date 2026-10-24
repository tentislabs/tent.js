import type { Here } from '../../data/index.ts'
import { beginEpoch, changesTable, here, keepChanges, newMark, setHere } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { table as rateTable } from '../tables/rate.ts'
import { epochNumber, epochOf } from '../held.ts'

const system = { kind: 'system' } as const

/** Takes every row of one table of a machine's own away, by the column that is its key. */
function emptied(o: Opened, table: string, key: string): void {
  const rows = o.store.read({ from: table }, system).value
  const keys = (Array.isArray(rows) ? rows : []).map((row) => row[key])
  if (keys.length)
    o.store.write((tx) => {
      for (const one of keys) tx.remove(table, typeof one === 'number' ? one : String(one), system)
    })
}

/** What a writer holds of itself and of its epoch, taken before another file is put in the place of its data. */
export interface Before {
  mine: Here
  epoch: number
}

/** Answers what a writer holds of itself before a restore. */
export const beforeRestore = (o: Opened): Before => ({ mine: here(o.store), epoch: epochNumber(epochOf(o.store)) })

/**
 * Takes a writer whose data file was just put back, and what it held of itself before. The file brought its own
 * `_t_here` and its epoch: the writer sets `_t_here` to its own again, keeping its id and its role, empties
 * `_t_rate` and `_t_changes`, and begins a new epoch in a write that is its first change, one more than the higher
 * of the number the file held and the number it held itself. No reader's place fits then: each fetches the data anew.
 */
export function afterRestore(o: Opened, before: Before): void {
  const { mine } = before
  setHere(o.store, {
    id: mine.id,
    role: 'writer',
    mode: o.mode,
    own: mine.own,
    from: undefined,
    far: undefined,
    near: undefined,
    took: undefined,
    back: undefined,
    stopped: undefined,
    kept: undefined,
    keptFrom: undefined,
  })
  emptied(o, rateTable.name, 'key')
  emptied(o, changesTable.name, 'n')
  keepChanges(o.files ?? o.store)
  // The readers are told to fetch the data anew before the first change of the new epoch is made: one that was
  // sent that change would find that it does not fit, and keep what it held as if its writer lacked it.
  o.machine.writer?.gaveUp()
  // The data says which epoch began so: a writer that is started again still knows what was given up on purpose.
  o.store.write((tx) => setHere(tx, { restored: beginEpoch(tx, mine.id, { above: before.epoch }) }))
  o.machine.writer?.gaveUp()
}

/**
 * Takes a writer that lost writes of its shared file to a power cut, and goes on with what it holds. As after a
 * file was put back, it keeps none of the changes it kept, so that no place of a reader fits and each fetches the
 * data anew, keeps its changes from the number that its files hold, and begins a new epoch in a write that is its
 * first change. It stands back for nobody any more. Answers the epoch.
 */
export function afterLoss(o: Opened): string {
  const mine = here(o.store)
  setHere(o.store, { kept: undefined, keptFrom: undefined, back: undefined })
  emptied(o, changesTable.name, 'n')
  keepChanges(o.files ?? o.store)
  // The mark of the sweep is made anew with the epoch: every file is swept when it is next opened.
  const epoch = o.store.write((tx) => {
    if (o.tenantFiles) newMark(tx)
    return beginEpoch(tx, mine.id)
  }).value
  o.log.write('lines', {
    at: o.clock.now(),
    level: 'warn',
    message:
      'This writer lost writes of its shared file while a data file of a tenant kept later ones. It goes on with what it holds, under a new epoch, and its readers fetch the data anew.',
    data: JSON.stringify({ epoch }),
  })
  return epoch
}
