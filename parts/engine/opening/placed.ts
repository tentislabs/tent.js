import type { Here } from '../../data/index.ts'
import {
  beginEpoch,
  filledBy,
  here,
  keepChanges,
  setHere,
  setRunningVersion,
  waitsForBackfill,
} from '../../data/index.ts'
import { backupsOf, takeBackup } from '../backups.ts'
import type { PlannedShared } from '../files/opening.ts'
import { versionOf } from '../held.ts'
import { applyPlanned, planTables } from '../tableChanges.ts'
import { sealedAt } from '../values/seal.ts'
import type { Data } from './data.ts'
import type { UnderWay } from './frame.ts'
import { refused } from './frame.ts'

/**
 * Takes the frame of an opening and its data, which stands open. Brings the data to what the app is among its
 * machines: for a writer it applies the table changes, after a backup where one could lose something, and writes
 * down the version that runs; for a reader it writes down whom it reads. Throws T0013 for a store that cannot be
 * copied where the app runs on many machines, T0030 for the folder of a reader or of a stopped writer that is
 * opened as a writer, and what a table change is refused with.
 */
export async function placed(f: UnderWay, data: Data): Promise<void> {
  const { o, w } = f
  const { dataFolder, description, version, mode } = w
  const { tables, filing, tenantFiles } = data
  const reads = w.told.reads
  // A data file that is new holds no table of the engine yet: those are made first, before it says what it is.
  const planned = reads || tenantFiles ? undefined : planTables(o.store, description, tables)
  if (planned && !planned.held && planned.own.length) {
    applyPlanned(o.store, { own: planned.own, steps: [], held: false })
    planned.own = []
  }
  const many = reads !== undefined || w.told.keys.length > 0
  /** A reader, and a writer that lets readers join, need a store that can be copied. */
  const copied = (): void => {
    if (many && !o.store.copy)
      throw refused(
        'T0013',
        'An app on many machines needs a store that can be copied, and the store of this app gives no `copy`.',
        'Run the app on the SQLite store, or give the store of your own `copy`.',
      )
  }
  /** The folder of a reader, and of a writer that was stopped, is not opened as a writer. */
  const asWriter = (role: Here['role']): void => {
    if (role === 'reader' || role === 'stopped')
      throw refused(
        'T0030',
        `The data folder ${dataFolder} is that of ${role === 'reader' ? 'a reader' : 'a writer that was stopped by the machine that took over'}: it is not opened as a writer.`,
        'Start it with `--reads <the address of the writer>`, or make it the writer with `tent take-over`.',
      )
  }
  let keeps = false
  /** Every write from here on is kept for the readers, the table changes of this opening among them. */
  const kept = (held: Here): void => {
    if (keeps || !(w.told.keys.length || held.kept)) return
    keeps = true
    keepChanges(o.files ?? o.store)
  }
  // The files of tenants are checked with the shared file: one file that does not fit refuses the opening.
  // A pass that was under way is ended first, as a writer ends it: its writes are kept for the readers.
  let shared: PlannedShared | undefined
  if (!reads && tenantFiles && filing) {
    const first = here(o.store)
    copied()
    asWriter(first.role)
    kept(first)
    await filing.endPass(o, tenantFiles, description)
    shared = await filing.planTenantFiles(o, tenantFiles, description)
  }
  const mine = here(o.store)
  // Data that was made from a place of record goes on as a new history.
  if (data.built) o.store.write((tx) => void beginEpoch(tx, mine.id))
  copied()
  const changes = planned ?? shared
  if (changes) {
    asWriter(mine.role)
    kept(mine)
    // What a table change could lose is kept first: a backup of the data as it stood. A table kept in memory is
    // made anew at each opening, and loses nothing of the file.
    const losing = changes.steps.filter((step) => !(step.do === 'addTable' && step.layout?.memory))
    if (losing.length && changes.held && backupsOf(description).beforeChanges) await takeBackup(o)
    // A column that a backfill fills is required once the backfill ran: that step waits for it.
    const fills = filledBy(description)
    const later = changes.steps.filter((step) => waitsForBackfill(step, fills))
    if (later.length) data.later = later
    const now = changes.steps.filter((step) => !waitsForBackfill(step, fills))
    if (planned) {
      applyPlanned(o.store, { ...planned, steps: now }, sealedAt(o.dataFolder))
      if (versionOf(o.store) !== version) o.store.write((tx) => setRunningVersion(tx, version))
    } else if (shared && tenantFiles) filing?.applyTenantFiles(o, tenantFiles, { ...shared, steps: now }, version)
    const fields = {
      ...(mine.mode === mode ? {} : { mode }),
      ...(mine.role === 'writer' ? {} : { role: 'writer' as const }),
      ...(w.told.own === undefined || mine.own === w.told.own ? {} : { own: w.told.own }),
    }
    if (Object.keys(fields).length) setHere(o.store, fields)
  } else if (reads && !reads.returning) {
    // Where a reader is given other values than its folder holds, the given ones are used, and written.
    const far = reads.far ? true : undefined
    if (mine.from !== reads.from || mine.far !== far || mine.own !== reads.own || mine.role !== 'reader')
      setHere(o.store, { role: 'reader', from: reads.from, far, own: reads.own })
  }
}
