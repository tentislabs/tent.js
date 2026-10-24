import { TentError } from '../core/index.ts'
import { tenantIn } from './tenantIn.ts'
import { countsRemovals, newMark } from './metaKeys.ts'
import { placeOf } from './place.ts'
import type { Store } from './store.ts'
import { swapIn } from './swapIn.ts'

/**
 * Takes a store and the file of a backup. Puts the backup in the place of the data file: it closes the store,
 * swaps the file, removes with the old file the two files SQLite kept beside it, and opens the store again as it
 * was opened. Whoever calls it has stopped the writes and closed every other connection to the file first. A
 * searcher and a sink that are connected are started anew by the opening. The mark of the count of removals is
 * made anew. Answers a promise. Throws T0009 for a file that is no data file, and for a file that the disk did not
 * let in its place, each with the store open on the data as it was, and T0013 for a store that keeps no file of
 * its own.
 */
export async function restoreStore(store: Store, file: string): Promise<void> {
  const place = placeOf(store)
  if (!place)
    throw new TentError(
      'T0013',
      'A backup is put back into a store that keeps one data file, and this store keeps none.',
      {
        fix: 'Put the data of a store of your own back with the tools of that store.',
      },
    )
  // A file that is no data file fails here, before anything is closed.
  tenantIn(file)
  store.close()
  try {
    swapIn(file, place.file)
  } catch (error) {
    // The store is opened again on what stands in the place, so that the app goes on with the data as it was.
    store.open(place.handed, place.how)
    const failed = new TentError(
      'T0009',
      `The backup could not be put in the place of the data file: ${error instanceof Error ? error.message : error}`,
      { fix: 'Put it back again once nothing else holds the data file.' },
    )
    failed.cause = error
    throw failed
  }
  store.open(place.handed, place.how)
  // Each file of a tenant is then swept when it is next opened, whatever count it stands at.
  if (!place.how.readOnly && countsRemovals(store)) store.write((tx) => newMark(tx))
}
