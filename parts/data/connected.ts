import type { Clock } from '../core/internal.ts'
import type { Change } from './changes.ts'
import { forgetKept, keepChange, keepChanges, madeChange, recordWrites, sinkSize, sinkWait } from './changes.ts'
import { eachApart } from './eachApart.ts'
import { connectedFiles } from './connectedFiles.ts'
import type { Searcher, Wrote } from './context.ts'
import type { Files } from './files.ts'
import { epochIn, firstSum, hereIn, setHere, setMeta } from './here.ts'
import type { WriteNotes } from './noted.ts'
import { nothingNoted, numberIn, ownClock, sinkChange, tellSearcher, textsOf, vectorsIn, watching } from './noted.ts'
import { placeOf, sameStore } from './place.ts'
import type { SearcherFailed } from './searcherHanding.ts'
import { searcherHanding } from './searcherHanding.ts'
import type { ChangeSink, Handing, Whole } from './sink.ts'
import { handing, waitingSize } from './sink.ts'
import type { Bytes, Store, StoreCopy, TableLayout, Tx, WriteAnswer } from './store.ts'
import { keptOut } from './keptOut.ts'
import { metaTable } from './tables.ts'

const system = { kind: 'system' } as const

/**
 * All that a store holds, as a sink that is the place of record is handed it anew: the number it stands at, its
 * layout, and every table with its rows, the engine's own with them but for the tables of this machine alone.
 */
function wholeOf(store: Store, own: Set<string>): Whole {
  const layout = store.layout().filter((table) => !own.has(table.name) && !table.own)
  return {
    n: numberIn((plan) => store.read(plan, system).value),
    layout,
    tables: (async function* () {
      for (const table of layout) {
        const rows: unknown = store.read({ from: table.name }, system).value
        yield { table: table.name, rows: Array.isArray(rows) ? rows : [] }
      }
    })(),
  }
}

/** What `connected` takes last. */
export interface Connections {
  searcher?: Searcher
  sink?: ChangeSink
  // The engine's own sink, beside the builder's: the archive, which records. Each has a handing of its own.
  archive?: ChangeSink
  // The most bytes that wait for a sink.
  kept?: number
  // How long a sink that failed is left alone before it is handed the same write again.
  wait?: number
  clock?: Clock
  // The changes are kept in `_t_changes` from now on, and the store is told to record every write.
  keep?: boolean
  // Is handed each committed write as a change, for the readers of an app on many machines.
  copy?: (change: Change) => void
  // Is handed the rows of tables kept in memory that a committed write wrote, which no change holds.
  memory?: (rows: Wrote[]) => void
  // Is told where the sink was found to differ at `start`, and where it was closed for holding more than `kept`,
  // with the number the data stands at: `data` writes no log.
  noted?: (what: { sink: 'differs' | 'closed'; n: number } | SearcherFailed) => void
  // Over the files of an app: the highest number that a file of the directory holds.
  above?: number
  // Over the files of an app: the highest number that a file the directory marks open holds, read from the file. A
  // stop may have left it past `above`; the sinks are told the data stands there, before the file is opened.
  markedOpen?: number
}

/**
 * Takes a store, the layout of its tables, and what is connected to it. Answers the same store, which keeps the
 * number of each write: a write that wrote a row of a table a record covers, that held table steps, or that held a
 * raw SQL text, takes the next number, which is written into `_t_meta` in the same write. After each committed
 * write it tells the searcher the texts of the rows that were written, and hands the sink what was written, with
 * that number, each sink by a handing of its own. A write that was undone leaves nothing with either. When it is
 * made, and each time the store is opened again, the searcher is asked which tables it holds and is handed every
 * row of a searched table it does not, and each sink is told the number the data stands at. A raw SQL write names
 * no row, and tells a searcher nothing. Where a sink records, the store is told to record every write, and the
 * sink is handed the record of each with what each changed row held before, and the data keeps nothing of it.
 * Where the changes are kept, with `keep` or after `keepChanges`, it asks the store for the record of each write
 * that took a number, once, works the running fingerprint out, keeps the change in `_t_changes` in the same write,
 * and hands it to `copy` once the write is committed. Handed the files of an app that keeps a file for each
 * tenant, it answers those files, with one count of writes for every file: the count starts above `above`, and
 * `number()` answers the app's next number, for the one write of a file thread.
 */
export function connected(store: Store, layout: TableLayout[], o?: Connections): Store
export function connected(files: Files, layout: TableLayout[], o?: Connections): Files & { number(): number }
export function connected(on: Store | Files, layout: TableLayout[], o: Connections = {}): Store | Files {
  if ('shared' in on) return connectedFiles(on, layout, o)
  const store = on
  const searched = new Map(layout.filter((table) => table.search.length).map((table) => [table.name, table]))
  // The tables of this machine alone: a write to them takes no number.
  const own = new Set(layout.filter((table) => table.own).map((table) => table.name))
  const memory = new Set(layout.filter((table) => table.memory).map((table) => table.name))
  const clock = o.clock ?? ownClock
  const kept = o.kept ?? sinkSize
  const sinks = [o.sink, o.archive].filter((one) => one !== undefined)
  const handings: Handing[] = sinks.map((one) =>
    handing(one, {
      kept,
      wait: o.wait ?? sinkWait,
      clock,
      ...(o.noted ? { noted: o.noted } : {}),
      whole: () => wholeOf(store, own),
    }),
  )
  const searching = searcherHanding({ kept, wait: o.wait ?? sinkWait, clock, ...(o.noted ? { noted: o.noted } : {}) })
  // A sink is handed the vector of each vector column with its row.
  const vectors = handings.length ? vectorsIn(layout) : undefined
  // Whether a sink records, read at each opening: a sink of the engine may begin to record when a reader takes over.
  const records = (): boolean => sinks.some((one) => one.records === true)
  let recording = false
  let writing: WriteNotes | undefined
  // The store was told to record every write: its changes are kept.
  let keeping = false

  /** Hands the searcher every row of each searched table that it does not hold. */
  const handOver = () => {
    for (const [name, table] of searched) {
      if (!o.searcher || o.searcher.has(name)) continue
      const rows = store.read({ from: name }, system).value
      for (const row of Array.isArray(rows) ? rows : []) o.searcher.wrote(name, String(row.id), textsOf(table, row))
    }
  }

  /** What is done when the store stands open: the searcher is brought up, and the sink is told where the data stands. */
  const opened = () => {
    // With a searcher connected the store keeps no index of its own, and with none it keeps its own.
    placeOf(store)?.searchIndex?.(o.searcher === undefined)
    searching.start()
    handOver()
    const n = numberIn((plan) => store.read(plan, system).value)
    for (const one of handings) one.start(n)
    keeping = false
    forgetKept(around)
    recording = records()
    if (o.keep) keepChanges(around)
    // The store itself is told, and not this one: nothing is kept, and `copy` is handed nothing for a sink.
    else if (recording) recordWrites(store)
  }

  const around: Store = {
    ...store,
    open(folder, how) {
      store.open(folder, how)
      opened()
    },
    close() {
      for (const one of handings) one.stop()
      searching.stop()
      store.close()
    },
    write(fn, how) {
      const noted = nothingNoted()
      if (how?.by) noted.by = how.by
      let n: number | undefined
      let change: Change | undefined
      let record: Bytes | undefined
      writing = noted
      let answer: WriteAnswer<ReturnType<typeof fn>>
      try {
        answer = store.write((tx) => {
          const value = fn(watching(tx, noted, own, handings.length > 0, vectors, recording))
          if (noted.counts && !noted.applied) {
            // The number is written when the work of the write is done, through the write itself.
            n = numberIn((plan) => tx.read(plan, system)) + 1
            setMeta(tx, 'n', n)
            if (keeping && store.copy) change = keptChange(tx, n, noted)
            // The record is asked once: the kept change holds it where there is one.
            record = change?.record ?? (recording && store.copy ? store.copy.record() : undefined)
          }
          return value
        }, how)
      } catch (error) {
        forgetKept(around)
        throw error
      } finally {
        writing = undefined
      }
      eachApart([
        () =>
          o.searcher &&
          searching.tell(
            n ?? 0,
            () => tellSearcher(o.searcher, searched, noted.rows),
            () => waitingSize(noted.rows),
          ),
        // A table of this machine alone is handed to no one.
        () => {
          if (n === undefined) return
          const handed = sinkChange(n, clock.now(), noted, own, record ? { record } : {})
          for (const one of handings) one.push(handed)
        },
        () => {
          if (change) o.copy?.(change)
        },
        () => {
          // The rows of a table kept in memory are a machine's own, and go to the readers by themselves.
          const handed = o.memory && memory.size ? noted.rows.filter((one) => memory.has(one.table)) : []
          if (handed.length) o.memory?.(handed)
        },
      ])
      // The number, the running fingerprint and the kept change are the bookkeeping of the store, and no table
      // that a caller touched.
      const touched = keptOut(answer.touched)
        .map((one) => (one.table === metaTable.name ? { ...one, ids: one.ids.filter((id) => id !== 'n') } : one))
        .filter((one) => one.table !== metaTable.name || one.ids.length)
      return { value: answer.value, touched }
    },
    // A write that is begun and ended apart is counted by the files of an app, which this store is none of.
    begin: undefined,
    applyTableChanges(steps) {
      store.applyTableChanges(steps)
      // The steps of a table that is a machine's own are that machine's alone. A table kept in memory is made anew
      // at each opening, by a reader too, and its making takes no number.
      writing?.steps.push(...steps.filter((step) => !own.has(step.table)))
      const counted = !steps.length || steps.some((step) => !(step.do === 'addTable' && step.layout?.memory))
      if (writing && counted) writing.stepped = true
      if (writing && counted) writing.counts = true
    },
    ...(store.copy ? { copy: copyOf(store.copy) } : {}),
  }

  /** What a store that can be copied gives, with what this store notes of it. */
  function copyOf(copy: StoreCopy): StoreCopy {
    return {
      keep() {
        copy.keep()
        keeping = true
      },
      record: () => copy.record(),
      apply(record, rows) {
        if (writing) writing.applied = true
        copy.apply(record, rows)
      },
    }
  }

  /**
   * The change of a write whose number was just written, made inside that write: the record is asked of the
   * store once, the running fingerprint is worked out and written into `_t_here`, and the change is kept. Nothing
   * for a write of a file whose machine has no id yet.
   */
  const keptChange = (tx: Tx, n: number, noted: WriteNotes): Change | undefined => {
    const held = hereIn(tx)
    // The first writes of a new file come before the machine has its id: no change of them is kept, nor needed by any.
    if (typeof held.id !== 'string') return undefined
    const epoch = epochIn(tx, String(held.id))
    const change = madeChange(store, noted, own, {
      n,
      epoch,
      at: clock.now(),
      sum: String(held.sum ?? firstSum),
      keep: true,
    })
    setHere(tx, { sum: change.sum })
    keepChange(around, tx, change, kept, clock.now())
    return change
  }
  sameStore(around, store)
  if (standsOpen(store)) opened()
  return around
}

/** Whether a store stands open: one that does not is brought up when it is opened. */
function standsOpen(store: Store): boolean {
  try {
    store.layout()
    return true
  } catch {
    return false
  }
}
