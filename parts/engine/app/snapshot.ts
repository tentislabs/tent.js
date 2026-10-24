import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.snapshot`: the data file, written out to a file by the store's own snapshot, which is safe while writes go
 * on. It answers `{ writes }`, the number of the last write that the snapshot holds.
 */
export const member =
  (o: Opened): App['snapshot'] =>
  async (toFile) => {
    heldOpen(o)
    mkdirSync(dirname(toFile), { recursive: true })
    // Of an app that keeps a data file for each tenant, a snapshot is a folder in the form of a whole backup.
    if (o.tenantFiles) return (await import('../files/backups.ts')).snapshotFiles(o.tenantFiles, toFile)
    const { n } = await o.store.snapshot(toFile)
    return { writes: n }
  }
