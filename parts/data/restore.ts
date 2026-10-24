import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { restoreFiles } from './restoreFiles.ts'
import { restoreStore } from './restoreStore.ts'
import type { Store } from './store.ts'

/**
 * Takes a store and the file of a backup. Puts the backup in the place of the data file: it closes the store,
 * swaps the file, removes with the old file the two files SQLite kept beside it, and opens the store again as it
 * was opened. Whoever calls it has stopped the writes and closed every other connection to the file first. A
 * searcher and a sink that are connected are started anew by the opening. Answers a promise. Throws T0009 for a
 * file that is no data file, with the store left as it was, and T0013 for a store that keeps no file of its own.
 * Handed the files of an app that keeps a file for each tenant, it takes the folder of a backup of them, and
 * puts back the shared file and every tenant's file, each from the backup that the list names for it, and
 * removes the files that the backup does not name; with `of` it puts back the file of that one tenant alone.
 * It then throws T0009, with nothing put back, for a list that names a backup which is not there, naming it, and
 * for a file that names another tenant as its own; and T2104 for one tenant whose row is not there.
 */
export function restore(store: Store, file: string): Promise<void>
export function restore(files: Files, folder: string, o?: { of?: FileName }): Promise<void>
export function restore(on: Store | Files, from: string, o: { of?: FileName } = {}): Promise<void> {
  return 'shared' in on ? restoreFiles(on, from, o) : restoreStore(on, from)
}
