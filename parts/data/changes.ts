import { TentError } from '../core/index.ts'
import { limitDefaults } from '../core/internal.ts'
import type { Wrote } from './context.ts'
import type { FileName } from './fileName.ts'
import type { Files } from './files.ts'
import { insideOf } from './filesInside.ts'
import { heldIn } from './held.ts'
import { here, nextSum, setHere } from './here.ts'
import { keptIn } from './kept.ts'
import type { WriteNotes } from './noted.ts'
import { statedBy } from './noted.ts'
import type { By, Bytes, Row, Store, TableLayout, TableStep, Tx } from './store.ts'
import { changesTable, metaTable } from './tables.ts'

// The most bytes that wait for a sink, and that the records of the kept changes hold together, where none is stated.
export const sinkSize = Number(limitDefaults.project.sinkSize)
// How long a sink that failed waits before it is handed the write again, where none is stated.
export const sinkWait = Number(limitDefaults.project.sinkWait)

const system = { kind: 'system' } as const

/**
 * One committed write as it travels to the readers of an app: its number, the epoch it was made under, the time of
 * its commit on the writer, the running fingerprint after it, the store's own record of it, and which rows it
 * added, changed and removed. `tables`: the tables that a raw SQL write of the commit stated, whose rows are not
 * known. `all`: neither the rows nor the tables are known. `layout`: the steps of a table change, and the layout
 * they lead to. `file`: the tenant's file it is of. `fetch`: that file is to be fetched whole, in place of a
 * record. `gone`: the tenants that this write removed. `by`: by whom the write was made, which a reader of an
 * older engine passes over; a change of the system, and one recorded before it was kept, names no one.
 */
export interface Change {
  n: number
  epoch: string
  at: number
  sum: string
  record: Bytes
  rows: Wrote[]
  tables?: string[]
  all?: true
  layout?: { steps: TableStep[]; to: TableLayout[] }
  file?: FileName
  fetch?: true
  gone?: FileName[]
  by?: By
}

/**
 * Makes the change of a write whose number was just written, inside that write: the record is asked of the store
 * once where the changes are kept, and the running fingerprint moves on by it. Answers the change, which whoever
 * called writes down. `sum` is the running fingerprint before the write, `own` the tables that are a machine's
 * own, and `of` the tenant's file the write is of and the tenants it removed.
 */
export function madeChange(
  store: Store,
  noted: WriteNotes,
  own: Set<string>,
  o: { n: number; epoch: string; at: number; sum: string; keep: boolean; file?: FileName; gone?: FileName[] },
): Change {
  const record = o.keep && store.copy ? store.copy.record() : new Uint8Array()
  return {
    n: o.n,
    epoch: o.epoch,
    at: o.at,
    sum: o.keep ? nextSum(o.sum, record) : o.sum,
    record,
    rows: noted.rows.filter((one) => !own.has(one.table)),
    ...statedBy(noted),
    ...(noted.stepped
      ? { layout: { steps: noted.steps, to: store.layout().filter((one) => !one.own && one.name !== metaTable.name) } }
      : {}),
    ...(o.file ? { file: o.file } : {}),
    ...(o.gone?.length ? { gone: o.gone } : {}),
    ...(noted.by && Object.keys(noted.by).length ? { by: noted.by } : {}),
  }
}

// What each store keeps of its changes, in memory: the number and the size of the record of each, the oldest
// first, with the sum of those sizes, and until when every change after a number is kept whatever the bound.
interface Keeping {
  sizes?: { n: number; size: number }[]
  total?: number
  from?: { n: number; until: number }
}
const keepings = new WeakMap<Store, Keeping>()

const rowsOf = (read: unknown): Row[] => (Array.isArray(read) ? read : [])

/** The number of the last write that a data file holds. */
function numberOf(store: Store): number {
  const held = store.read({ from: metaTable.name, one: 'get', id: 'n' }, system).value
  return typeof held === 'object' && !Array.isArray(held) ? Number(held.value) : 0
}

/**
 * Keeps one change in `_t_changes`, inside the write it is of: its number, its epoch, its `sum`, the change
 * without its record as JSON, and the record. The oldest are then removed once the records together pass `bound`
 * bytes: the newest one is kept whatever its size, and so is every change that `keepFrom` holds.
 */
export function keepChange(store: Store, tx: Tx, change: Change, bound: number, now: number): void {
  const { record, ...rest } = change
  tx.add(
    changesTable.name,
    { n: change.n, epoch: change.epoch, sum: change.sum, change: JSON.parse(JSON.stringify(rest)), record },
    system,
  )
  const keeping = keptIn(keepings, store, (): Keeping => ({}))
  // The sizes are read once, by the write that first keeps a change after the store was opened.
  keeping.sizes ??= rowsOf(tx.read({ from: changesTable.name, sort: [{ by: 'n' }] }, system))
    .filter((row) => row.n !== change.n)
    .map((row) => ({ n: Number(row.n), size: row.record instanceof Uint8Array ? row.record.length : 0 }))
  const sizes = keeping.sizes
  // The sum is kept beside the sizes, so that a write adds its own size and reads no other.
  keeping.total ??= sizes.reduce((sum, one) => sum + one.size, 0)
  sizes.push({ n: change.n, size: record.length })
  let total = keeping.total + record.length
  const held = keeping.from && keeping.from.until > now ? keeping.from.n : Number.POSITIVE_INFINITY
  while (sizes.length > 1 && total > bound && sizes[0].n <= held) {
    const [oldest] = sizes.splice(0, 1)
    total -= oldest.size
    tx.remove(changesTable.name, oldest.n, system)
  }
  keeping.total = total
}

/** Lets go of what is kept in memory of the changes of a store: it was opened anew, or a write of it was undone. */
export function forgetKept(store: Store): void {
  const keeping = keepings.get(store)
  if (keeping) {
    keeping.sizes = undefined
    keeping.total = undefined
  }
}

/** Whether what a row of the kept changes holds is a change without its record. */
const isKept = (value: unknown): value is Omit<Change, 'record'> =>
  typeof heldIn(value, 'n') === 'number' &&
  typeof heldIn(value, 'epoch') === 'string' &&
  typeof heldIn(value, 'at') === 'number' &&
  typeof heldIn(value, 'sum') === 'string' &&
  Array.isArray(heldIn(value, 'rows'))

/** A kept change as it travelled. Throws T0009 for a row that holds no change. */
function changeOf(row: Row): Change {
  if (!isKept(row.change) || !(row.record instanceof Uint8Array))
    throw new TentError('T0009', `The kept change ${String(row.n)} holds no change.`)
  return { ...row.change, record: row.record }
}

/** Takes a store and a number. Answers the kept changes after that number, in order, each read when it is asked for. */
export function* keptChanges(store: Store, after: number): Iterable<Change> {
  const plan = { from: changesTable.name, where: { col: 'n', above: after }, sort: [{ by: 'n' }], pick: ['n'] }
  for (const { n } of rowsOf(store.read(plan, system).value)) {
    const row = store.read({ from: changesTable.name, one: 'get', id: Number(n) }, system).value
    if (typeof row === 'object' && !Array.isArray(row)) yield changeOf(row)
  }
}

/**
 * Takes a store and a number. Answers the `sum` of the kept change of that number; and of what the machine held
 * when its changes began to be kept, while the change after it is still kept, or while no change is kept yet.
 * Nothing for any other number.
 */
export function keptAt(store: Store, n: number): { sum: string } | undefined {
  const get = (id: number) => store.read({ from: changesTable.name, one: 'get', id }, system).value
  const row = get(n)
  if (typeof row === 'object' && !Array.isArray(row)) return { sum: String(row.sum) }
  const { keptFrom } = here(store)
  if (keptFrom?.n !== n) return undefined
  const none = store.read({ from: changesTable.name, count: true }, system).value === 0
  return none || get(n + 1) !== undefined ? { sum: keptFrom.sum } : undefined
}

/** Takes a store, a number and a time. Keeps every change after that number until that time, past the bound of what is kept too. */
export function keepFrom(store: Store, n: number, until: number): void {
  keptIn(keepings, store, (): Keeping => ({})).from = { n, until }
}

/**
 * Takes a store, or the files of an app. From its next write on its changes are kept in `_t_changes`, for the
 * readers of the app, and the store is told to record every write, as `recordWrites` tells it. It writes `kept`
 * into `_t_here`, and, where `_t_here` did not hold it yet, the number and the `sum` the machine holds now: for
 * the files of an app, the number of the app, which is the highest that any of its files holds, and the `sum` of
 * the shared file.
 */
export function keepChanges(on: Store | Files): void {
  if (!('shared' in on)) {
    const held = here(on)
    if (!held.kept) setHere(on, { kept: true, keptFrom: { n: numberOf(on), sum: held.sum } })
    on.copy?.keep()
    return
  }
  const inside = insideOf(on)
  const held = here(on.shared)
  const open = on.open().map((file) => inside.plain(file))
  const n = inside.counting?.last() ?? Math.max(numberOf(on.shared), ...open.map((one) => (one ? numberOf(one) : 0)))
  if (!held.kept) setHere(on.shared, { kept: true, keptFrom: { n, sum: held.sum } })
  inside.told = true
  recordWrites(on)
  inside.counting?.keep()
}

/**
 * Takes a store, or the files of an app. From its next write on the store records every write, for a sink that
 * records: of the files of an app the shared file, each tenant's file that is open, and each as it is opened.
 * Nothing is kept in the data, and `_t_here` is not told.
 */
export function recordWrites(on: Store | Files): void {
  if (!('shared' in on)) {
    on.copy?.keep()
    return
  }
  const inside = insideOf(on)
  inside.shared.copy?.keep()
  inside.keeping = true
  inside.keepOpen()
}
