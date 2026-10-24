import { eachApart } from './eachApart.ts'
import type { Change } from './changes.ts'
import { forgetKept, keepChange, keepChanges, madeChange, recordWrites, sinkSize, sinkWait } from './changes.ts'
import type { Connections } from './connected.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import type { Frame } from './filesInside.ts'
import { insideOf } from './filesInside.ts'
import { heldIn } from './held.ts'
import { epochIn, firstSum, here, hereIn, setHere, setMeta } from './here.ts'
import { heldMeta } from './metaKeys.ts'
import { numberIn, ownClock, sinkChange, tellSearcher, textsOf, vectorsIn } from './noted.ts'
import { placeOf } from './place.ts'
import type { Handing, SinkChange } from './sink.ts'
import { searcherHanding } from './searcherHanding.ts'
import { handing, waitingSize } from './sink.ts'
import type { Store, TableLayout } from './store.ts'
import { changesTable, hereTable } from './tables.ts'

const system = { kind: 'system' } as const

/**
 * Takes the files of an app, the layout of its tables, and what is connected to them. Answers the same files,
 * which keep one count of writes for every file: a write of the shared file or of a tenant's takes the app's
 * next number, which is written into the file it wrote, in the same write, with the epoch of the app where the
 * file holds another. After each committed write it tells the searcher the texts of the rows that were written,
 * with their tenant, and hands each sink what was written, with its file. Where a sink records, the store of each
 * file is told to record every write, and the sink is handed the record of each, and the data keeps nothing of
 * it. Where the changes are kept, for the readers of the app, each file
 * keeps a running fingerprint of its own, the change of a write to the shared file is kept in that write, and the
 * change of a write to a tenant's file right after its commit, in a second write of the shared file. A file
 * that is opened above the newest kept change was cut off between the two: it is given a kept change that holds
 * `fetch`. The write that removes tenants holds `gone`, the file of each. The count starts above `above`, the
 * highest number that a file of the directory holds, and `number()` hands the next number to a file thread. Each
 * sink is told the data stands at the higher of the count and `markedOpen`, the number of a file a stop left open.
 */
export function connectedFiles(files: Files, layout: TableLayout[], o: Connections): Files & { number(): number } {
  const inside = insideOf(files)
  const shared = inside.shared
  const searched = new Map(layout.filter((table) => table.search.length).map((table) => [table.name, table]))
  const own = new Set([hereTable.name, changesTable.name, ...layout.filter((one) => one.own).map((one) => one.name)])
  const clock = o.clock ?? ownClock
  const bound = o.kept ?? sinkSize
  const sinks = [o.sink, o.archive].filter((one) => one !== undefined)
  const handings: Handing[] = sinks.map((one) =>
    handing(one, { kept: bound, wait: o.wait ?? sinkWait, clock, ...(o.noted ? { noted: o.noted } : {}) }),
  )
  const push = (change: SinkChange): void => {
    for (const one of handings) one.push(change)
  }
  const searching = searcherHanding({
    kept: bound,
    wait: o.wait ?? sinkWait,
    clock,
    ...(o.noted ? { noted: o.noted } : {}),
  })
  // Whether a sink records, read at each opening: a sink of the engine may begin to record when a reader takes over.
  let recording = false
  const read = (store: Store) => (plan: Parameters<Store['read']>[0]) => store.read(plan, system).value
  // The number of the last write of the app, and of its newest kept change.
  let last = o.above ?? 0
  let keptTo = 0
  let machine: string | undefined

  /** The epoch of the app, as the shared file names it: the first one, of this machine, where it names none yet. */
  const epochOf = (): { number: number; writer: string } => {
    const [number, writer] = [heldMeta(shared, 'epoch'), heldMeta(shared, 'writer')]
    machine ??= here(files.shared).id
    return { number: typeof number === 'number' ? number : 1, writer: typeof writer === 'string' ? writer : machine }
  }

  /** The tenants that a write of the shared file removed with their rows: one write may remove more than one. */
  const goneIn = (frame: Frame): FileName[] => {
    if (frame.file) return []
    const tenants = inside.tenants()
    return frame.noted.rows
      .filter((one) => one.kind === 'removed' && tenants.includes(one.table))
      .map((one) => ({ table: one.table, id: String(one.row.id) }))
  }

  /** Keeps the change of a tenant's file in the shared file: in the write of it that is under way, or in one of its own. */
  const keepInShared = (change: Change) => {
    const under = inside.frames.find((one) => one.key === '' && one.open)
    try {
      if (under?.open) keepChange(files.shared, under.open.tx, change, bound, clock.now())
      else shared.write((tx) => keepChange(files.shared, tx, change, bound, clock.now()))
    } catch (error) {
      forgetKept(files.shared)
      throw error
    }
    keptTo = Math.max(keptTo, change.n)
  }

  /** What is done when the shared file stands open: the searcher is brought up, and the sink is told where the data stands. */
  const start = () => {
    // With a searcher connected no file keeps an index of its own, and with none the shared file keeps its own.
    placeOf(shared)?.searchIndex?.(o.searcher === undefined)
    searching.start()
    const tables = new Set(shared.layout().map((one) => one.name))
    // The id of this machine is read while no write is under way: reading it may give the folder its id.
    if (tables.has(hereTable.name)) machine ??= here(files.shared).id
    last = Math.max(last, numberIn(read(shared)))
    if (tables.has(changesTable.name)) {
      const newest = read(shared)({ from: changesTable.name, sort: [{ by: 'n', down: true }], limit: 1, pick: ['n'] })
      for (const row of Array.isArray(newest) ? newest : []) keptTo = Math.max(keptTo, Number(row.n))
      last = Math.max(last, keptTo)
    }
    for (const [name, table] of searched) {
      if (!o.searcher || !tables.has(name) || o.searcher.has(name)) continue
      const rows = read(shared)({ from: name })
      for (const row of Array.isArray(rows) ? rows : []) o.searcher.wrote(name, String(row.id), textsOf(table, row))
    }
    // A sink holds a write of a file that a stop left marked open, or it missed it: the count learns that file's
    // number only when the file is opened, so the sink is told it now.
    for (const one of handings) one.start(Math.max(last, o.markedOpen ?? 0))
    forgetKept(files.shared)
    recording = sinks.some((one) => one.records === true)
    counting.readsBefore = recording
    if (o.keep || inside.told) keepChanges(files)
    else if (recording || inside.keeping) recordWrites(files)
  }

  const counting: NonNullable<typeof inside.counting> = {
    own,
    readsRemoved: handings.length > 0,
    ...(handings.length ? { vectors: vectorsIn(layout) } : {}),

    ending(frame) {
      const { noted, open, store, file } = frame
      if (!open || !store || !noted.counts || noted.applied) return
      const tx = open.tx
      const n = last + 1
      setMeta(tx, 'n', n)
      frame.n = n
      const app = file ? epochOf() : undefined
      // The first write of a file under an epoch writes that epoch into the file.
      if (app && (heldMeta(tx, 'epoch') !== app.number || heldMeta(tx, 'writer') !== app.writer)) {
        setMeta(tx, 'epoch', app.number)
        setMeta(tx, 'writer', app.writer)
      }
      if (!inside.keeping || !store.copy) return
      // For a sink that records alone the record is asked, and nothing is kept.
      if (!inside.told) {
        frame.record = store.copy.record()
        return
      }
      const held = hereIn(tx)
      machine ??= here(files.shared).id
      const epoch = app ? `${app.number}.${app.writer}` : epochIn(tx, machine)
      const change = madeChange(store, noted, own, {
        n,
        epoch,
        at: clock.now(),
        sum: String(held.sum ?? firstSum),
        keep: true,
        ...(file ? { file } : {}),
        gone: goneIn(frame),
      })
      setHere(tx, { sum: change.sum })
      // The change of a write to the shared file is kept in that write, and one of a tenant's file after its commit.
      if (!file) keepChange(files.shared, tx, change, bound, clock.now())
      frame.change = change
    },

    committed(frame) {
      const { noted, file, n, change, record } = frame
      if (n !== undefined) last = Math.max(last, n)
      const gone = goneIn(frame)
      eachApart([
        () =>
          o.searcher &&
          searching.tell(
            n ?? last,
            () => {
              tellSearcher(o.searcher, searched, noted.rows, file)
              for (const one of gone) o.searcher?.gone?.(one)
            },
            () => waitingSize(noted.rows),
          ),
        () => {
          if (change && file) keepInShared(change)
          else if (change) keptTo = Math.max(keptTo, change.n)
        },
        () => {
          const recorded = change?.record ?? record
          if (n !== undefined)
            push(
              sinkChange(n, clock.now(), noted, own, {
                ...(file ? { file } : {}),
                ...(gone.length ? { gone } : {}),
                ...(recorded ? { record: recorded } : {}),
              }),
            )
        },
        () => {
          if (change) o.copy?.(change)
        },
      ])
    },

    undone() {
      forgetKept(files.shared)
    },

    opened(file, store) {
      if (o.searcher) placeOf(store)?.searchIndex?.(false)
      const n = numberIn(read(store))
      last = Math.max(last, n)
      // A file above the newest kept change holds a write whose kept change was never written: it is fetched whole.
      if (!inside.told || n <= keptTo) return
      const [epoch, writer] = [heldMeta(store, 'epoch'), heldMeta(store, 'writer')]
      const held = read(store)({ from: hereTable.name, one: 'get', id: 'sum' })
      const change: Change = {
        n,
        epoch: `${epoch}.${writer}`,
        at: clock.now(),
        sum: String(heldIn(held, 'value') ?? firstSum),
        record: new Uint8Array(),
        rows: [],
        file,
        fetch: true,
      }
      keptTo = n
      inside.later(() => {
        keepInShared(change)
        o.copy?.(change)
      })
    },

    reopened: start,

    stopped() {
      for (const one of handings) one.stop()
      searching.stop()
    },

    keep() {
      keptTo = Math.max(keptTo, last, here(files.shared).keptFrom?.n ?? 0)
    },

    last: () => last,

    handOn(change) {
      last = Math.max(last, change.n)
      if (inside.told) {
        keptTo = Math.max(keptTo, change.n)
        o.copy?.(change)
      }
      push({
        n: change.n,
        at: change.at,
        ...(change.rows.length ? { rows: change.rows } : {}),
        ...(change.layout?.steps.length ? { layout: change.layout.steps } : {}),
        ...(change.file ? { file: change.file } : {}),
        ...(change.record.length ? { record: change.record } : {}),
        ...(change.by ? { by: change.by } : {}),
        ...(change.fetch ? { fetch: true as const } : {}),
      })
    },
  }
  inside.counting = counting
  start()
  // The app's next number, which no write of the main thread takes again.
  return Object.assign(files, { number: () => ++last })
}
