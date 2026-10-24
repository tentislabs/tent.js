import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Description } from '../core/internal.ts'
import { backup, sqliteStore } from '../data/index.ts'
import { archiveOf } from './archived/archive.ts'
import type { Opened } from './opened.ts'

const system = { kind: 'system' } as const

const day = 86_400_000

/** What `backups` of a project says, with what holds for each entry that it leaves out. */
export function backupsOf(description: Description): {
  every: number | false
  keep: number
  beforeChanges: boolean
  test: boolean
} {
  const stated: Record<string, unknown> = Object(description.project.backups)
  return {
    every: stated.every === false ? false : typeof stated.every === 'number' && stated.every > 0 ? stated.every : day,
    keep: typeof stated.keep === 'number' ? Math.max(1, Math.floor(stated.keep)) : 7,
    beforeChanges: stated.beforeChanges !== false,
    test: stated.test !== false,
  }
}

/** The folder that the backups of a data folder are kept in. */
const backupsFolder = (dataFolder: string): string => join(dataFolder, 'backups')

/** The backups of a data folder, by their names, in the order they were made. */
export const backupsIn = (dataFolder: string): string[] =>
  existsSync(backupsFolder(dataFolder))
    ? readdirSync(backupsFolder(dataFolder))
        .filter((name) => /^data-.*\.db$/.test(name))
        .sort()
    : []

/**
 * Restores a backup to a temporary file, opens it, and counts the rows of every table that is in use. Answers the
 * count. Throws where the file does not open as data, or a table of it cannot be read.
 */
function restored(file: string, intoFolder: string): number {
  const folder = mkdtempSync(join(intoFolder, '.test-'))
  const store = sqliteStore()
  try {
    cpSync(file, join(folder, 'data.db'))
    store.open(folder, { readOnly: true })
    let rows = 0
    for (const table of store.layout()) {
      if (table.retired || table.name.startsWith('_t_')) continue
      rows += Number(store.read({ from: table.name, count: true }, system).value)
    }
    return rows
  } finally {
    try {
      store.close()
    } catch {
      // A store that never opened has nothing to close.
    }
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

/**
 * Takes what the engine holds of an app. Makes a backup of its data in `backups/` of its data folder, restores it
 * to a temporary file and counts its rows where the project does not say otherwise, says the result in the log,
 * and removes the backups that are older than the newest ones the project keeps. A backup that cannot be restored
 * is no backup: it is removed, the log says so, and the older ones stay. Answers the file, the number of the last
 * write it holds, and the rows that the test counted. `whole` is for an app that keeps a data file for each
 * tenant: every file is copied, also one that the backup before holds as it is. The archive of the app, where it
 * keeps one, is told of the backup, which it rests on.
 */
export async function takeBackup(
  o: Opened,
  how: { whole?: boolean } = {},
): Promise<{ file: string; writes: number; rows?: number }> {
  // An app that keeps a data file for each tenant is backed up file by file, into a folder.
  if (o.tenantFiles) return (await import('./files/backups.ts')).backUpFiles(o, o.tenantFiles, how)
  const says = backupsOf(o.description)
  // The moment the backup is begun at, by the clock of the app: every write it does not hold is committed after it.
  const at = o.clock.now()
  const folder = backupsFolder(o.dataFolder)
  mkdirSync(folder, { recursive: true })
  const before = new Set(backupsIn(o.dataFolder))
  const { n } = await backup(o.store, folder)
  // The backup answers its number alone: its file is the one that the folder did not hold before.
  const name = backupsIn(o.dataFolder).findLast((one) => !before.has(one)) ?? ''
  const file = join(folder, name)
  const line = (level: string, message: string, data: object): void =>
    o.log.write('lines', { at: o.clock.now(), level, message, data: JSON.stringify(data) })
  let rows: number | undefined
  if (says.test)
    try {
      rows = restored(file, folder)
      line('info', 'A backup was taken, and restored as a test.', { file: name, rows })
    } catch (error) {
      rmSync(file, { force: true })
      line('error', 'A backup could not be restored, and is not kept as one.', { file: name, error: String(error) })
      throw error
    }
  for (const old of backupsIn(o.dataFolder).slice(0, -says.keep)) rmSync(join(folder, old), { force: true })
  await archiveOf(o)?.backedUp({ name, n, at }, backupsIn(o.dataFolder))
  return { file, writes: n, ...(rows === undefined ? {} : { rows }) }
}
