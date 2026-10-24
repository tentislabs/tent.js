import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { backupFiles } from './backupFiles.ts'
import { newBackup } from './backupFolder.ts'
import type { Files } from './files.ts'
import type { Store } from './store.ts'

/**
 * Takes a store and a folder. Makes a snapshot of the data in a new file of that folder, by the store's own
 * `snapshot`, which is safe while writes go on. Answers a promise of the number of the last write that the file
 * holds, as `snapshot` does. The file is named after the moment it was begun at, so that the backups of a folder
 * stand in the order they were made. Handed the files of an app that keeps a file for each tenant, the backup
 * is a new folder of that folder, named the same way: it holds the shared file, every tenant's file that was
 * written since the backup that `before` names, a folder of that folder, and with `whole` every file; and its
 * list, `files.json`, names for every file the backup that holds it. It then answers the highest number that a
 * file of the backup holds. Throws T0009 where `before` names no backup.
 */
export function backup(store: Store, toFolder: string): Promise<{ n: number }>
export function backup(files: Files, toFolder: string, o?: { before?: string; whole?: true }): Promise<{ n: number }>
export async function backup(
  on: Store | Files,
  toFolder: string,
  o: { before?: string; whole?: true } = {},
): Promise<{ n: number }> {
  if ('shared' in on) return backupFiles(on, toFolder, o)
  mkdirSync(toFolder, { recursive: true })
  const { n } = await on.snapshot(join(toFolder, newBackup(toFolder, '.db')))
  return { n }
}
