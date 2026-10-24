import { AsyncLocalStorage } from 'node:async_hooks'
import type { FileName, Store, Touched } from '../data/index.ts'

/**
 * What one run of a query read: for each table the ids of the rows that it read by their id, or `all` where it read
 * the table in any other way.
 */
export type TablesRead = Map<string, Set<string> | 'all'>

/** What read a table, as it crosses to another thread: the name of the table, and the ids or `all`. */
export type ReadsSent = [string, string[] | 'all'][]

const runs = new AsyncLocalStorage<TablesRead>()

/** Answers what the run that is under way has read so far, or nothing where no run is watched. */
export const readsNow = (): TablesRead | undefined => runs.getStore()

/**
 * Carries a piece of work out, and answers what it answered with what it read through a store that is watched.
 * Work that answers a promise goes on reading into the same record until the promise is settled.
 */
export function reading<Answer>(work: () => Answer): { answer: Answer; reads: TablesRead } {
  const reads: TablesRead = new Map()
  return { answer: runs.run(reads, work), reads }
}

/** Notes one table that a run read: whole, or the one row that it read by its id. */
function note(reads: TablesRead, table: string, id?: string): void {
  const held = reads.get(table)
  if (held === 'all') return
  if (id === undefined) reads.set(table, 'all')
  else if (held) held.add(id)
  else reads.set(table, new Set([id]))
}

/** The name under which a run is noted to have read the file of one tenant. No table has a name that holds a space. */
export const fileNoted = (file: FileName): string => `${file.table} ${file.id}`

/** The name under which a run is noted to have read one table in the file of one tenant. */
export const tableNoted = (file: FileName, table: string): string => `${fileNoted(file)} ${table}`

/**
 * Notes that the run under way named the file of a tenant as a whole: a tenant that has no file yet, whose page
 * is so sent its first row whatever table it lands in, and a file that raw SQL read, whose tables are not known.
 */
export function noteFile(file: FileName): void {
  const reads = runs.getStore()
  if (reads) note(reads, fileNoted(file))
}

// The stores of the files that are watched already: a file that is opened again is another store.
const watchedFiles = new WeakSet<Store>()

/**
 * Takes the store of one tenant's file, and the file. From now on the store notes, for the run that is under way,
 * each table that a plan read there with its file, and for a plan that reads one row by its id that row alone.
 * The store stays the same object.
 */
export function watchFile(store: Store, file: FileName): void {
  if (watchedFiles.has(store)) return
  watchedFiles.add(store)
  const { read, sql } = store
  store.read = (plan, caller) => {
    const answer = read(plan, caller)
    const reads = runs.getStore()
    if (reads)
      for (const table of answer.tables)
        note(
          reads,
          tableNoted(file, table),
          table === plan.from && plan.one === 'get' && typeof plan.id === 'string' ? plan.id : undefined,
        )
    return answer
  }
  if (sql)
    store.sql = (text, values) => {
      noteFile(file)
      return sql(text, values)
    }
}

/** Adds what another thread read to what a run read. */
export function addReads(reads: TablesRead, sent: ReadsSent): void {
  for (const [table, ids] of sent)
    if (ids === 'all') note(reads, table)
    else for (const id of ids) note(reads, table, id)
}

/** What a run read, as it crosses to another thread. */
export const sentReads = (reads: TablesRead): ReadsSent =>
  [...reads].map(([table, ids]) => [table, ids === 'all' ? 'all' : [...ids]])

/** Whether a raw text can only read: it begins with the word that reads, and holds one statement, as the store holds it to. */
const selects = (text: string): boolean => /^\s*select\b/i.test(text)

/**
 * Takes a store, and what is told each committed write. From now on the store notes, for the run that is under
 * way, each table that a plan read, and for a plan that reads one row by its id that row alone; and after each
 * write that is committed it tells the tables and the rows that were touched, and `every` where a raw text wrote
 * and stated no table. The store stays the same object, so whatever holds it holds the watched one.
 */
export function watchStore(store: Store, wrote: (touched: Touched[], every: boolean) => void): void {
  const { read, write } = store
  store.read = (plan, caller) => {
    const answer = read(plan, caller)
    const reads = runs.getStore()
    if (reads)
      for (const table of answer.tables)
        note(
          reads,
          table,
          table === plan.from && plan.one === 'get' && typeof plan.id === 'string' ? plan.id : undefined,
        )
    return answer
  }
  store.write = (fn, how) => {
    let every = false
    const answer = write(
      (tx) =>
        fn({
          ...tx,
          sql(text, values, touches) {
            if (!touches?.length && !selects(text)) every = true
            return tx.sql(text, values, touches)
          },
        }),
      how,
    )
    wrote(answer.touched, every)
    return answer
  }
}
