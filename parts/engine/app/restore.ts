import { TentError } from '../../core/index.ts'
import { basename } from 'node:path'
import { restore } from '../../data/index.ts'
import { archiveOf } from '../archived/archive.ts'
import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { changeTables, engineTables } from '../tableChanges.ts'
import { queryThreads } from '../threads/pool.ts'

/**
 * `app.restore`: puts the file of a snapshot back under the running app. The calls of actions that are under way
 * are waited for, every connection to the data is closed, those of the query threads among them, the file is
 * swapped, and the table changes are applied to what it holds. A file that is no data file leaves the data as it was.
 */
export const member =
  (o: Opened): App['restore'] =>
  async (file) => {
    heldOpen(o)
    // A reader's data is its writer's: nothing is put back under it, in any mode.
    if (o.machine.reader)
      throw new TentError('T0030', "This machine is a reader, and a restore is the writer's.", {
        fix: `Restore on the writer, at ${o.machine.reader.writer()}: its readers then fetch the data anew.`,
      })
    // An app on one machine holds nothing of itself that another file could change: what does is loaded for the others.
    const { afterRestore, beforeRestore } = o.machine.many()
      ? await import('../copy/restored.ts')
      : { afterRestore: () => undefined, beforeRestore: () => undefined }
    const before = beforeRestore(o)
    await Promise.allSettled([...o.inFlight])
    // No run writes into a file that is being put back: the runner is closed, and started again on what was put back.
    await o.flows?.runner.close()
    const threads = o.threads
    if (threads) {
      delete o.threads
      await threads.close()
    }
    // The moment the file was put back divides the history of the archive: what was written after it rests on it.
    let putAt: number | undefined
    try {
      if (o.tenantFiles) {
        // The folder of a backup: every file is put back, and the files that it does not name are removed.
        const { restoreFiles } = await import('../files/backups.ts')
        await restoreFiles(o, o.tenantFiles, file, () => {
          putAt = o.clock.now()
          if (before) afterRestore(o, before)
        })
      } else {
        await restore(o.store, file)
        putAt = o.clock.now()
        if (before) afterRestore(o, before)
        changeTables(o.store, o.description, await engineTables())
      }
    } finally {
      const archive = archiveOf(o)
      if (archive && putAt !== undefined) {
        const name = basename(file)
        const known = (await archive.backups()).backups.some((one) => one.name === name)
        await archive.restored({ at: putAt, ...(known ? { from: name } : {}) })
      }
      if (threads) o.threads = queryThreads(o)
      await o.flows?.again()
    }
  }
