import { isAbsolute } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { FileName, Files, Store, TableLayout } from '../../data/index.ts'
import { NotReady, openFiles, sqliteStore } from '../../data/index.ts'
import { metaOf } from '../held.ts'
import { liesElsewhere, placeSaid, toldCount } from './held.ts'

/**
 * A store of a query thread: the store that ships, opened to read alone whatever stands on the disk. What is
 * opened at no place of the disk is the empty file in memory that stands in for a tenant with no file: it is made
 * there with the tables of its layout, and reaches no disk.
 */
function readingStore(): Store {
  const store = sqliteStore()
  return { ...store, open: (where, how) => store.open(where, isAbsolute(where) ? { ...how, readOnly: true } : how) }
}

/**
 * The error of a thread that would have to write a file of a tenant to read it: the file lacks a table of its
 * layout, which raw SQL with `of` must see. The main thread makes the table, and hands the read over again.
 */
const lacksTables = (file: FileName): NotReady => Object.assign(new NotReady(file), { lacks: true })

/**
 * Takes the data folder of an app, its layout, and the fingerprint that a file of each table of tenants holds
 * at the running layout. Answers the files of the app for a query thread: each file is opened to read alone, and
 * one that is behind or unswept is not read: the thread says so, and the main thread makes the file ready and
 * hands the read over again.
 */
export function threadFiles(
  dataFolder: string,
  layout: TableLayout[],
  fingerprints: Record<string, string>,
): Files & { number(): number } {
  const files = openFiles(dataFolder, layout, {
    store: readingStore,
    before(file: FileName, store: Store) {
      const held = metaOf(store, 'fingerprint')
      const running = Object.hasOwn(fingerprints, file.table) ? fingerprints[file.table] : undefined
      const behind = typeof held === 'string' && running !== undefined && held !== running
      const unswept = metaOf(store, 'tenant') !== undefined && metaOf(store, 'swept') !== toldCount(files.shared)
      // A file that names another tenant than the place it lies at is read by no thread: the main thread moves it aside.
      const elsewhere = liesElsewhere(placeSaid(store), file)
      return behind || unswept || elsewhere ? 'wait' : 'ready'
    },
  })
  return Object.assign(files, {
    // A thread writes nothing: the one write that a read asks for, of the tables that a file lacks, is the main thread's.
    write(fn: Parameters<Files['write']>[0]): never {
      fn({
        files,
        tx(file) {
          if (file) throw lacksTables(file)
          throw new TentError('T0012', 'A write was tried on a query thread, which only reads.')
        },
      })
      throw new TentError('T0012', 'A write was tried on a query thread, which only reads.')
    },
    number(): number {
      throw new TentError('T0013', 'A query thread writes nothing, and takes no number of a write.')
    },
  })
}
