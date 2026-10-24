import type { FileName } from '../../data/index.ts'
import type { Opened } from '../opened.ts'

// The data files of tenants that each run under way read, by app: what a guard of the engine's own looks in.
const read = new WeakMap<Opened, Map<string, Map<string, FileName>>>()

/** Notes that the work of a run read the data file of a tenant. */
export function fileRead(o: Opened, run: string, file: FileName): void {
  const runs = read.get(o) ?? new Map<string, Map<string, FileName>>()
  read.set(o, runs)
  const files = runs.get(run) ?? new Map<string, FileName>()
  runs.set(run, files)
  files.set(`${file.table} ${file.id}`, file)
}

/** The data files of tenants that a run read, in the order it first read them. */
export const filesReadBy = (o: Opened, run: string): FileName[] => [...(read.get(o)?.get(run)?.values() ?? [])]

/** Forgets what a run read, once it ended. */
export const runEnded = (o: Opened, run: string): void => {
  read.get(o)?.delete(run)
}
