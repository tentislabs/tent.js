import { TentError } from '../../core/index.ts'
import type { Change, FileName } from '../../data/index.ts'
import { applyChange, keptChanges } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import type { Failed } from './directory.ts'
import { rowsIn, saidFields, setRow } from './directory.ts'
import type { TenantFiles } from './face.ts'
import { fileKeyOf, sizeOf } from './held.ts'
import type { FetchFile } from './reading.ts'
import { fetchNow } from './reading.ts'

/**
 * Whether a change brings a file to another layout: the write of a file thread of the writer, which may rebuild a
 * table. A commit that made a table with its first row holds steps that make tables alone, and is a write like any.
 */
const raises = (change: Change): boolean => change.layout?.steps.some((step) => step.do !== 'addTable') === true

/** Whether an error says that a change does not fit the file it is applied to. */
const isUnfit = (error: unknown): boolean => error instanceof TentError && error.code === 'T0033'

// How many pieces of work on each file wait to be done, by the files of each app: a kept change that is put into
// the file, and a file that is fetched.
const waiting = new WeakMap<TenantFiles, Map<string, number>>()

// The files that a reader which started owes a fetch, by the files of each app: it fetches them once it has a link.
const owed = new WeakMap<TenantFiles, Map<string, FileName>>()

// How many fetches of each file wait or are under way, by the files of each app.
const fetched = new WeakMap<TenantFiles, Map<string, number>>()

/** Counts one fetch of a file that begins to wait, or with `-1` one that ended. */
function counted(tenantFiles: TenantFiles, key: string, by: 1 | -1): void {
  const counts = fetched.get(tenantFiles) ?? new Map<string, number>()
  fetched.set(tenantFiles, counts)
  const left = (counts.get(key) ?? 0) + by
  if (left > 0) counts.set(key, left)
  else counts.delete(key)
}

/**
 * Takes the files of a reader. Answers how many files of tenants it is still fetching: each file whose fetch
 * waits or is under way, and each that it owes a fetch since it started.
 */
export function fetchesLeft(tenantFiles: TenantFiles): number {
  const keys = new Set([...(fetched.get(tenantFiles)?.keys() ?? []), ...(owed.get(tenantFiles)?.keys() ?? [])])
  return keys.size
}

/**
 * Does work on a file whose change was kept, once the work that is under way on that file has ended: the file is
 * fetched for a change that holds `fetch`, a change of a layout is put into it on a file thread, and any other
 * here. Every request for the file is handed on meanwhile. A change that cannot be put into the file has the file
 * fetched from the writer. The row of the file says that it is written until the last such work is done.
 */
function later(o: Opened, tenantFiles: TenantFiles, file: FileName, change: Change | 'fetch', fetch: FetchFile): void {
  const counts = waiting.get(tenantFiles) ?? new Map<string, number>()
  waiting.set(tenantFiles, counts)
  const key = fileKeyOf(file)
  counts.set(key, (counts.get(key) ?? 0) + 1)
  // The row stays marked while more work on the file waits: a stop then finds what the file does not hold yet.
  const more = (): boolean => (counts.get(key) ?? 1) > 1
  const whole = change === 'fetch' || change.fetch === true
  if (whole) counted(tenantFiles, key, 1)
  const work = async (): Promise<void> => {
    let failed: Failed | undefined
    try {
      if (whole) await fetchNow(o, tenantFiles, file, fetch, more())
      else if (raises(change) && tenantFiles.files.has(file)) await tenantFiles.applied(file, change)
      else tenantFiles.applying(() => applyChange(tenantFiles.files, change))
    } catch (error) {
      // An app that is closed leaves the change kept: the work is done when the app starts again.
      if (o.closed) return
      try {
        await fetchNow(o, tenantFiles, file, fetch, more())
      } catch (again) {
        failed = { message: `${String(error)}, and the file could not be fetched: ${String(again)}` }
        tenantFiles.line('error', 'A change of the writer could not be put into the data file of a tenant.', {
          ...file,
          ...(change === 'fetch' ? {} : { n: change.n }),
          ...failed,
        })
      }
    } finally {
      const left = (counts.get(key) ?? 1) - 1
      if (left) counts.set(key, left)
      else counts.delete(key)
      if (whole) counted(tenantFiles, key, -1)
    }
    if (!tenantFiles.files.has(file)) return
    const fields = {
      ...saidFields(tenantFiles.peek(file)),
      size: sizeOf(tenantFiles.files.path(file)),
      open: counts.has(key),
      failed: failed ?? null,
    }
    tenantFiles.sharedWrite((tx) => setRow(tx, file, fields))
  }
  void tenantFiles.queued(file, work).catch((error: unknown) => {
    if (!o.closed)
      tenantFiles.line('error', 'The row of a data file could not be written.', { ...file, error: String(error) })
  })
}

/**
 * Takes what the engine holds of a reader, its files, one change of its writer, and what fetches a file. Puts the
 * change into the files: the write of the file that it names and its kept change. A change that holds `fetch`,
 * and one that brings a file to another layout, is kept first, so that the reader says at once that it holds it:
 * the file is fetched, or the change is put into the file on a file thread, while the changes of other files go
 * on; so is every change of a file that such work is under way on. For a change whose running fingerprint does
 * not fit its file, the reader fetches that one file and keeps the change. Throws what `applyChange` throws for a
 * change of the shared file that does not fit.
 */
export async function applyToFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  change: Change,
  fetch: FetchFile,
): Promise<void> {
  const file = change.file
  if (file && (change.fetch || (tenantFiles.files.has(file) && (raises(change) || tenantFiles.isBusy(file))))) {
    // The row is marked in a write that has reached the disk before the change is kept: a stop finds it so.
    tenantFiles.handOver(file)
    // The kept change alone: the store of the shared file is handed in, and none of the files.
    applyChange(tenantFiles.files.shared, change, { only: 'kept' })
    later(o, tenantFiles, file, change, fetch)
    return
  }
  try {
    tenantFiles.applying(() => applyChange(tenantFiles.files, change))
  } catch (error) {
    if (!file || !isUnfit(error)) throw error
    tenantFiles.handOver(file)
    applyChange(tenantFiles.files.shared, { ...change, fetch: true }, { only: 'kept' })
    later(o, tenantFiles, file, 'fetch', fetch)
  }
}

/**
 * Takes the files of a reader that starts. A stop may have left a change kept that its file does not hold yet:
 * each kept change above the number of a file that is marked open is put into that file from its record, in
 * order. A file with a kept change above its number that holds `fetch` is fetched whole in place of that: it is
 * owed until the reader has a link. Answers the keys of the files that a fetch is owed.
 */
export function applyKept(tenantFiles: TenantFiles): Set<string> {
  const marked = new Map<string, { file: FileName; held: number }>()
  for (const row of rowsIn(tenantFiles.files.shared))
    if (row.open)
      marked.set(fileKeyOf(row.file), {
        file: row.file,
        held: tenantFiles.files.has(row.file) ? (tenantFiles.peek(row.file)?.writes ?? 0) : 0,
      })
  const fetches = new Map<string, FileName>()
  owed.set(tenantFiles, fetches)
  if (!marked.size) return new Set()
  const from = Math.min(...[...marked.values()].map((one) => one.held))
  const of = (change: Change): { key: string; file: FileName; held: number } | undefined => {
    const one = change.file ? marked.get(fileKeyOf(change.file)) : undefined
    return one && change.file && change.n > one.held ? { key: fileKeyOf(change.file), ...one } : undefined
  }
  for (const change of keptChanges(tenantFiles.files.shared, from)) {
    const mine = of(change)
    if (mine && change.fetch) fetches.set(mine.key, mine.file)
  }
  for (const change of keptChanges(tenantFiles.files.shared, from)) {
    const mine = of(change)
    // The file of the writer holds every change of a file that is fetched: none of them is put into it here.
    if (!mine || fetches.has(mine.key) || !tenantFiles.files.has(mine.file)) continue
    try {
      tenantFiles.applying(() => applyChange(tenantFiles.files, change))
      mine.held = change.n
      marked.set(mine.key, { file: mine.file, held: change.n })
    } catch (error) {
      // The next change of that file does not fit it, and has it fetched.
      marked.delete(mine.key)
      tenantFiles.line('error', 'A kept change could not be put into the data file of a tenant.', {
        ...change.file,
        n: change.n,
        error: String(error),
      })
    }
  }
  return new Set(fetches.keys())
}

/**
 * Takes what the engine holds of a reader whose link has just opened, its files, and what fetches a file. Fetches
 * each file that the reader owes a fetch since it started. Every request for such a file is handed on until it stands.
 */
export function fetchOwed(o: Opened, tenantFiles: TenantFiles, fetch: FetchFile): void {
  const fetches = owed.get(tenantFiles)
  if (!fetches?.size) return
  for (const file of fetches.values()) later(o, tenantFiles, file, 'fetch', fetch)
  fetches.clear()
}
