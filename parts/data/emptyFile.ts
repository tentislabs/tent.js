import { makes } from './fileLayout.ts'
import { inMemory } from './sqlite/store.ts'
import type { Store, TableLayout } from './store.ts'

/**
 * Takes a store that is not open, the tables of a file as a file keeps them, and what reads. Opens the store in
 * memory, makes the tables, hands the store to what reads, and closes it: the file of a tenant that has written
 * nothing, with every table of its layout and no row. Nothing is made on the disk. Answers what the read answers.
 */
export function emptyFile<T>(store: Store, tables: TableLayout[], read: (store: Store) => T): T {
  store.open(inMemory)
  try {
    store.write(() => store.applyTableChanges(tables.map(makes)), { steps: true })
    return read(store)
  } finally {
    store.close()
  }
}
