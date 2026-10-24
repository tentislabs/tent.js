import type { Store, Tx } from './store.ts'

// What a write carries that was begun so that it has reached the disk when it answers. A write that is put around
// another one carries it on with the members it takes over.
const reachesDisk = Symbol('toDisk')

/** Answers the write of a store as one that was begun with `toDisk`. */
export const toDiskWrite = (tx: Tx): Tx => Object.assign({ ...tx }, { [reachesDisk]: true })

/** Whether a write was begun so that it has reached the disk when it answers. */
export const isToDisk = (tx: Tx): boolean => Reflect.get(tx, reachesDisk) === true

/** Where a store keeps its one file, and how it was opened. */
interface Place {
  file: string
  // What the store was handed when it was opened: the folder of the shared file, or the path of a tenant's file.
  handed: string
  how: { readOnly?: boolean; lazy?: boolean }
  // Whether the file holds a table, asked with no copy of its layouts made.
  holds?: (table: string) => boolean
  // Tells the store whether it keeps the search index of its tables: it keeps none while a searcher is connected.
  searchIndex?: (keep: boolean) => void
}

const places = new WeakMap<Store, Place>()
// A store that wraps another, as `connected` answers one, by the store it wraps.
const wrapped = new WeakMap<Store, Store>()

/** Keeps where a store that opened a file keeps it, for whoever puts a file back in its place. */
export function keepPlace(store: Store, place: Place): void {
  places.set(store, place)
}

/** Says that one store is another with something around it: it lies where that one lies. */
export function sameStore(around: Store, store: Store): void {
  wrapped.set(around, store)
}

/** Answers the store that stands inside a store, through everything that was put around it. */
export function plainOf(store: Store): Store {
  const inside = wrapped.get(store)
  return inside ? plainOf(inside) : store
}

/** Answers where a store keeps its file, or nothing for a store that keeps none that `data` knows of. */
export const placeOf = (store: Store): Place | undefined => places.get(plainOf(store))
