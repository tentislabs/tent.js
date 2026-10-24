import { fingerprintOf } from '../core/internal.ts'
import { heldIn } from './held.ts'
import { rowIds } from './ids.ts'
import { TentError } from '../core/index.ts'
import { isToDisk } from './place.ts'
import type { Row, Store, Tx } from './store.ts'
import { hereTable, metaTable } from './tables.ts'

const system = { kind: 'system' } as const

/** The mode an engine runs an app in. */
export type Mode = 'development' | 'test' | 'live'

/** What `_t_here` holds: what this machine alone knows of itself, which no record of a commit covers. */
export interface Here {
  id: string
  sum: string
  // Nothing before they were written.
  role?: 'writer' | 'reader' | 'stopped'
  mode?: Mode
  own?: string
  from?: string
  far?: boolean
  near?: string[]
  kept?: true
  // What the machine held when its changes began to be kept.
  keptFrom?: { n: number; sum: string }
  took?: { from: string; answered: boolean }
  back?: { reader: string; n: number }
  stopped?: { epoch: string; own?: string }
  // The epoch that began with a file that was put back, or with an upgrade of the store.
  restored?: string
  // On a reader: the `own` addresses that its writer last named with `take`.
  take?: string[]
}

/** The running fingerprint of a new data file: the fingerprint of no bytes. */
export const firstSum: string = fingerprintOf(new Uint8Array())

/** Answers the running fingerprint after one more record: the fingerprint of the one before it, a line feed, and the record. */
export function nextSum(sum: string, record: Uint8Array): string {
  const before = new TextEncoder().encode(`${sum}\n`)
  const bytes = new Uint8Array(before.length + record.length)
  bytes.set(before)
  bytes.set(record, before.length)
  return fingerprintOf(bytes)
}

/** What a read of `_t_here` answers, as one record. */
function heldBy(read: (plan: { from: string }) => unknown): Record<string, unknown> {
  const rows = read({ from: hereTable.name })
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row: Row) => [String(row.key), row.value]))
}

/** What a write holds of `_t_here` so far: for whoever works inside that write. */
export const hereIn = (tx: Tx): Record<string, unknown> => heldBy((plan) => tx.read(plan, system))

/**
 * Takes a store. Answers what its `_t_here` holds. A data folder that is read for the first time is given its
 * machine id here, 26 characters made as the id of a row is, which it keeps for as long as it keeps its folder.
 * It answers nothing for `role` and for `mode` before they were written, and the running fingerprint of a new
 * file is that of no bytes.
 */
export function here(store: Store): Here {
  const held = heldBy((plan) => store.read(plan, system).value)
  if (typeof held.id !== 'string') {
    held.id = rowIds.next()
    store.write((tx) => tx.add(hereTable.name, { key: 'id', value: held.id }, system))
  }
  return { sum: firstSum, ...held, id: String(held.id) }
}

/**
 * Takes a store, or the write to work in, and the fields to set: one that is given as nothing is taken away. With
 * a store it is one write of its own, which takes no number. With `toDisk` that write has reached the disk when
 * the call answers: on a store it is begun so, and the write that is handed in was begun so. Throws T0013 for
 * `toDisk` inside a write that was not.
 */
export function setHere(on: Store | Tx, fields: Partial<Here>, o: { toDisk?: true } = {}): void {
  const set = (tx: Tx) => {
    for (const [key, value] of Object.entries(fields)) {
      const there = tx.read({ from: hereTable.name, one: 'get', id: key }, system) !== undefined
      if (value === undefined) {
        if (there) tx.remove(hereTable.name, key, system)
      } else if (there) tx.change(hereTable.name, key, { value }, system)
      else tx.add(hereTable.name, { key, value }, system)
    }
  }
  if ('write' in on) {
    on.write(set, o.toDisk ? { toDisk: true } : {})
    return
  }
  if (o.toDisk && !isToDisk(on))
    throw new TentError(
      'T0013',
      'What this machine holds of itself is to reach the disk, in a write that was not begun so.',
      {
        fix: 'Begin the write with `toDisk`.',
      },
    )
  set(on)
}

/** The number and the writer of the epoch that a data file stands in, by what reads its `_t_meta`. */
function epochBy(read: (key: string) => unknown): { number: number; writer?: string } {
  const [number, writer] = [read('epoch'), read('writer')]
  return { number: typeof number === 'number' ? number : 1, ...(typeof writer === 'string' ? { writer } : {}) }
}

const metaIn = (tx: Tx) => (key: string) =>
  heldIn(tx.read({ from: metaTable.name, one: 'get', id: key }, system), 'value')

/** Writes one value of `_t_meta` inside a write, or takes its key away where the value is nothing. */
export function setMeta(tx: Tx, key: string, value: unknown): void {
  const there = tx.read({ from: metaTable.name, one: 'get', id: key }, system) !== undefined
  if (value === undefined) {
    if (there) tx.remove(metaTable.name, key, system)
  } else if (there) tx.change(metaTable.name, key, { value }, system)
  else tx.add(metaTable.name, { key, value }, system)
}

/**
 * Takes the write to work in and the id of a machine. Answers the epoch that the data stands in, as
 * `<number>.<writer id>`. A file that names none yet stands in the first one, with that machine as its writer,
 * which is written down here so that it travels with the record of the write.
 */
export function epochIn(tx: Tx, machine: string): string {
  const held = epochBy(metaIn(tx))
  if (held.writer === undefined) {
    setMeta(tx, 'epoch', held.number)
    setMeta(tx, 'writer', machine)
  }
  return `${held.number}.${held.writer ?? machine}`
}

/**
 * Takes the write to work in, the id of a machine, and in `above` a number the new epoch must lie over. Begins the
 * next epoch: the next number, or one more than `above` where that is higher, with that machine as its writer.
 * Answers the epoch, as `<number>.<writer id>`.
 */
export function beginEpoch(tx: Tx, machine: string, o: { above?: number } = {}): string {
  const number = Math.max(epochBy(metaIn(tx)).number, o.above ?? 0) + 1
  setMeta(tx, 'epoch', number)
  setMeta(tx, 'writer', machine)
  return `${number}.${machine}`
}
