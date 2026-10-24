import type { FileName, TableLayout, TableStep, Tx } from '../../data/index.ts'
import { metaTable } from '../../data/index.ts'
import { metaOf } from '../held.ts'
import type { Opened } from '../opened.ts'
import type { TenantFiles } from './face.ts'
import type { FileRow } from './directory.ts'
import { directoryRowIn, markedNext, rowsIn, setRow } from './directory.ts'
import { fileLimit, toldCount } from './held.ts'
import { borne } from './upkeep.ts'

const system = { kind: 'system' } as const
const meta = metaTable.name

/**
 * The files of the directory that stand on the disk and are behind the running layout, or behind `to` where a
 * layout is named, or failed: the open ones first, then the others by when they were last closed, the newest first.
 */
function behind(tenantFiles: TenantFiles, to?: TableLayout[]): FileName[] {
  return rowsIn(tenantFiles.files.shared)
    .filter((row) => tenantFiles.files.has(row.file))
    .map((row) => ({ row, open: tenantFiles.isOpen(row.file) }))
    .filter(({ row, open }) => {
      const said = open ? tenantFiles.peek(row.file) : row
      return row.failed !== undefined || tenantFiles.isBehind(row.file.table, said?.layout, to, said?.writes)
    })
    .sort((a, b) => Number(b.open) - Number(a.open) || (b.row.closedAt ?? 0) - (a.row.closedAt ?? 0))
    .map(({ row }) => row.file)
}

/** How many files are behind the running layout, or failed: the files that a pass has still to bring up. */
export const behindCount = (tenantFiles: TenantFiles): number => behind(tenantFiles).length

/**
 * Takes what the engine holds of an app, and its files. Brings up every file that is behind the running layout,
 * `limits.filesAtOnce` at a time, each on a file thread. With `to` it brings up every file that is behind that
 * layout, to that layout: the pass that an engine ends before it opens with another one. A file that failed
 * before is tried again. One that cannot be brought up is marked failed in the directory, and the pass ends
 * without it. With `back`, the steps of the switch that is gone back on, each file goes back to the layout it
 * held before by those steps turned round. Answers a
 * promise of how many files it brought up, which is kept when the pass has ended.
 */
export async function passOver(
  o: Opened,
  tenantFiles: TenantFiles,
  to?: TableLayout[],
  back?: TableStep[],
): Promise<number> {
  const queue = behind(tenantFiles, to)
  if (!queue.length) return 0
  tenantFiles.line('info', 'The data files of tenants that are behind are being brought up.', { files: queue.length })
  let done = 0
  let marked: FileName[] = []
  /** Marks the files that are handed over next as open, in one write that waits for the disk once. */
  const mark = (): void => {
    marked = markedNext(tenantFiles.sharedWrite, queue, { open: true, failed: null })
  }
  const worker = async (): Promise<void> => {
    for (;;) {
      if (o.closed) return
      if (!marked.length && queue.length) mark()
      const file = queue.shift()
      if (!file) return
      marked.shift()
      try {
        await tenantFiles.raise(file, {
          marked: true,
          ...(to ? { to } : {}),
          ...(back ? { back: true, turned: back } : {}),
        })
        done++
        // A file that needed nothing was handed to no thread: its mark is taken away here.
        if (!o.closed && !tenantFiles.isOpen(file) && directoryRowIn(tenantFiles.files.shared, file)?.open)
          tenantFiles.sharedWrite((tx) => setRow(tx, file, { open: false }))
      } catch {
        // The file is marked failed with its error, and the pass goes on without it.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, fileLimit(o.description, 'filesAtOnce')) }, worker))
  if (!o.closed) tenantFiles.line('info', 'The pass over the data files of tenants has ended.', { files: done })
  return done
}

/**
 * Takes the files of an app, the row of one file, and the count of removals that the shared file tells. Answers
 * whether the next opening of the file sweeps it. A row that names no count says nothing of it: the file itself
 * is asked, to read alone, as its opening asks it. A row with no file is a tenant with no file.
 */
export function isUnswept(tenantFiles: TenantFiles, row: Pick<FileRow, 'file' | 'swept'>, told: string): boolean {
  if (row.swept !== undefined) return row.swept !== told
  if (!tenantFiles.files.has(row.file)) return false
  const said = tenantFiles.peek(row.file)
  return said?.tenant !== undefined && said.swept !== told
}

// The key of `_t_meta` under which the shared file notes that a pass of a removal is under way.
const sweepKey = 'sweep'

/** Notes in the shared file, inside a write, that a pass of a removal is under way, or takes the note away. */
function noteSweep(tx: Tx, under: boolean): void {
  const there = tx.read({ from: meta, one: 'get', id: sweepKey }, system) !== undefined
  if (under && !there) tx.add(meta, { key: sweepKey, value: true }, system)
  else if (!under && there) tx.remove(meta, sweepKey, system)
}

/** Whether the shared file notes a pass of a removal that a stop left under way, which an engine that opens goes on with. */
export const sweepUnderWay = (tenantFiles: TenantFiles): boolean =>
  metaOf(tenantFiles.files.shared, sweepKey) !== undefined

/**
 * Takes what the engine holds of an app, and its files. Opens and sweeps every file whose count of removals is
 * behind the one that the shared file tells, `limits.filesAtOnce` at a time, and lets whatever else waits in the
 * program run between two files. The shared file notes the pass while it is under way, so an engine that is
 * stopped meanwhile goes on with it when it opens. Answers a promise of how many files it swept.
 */
export async function sweepAll(o: Opened, tenantFiles: TenantFiles): Promise<number> {
  const told = toldCount(tenantFiles.files.shared)
  const unswept = rowsIn(tenantFiles.files.shared).filter(
    (row) => !tenantFiles.isOpen(row.file) && tenantFiles.files.has(row.file) && isUnswept(tenantFiles, row, told),
  )
  if (unswept.length) tenantFiles.sharedWrite((tx) => noteSweep(tx, true), true)
  let swept = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const row = unswept.shift()
      if (!row || o.closed) return
      // What a hand laid in the place of a file and is no data file is borne, and the sweep goes on.
      if (borne(o, tenantFiles, row.file, true)) continue
      await tenantFiles.ready(row.file)
      swept++
      await new Promise((done) => setImmediate(done))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, fileLimit(o.description, 'filesAtOnce')) }, worker))
  if (!o.closed && sweepUnderWay(tenantFiles)) tenantFiles.sharedWrite((tx) => noteSweep(tx, false))
  return swept
}
