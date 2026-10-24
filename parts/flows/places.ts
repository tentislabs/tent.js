import type { FileName, Store } from '../data/index.ts'
import type { RunnerEnv } from './face.ts'
import type { RunRow } from './rows.ts'
import { readRun } from './rows.ts'

/** The file of a tenant that the id of a run names, `<run>.<table>.<tenant>`, or nothing for a run of the shared file. */
export function fileOf(run: string): FileName | undefined {
  const [, table, id, more] = run.split('.')
  return table && id && more === undefined ? { table, id } : undefined
}

/** The id of a run that lives in a file: the id it was made with, and the file where it is one of a tenant. */
export const idIn = (made: string, file: FileName | undefined): string =>
  file ? `${made}.${file.table}.${file.id}` : made

/** One text for one file, and the empty one for the shared file. */
export const fileKey = (file: FileName | undefined): string => (file ? `${file.table} ${file.id}` : '')

/** Whether a run lives in a file: with no file, in the shared one. */
export const livesIn = (run: string, file: FileName | undefined): boolean => fileKey(fileOf(run)) === fileKey(file)

/**
 * The store that holds a run: the file of the tenant that its id names, opened where it is closed, and else the
 * shared file. Nothing where the id names a tenant that has no file.
 */
export function storeOf(env: RunnerEnv, run: string): Store | undefined {
  const file = fileOf(run)
  return file && env.files ? env.files.of(file) : env.store
}

/** The store that a run is read from: the file it lives in, and the shared file where its file is gone, which holds no row of it. */
export const readIn = (env: RunnerEnv, run: string): Store => storeOf(env, run) ?? env.store

/** The store that a run is written in. A run whose file is gone is written nowhere: the write is left out. */
export function writeIn(env: RunnerEnv, run: string, work: Parameters<Store['write']>[0]): void {
  storeOf(env, run)?.write(work)
}

/** One run by its id, read from the file it lives in, or nothing where it is not there. */
export function runOf(env: RunnerEnv, run: string): RunRow | undefined {
  const store = storeOf(env, run)
  return store ? readRun(store, run) : undefined
}

/** The stores that the runner works now: the shared file, and each file of a tenant that is open. */
export function storesOf(env: RunnerEnv): { store: Store; file?: FileName }[] {
  const open = env.files?.open() ?? []
  return [
    { store: env.store },
    ...open.flatMap((file) => {
      const store = env.files?.of(file)
      return store ? [{ store, file }] : []
    }),
  ]
}
