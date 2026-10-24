import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sqliteStore } from '../../data/index.ts'
import type { App } from '../app.ts'
import { metaOf } from '../held.ts'
import { holdsFile } from '../files.ts'

/** The version that the data of a folder ran last, read to read alone, or nothing for a folder that holds no data. */
function ranIn(dataFolder: string): string | undefined {
  if (!existsSync(join(dataFolder, 'data.db'))) return undefined
  const store = sqliteStore()
  try {
    store.open(dataFolder, { readOnly: true })
    const version: unknown = metaOf(store, 'version')
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  } finally {
    try {
      store.close()
    } catch {
      // A store that never opened has nothing to close.
    }
  }
}

/**
 * Opens an app with `move`: where its data ran another version, whose copy the data folder keeps, the app is
 * opened on that version, the bundle is added beside it, and it is switched to with `move`, so that the rows of a
 * table that gains or loses `tenant` are moved as a switch moves them. A folder with no such version opens on the
 * bundle as any opening does. A switch that is refused closes the app again, and its error is thrown.
 */
export async function openMoved(
  open: (bundleFolder: string) => Promise<App>,
  bundleFolder: string,
  dataFolder: string,
  version: string,
): Promise<App> {
  const ran = ranIn(dataFolder)
  const kept = ran === undefined ? undefined : join(dataFolder, 'versions', ran)
  if (!kept || ran === version || !holdsFile(kept, 'description.json')) return open(bundleFolder)
  const app = await open(kept)
  try {
    await app.switch(await app.add(bundleFolder), { move: true })
    return app
  } catch (error) {
    await app.close()
    throw error
  }
}
