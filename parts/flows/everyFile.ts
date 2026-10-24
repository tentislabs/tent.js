import type { Files, Store } from '../data/index.ts'
import { runsTable } from './tables.ts'

/** Whether a store holds the run tables: one that holds none holds no run. */
export const holdsRuns = (store: Store): boolean => store.layout().some((one) => one.name === runsTable.name)

/**
 * Takes the shared store, the files of the tenants where the app keeps any, and what is read of one store. Reads
 * in every file of the app that holds the run tables: the shared one first, and each file of a tenant in turn, a
 * closed one opened for it and closed again once it was read, unless `keep` says of what it answered that it is
 * to stay open. Other work is let in between two files. Answers what each read answered, in that order.
 */
export async function inEveryFile<T>(
  shared: Store,
  files: Files | undefined,
  read: (store: Store) => T,
  keep: (found: T) => boolean = () => false,
): Promise<T[]> {
  const found = holdsRuns(shared) ? [read(shared)] : []
  const open = (file: { table: string; id: string }): boolean =>
    files?.open().some((one) => one.table === file.table && one.id === file.id) === true
  for (const file of files ? [...files.walk()] : []) {
    const wasOpen = open(file)
    const store = files?.of(file)
    const here = store && holdsRuns(store) ? [read(store)] : []
    found.push(...here)
    if (!wasOpen && !here.some(keep)) files?.close(file)
    await new Promise<void>((next) => setImmediate(next))
  }
  return found
}
