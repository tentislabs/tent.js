import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { rowIds } from '../engine/index.ts'
import type { App } from '../engine/index.ts'
import type { One } from './state.ts'
import { historyOf } from './state.ts'

/** The folder of the snapshots of a workspace's data, beside its data. */
const folderOf = (one: One): string => join(one.folders.root, 'turns')

/** Takes a snapshot of the test data of a workspace for a turn, and answers its file and the store's count of changes. */
export async function snapshotFor(one: One, app: App, name: string): Promise<{ file: string; count: number }> {
  mkdirSync(folderOf(one), { recursive: true })
  const file = join(folderOf(one), `${name}.db`)
  const { writes } = await app.snapshot(file)
  return { file, count: writes }
}

/** The store's count of changes of the test data of a workspace as it stands, by a snapshot that is thrown away. */
export async function countNow(one: One, app: App): Promise<number> {
  const { file, count } = await snapshotFor(one, app, `now-${rowIds.next()}`)
  rmSync(file, { recursive: true, force: true })
  return count
}

/** Takes away a snapshot of the data, a file or the folder of an app that keeps a file for each tenant. */
const dropSnapshot = (file: string): void => rmSync(file, { recursive: true, force: true })

/**
 * Takes the workspace and how many turns keep their snapshots. Takes away the snapshots of every older turn, and
 * writes its row without them: such a turn can still be undone for its files.
 */
export function keepSnapshots(one: One, kept: number): void {
  const history = historyOf(one)
  for (const row of history.turns().slice(kept)) {
    if (row.dataBefore === undefined && row.dataAfter === undefined) continue
    for (const file of [row.dataBefore, row.dataAfter]) if (file) dropSnapshot(file)
    const { dataBefore: _, dataAfter: __, ...rest } = row
    history.turn(rest)
  }
}
