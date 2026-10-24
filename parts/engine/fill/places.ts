import type { FileName, Store, Tx } from '../../data/index.ts'
import type { Opened } from '../opened.ts'

/** One file that rows of a filled table stand in: the shared file, or the file of a tenant that is open. */
export interface FillPlace {
  store: Store
  file?: FileName
}

/** Which files of a tenant table are meant: one tenant's by its id, or every file on the disk. */
export interface Within {
  of?: string
  all?: boolean
}

/**
 * The files that the rows of a table stand in: the shared one, or the files of tenants. Of a tenant table
 * they are the files that are open now; with `of` the file of that tenant, and with `all` every file of it on
 * the disk, each opened where it is closed.
 */
export function placesOf(o: Opened, table: string, within: Within = {}): FillPlace[] {
  const column = o.description.tables[table]?.tenant
  if (column === undefined || !o.files) return [{ store: o.store }]
  const tenants = typeof column === 'string' ? column : ''
  const files =
    within.of !== undefined
      ? [{ table: tenants, id: within.of }]
      : within.all === true
        ? [...o.files.walk()].filter((file) => file.table === tenants)
        : o.files.open()
  const places: FillPlace[] = []
  for (const file of files) {
    const store = o.files.of(file)
    if (store) places.push({ store, file })
  }
  return places
}

/** One write of the file of a place, through what marks the filled columns. */
export function writeAt<T>(o: Opened, place: FillPlace, work: (tx: Tx) => T): T {
  if (o.files) return o.files.write((w) => work(w.tx(place.file))).value
  return o.store.write(work).value
}
