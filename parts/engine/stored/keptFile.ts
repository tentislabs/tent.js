import type { Tx } from '../../data/index.ts'
import { table as filesTable } from '../tables/files.ts'

const system = { kind: 'system' } as const

/**
 * Keeps a file over the same bytes as a stored file, inside a write: a file of the engine's own, which no row holds
 * and which is not loose, so its bytes stay until what keeps it marks it removed. With `run`, it is marked as kept
 * for that run, and goes when the run is removed. Answers its id, or nothing for a file that is not there.
 */
export function keptFile(tx: Tx, id: string, run?: string): string | undefined {
  const row: unknown = tx.read({ from: filesTable.name, one: 'get', id }, system)
  if (typeof row !== 'object' || row === null) return undefined
  const same = Object.fromEntries(
    ['fingerprint', 'size', 'kind', 'name', 'width', 'height', 'tiny'].flatMap((name) => {
      const value: unknown = Reflect.get(row, name)
      return value === undefined || value === null ? [] : [[name, value]]
    }),
  )
  return String(tx.add(filesTable.name, { ...same, by: 'system', ...(run ? { run } : {}) }, system).id)
}

/** Marks the files that something kept removed, inside a write: their bytes go after `filesKept`, as any removed file's. */
export function keptGone(tx: Tx, ids: Iterable<string>, at: number): void {
  for (const id of ids) tx.change(filesTable.name, id, { removedAt: new Date(at) }, system)
}

/** Takes back the mark of files that were marked removed, inside a write, where what let them go did not stand. */
export function keptBack(tx: Tx, ids: Iterable<string>): void {
  for (const id of ids) tx.change(filesTable.name, id, { removedAt: null }, system)
}

/** Marks the files that were kept for runs removed, inside a write of the file that holds the files. */
export function runsKeptGone(tx: Tx, runs: string[], at: number): void {
  for (const run of runs) {
    const kept: unknown = tx.read(
      {
        from: filesTable.name,
        where: {
          all: [
            { col: 'run', is: run },
            { col: 'by', is: 'system' },
          ],
        },
        pick: ['id', 'removedAt'],
      },
      system,
    )
    const standing = (Array.isArray(kept) ? kept : []).filter((one) =>
      [undefined, null].includes(Object(one).removedAt),
    )
    keptGone(
      tx,
      standing.map((one) => String(Object(one).id)),
      at,
    )
  }
}
