import { join } from 'node:path'
import { here } from '../../data/index.ts'
import { epochOf, placeOf } from '../held.ts'
import { queryThreads } from '../threads/pool.ts'
import type { Currency } from './current.ts'
import type { Dialling } from './dialling.ts'
import { fetchData, placeData } from './fetch.ts'
import type { ReaderState } from './readerState.ts'
import { readerLine } from './readerState.ts'
import type { Waiters } from './waiters.ts'

/**
 * Takes what a reader holds of itself, what says whether it is current, what waits on it, what dials its writer,
 * whether it keeps what it held, and the address of the writer. Fetches the data of the writer anew, keeps the
 * file it had where it may hold what the writer lacks, and joins again. A fetch that fails leaves the data as it
 * was, says so in the log, and has the writer dialled again after the wait of the reader.
 */
export async function refetched(
  r: ReaderState,
  currency: Currency,
  waiters: Waiters,
  dial: Dialling,
  keep: boolean,
  address: string,
): Promise<void> {
  const { o, reads } = r
  if (r.busy || r.closed) return
  r.busy = true
  let fetched = false
  const mine = r.open
  r.open = undefined
  mine?.link.close()
  currency.current()
  const threads = o.threads
  try {
    if (threads) {
      delete o.threads
      await threads.close()
    }
    // A file thread that still puts a change into a file ends its write first: every file is replaced.
    await o.tenantFiles?.idle()
    await fetchData(r.reached(address), address, reads.key, o.dataFolder)
    const { id } = here(o.store)
    // Of an app that keeps a data file for each tenant, every file that the writer names is fetched anew too.
    let placeFiles = (_keptAs?: string): void => undefined
    if (o.tenantFiles) {
      const { fetchFiles, fetchedAtOnce, fetching } = await import('../files/reading.ts')
      const fetch = fetching(r.reached(address), address, reads.key)
      const fetched = join(o.dataFolder, 'data.db.fetch')
      placeFiles = await fetchFiles(o.dataFolder, fetched, o.tenantFiles.store, fetchedAtOnce(o), fetch)
    }
    // The store is closed, the file is swapped and the store is opened again with nothing in between.
    o.tenantFiles?.closeFiles()
    o.store.close()
    let lost: string | undefined
    try {
      lost = placeData(o.dataFolder, { id, mode: o.mode, ...reads }, keep, o.tenantFiles ? r.applied : undefined)
      // What this machine held in the files of its tenants is kept with the shared file it belongs to.
      placeFiles(lost?.replace(/\.db$/, '.tenants'))
    } finally {
      o.store.open(o.dataFolder)
    }
    readerLine(r, 'info', 'The data of the writer was fetched anew.', { address })
    if (lost)
      readerLine(r, 'warn', 'The data this machine held was kept beside the data, and the data was fetched anew.', {
        file: lost,
        ...(o.tenantFiles ? { files: lost.replace(/\.db$/, '.tenants') } : {}),
      })
    r.applied = placeOf(o).n
    r.held = epochOf(o.store)
    r.settled = 0
    currency.forget()
    r.returning = false
    fetched = true
  } catch (error) {
    readerLine(r, 'error', 'The data of the writer could not be fetched anew.', { error: String(error) })
  } finally {
    if (threads && !r.closed) o.threads = queryThreads(o)
    r.busy = false
  }
  waiters.woken()
  if (fetched) dial.round()
  else dial.again()
}
