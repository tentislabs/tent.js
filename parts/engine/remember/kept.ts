import { callerText } from '../../data/index.ts'
import type { Caller } from '../../core/index.ts'
import type { Plan } from '../../core/internal.ts'
import type { Touched, Tx } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

import { tenantOf } from '../stored/holdsSwept.ts'
import { keptFile, keptGone } from '../stored/keptFile.ts'
import type { Remember } from './keyOf.ts'

const system = { kind: 'system' } as const
const table = '_t_remembered'
const rowsTable = '_t_remembered_rows'

/** One read that a piece of work made: its plan, and the fingerprint of what it answered. */
export interface KeptRead {
  plan: Plan
  answer: string
}

/** A row that fed an answer: by its table and its id, and the tenant whose file it stands in. */
export interface Fed {
  tableName: string
  rowId: string
  of?: string
}

/** A file that an answer names: its id in the answer, the fingerprint of its bytes, and the file the answer keeps of them. */
export interface AnswerFile {
  id: string
  fingerprint: string
  kept: string
}

/** What an answer is kept with: the files it names, what its work read, and the rows that fed it. */
export interface Keeping {
  answer: unknown
  files: { id: string; fingerprint: string }[]
  reads: KeptRead[]
  fed: Fed[]
}

const listOf = (found: unknown): Record<string, unknown>[] =>
  Array.isArray(found) ? found.map((one) => Object(one)) : []

/** The row of a remembered answer by its key, or nothing. */
export function rowOf(o: Opened, key: string): Record<string, unknown> | undefined {
  const [row] = listOf(o.store.read({ from: table, where: { col: 'key', is: key }, limit: 1 }, system).value)
  return row
}

/** The files that an answer keeps, as its row holds them. */
export const answerFiles = (row: Record<string, unknown> | undefined): AnswerFile[] =>
  listOf(row?.files).flatMap((one) =>
    typeof one.id === 'string' && typeof one.fingerprint === 'string' && typeof one.kept === 'string'
      ? [{ id: one.id, fingerprint: one.fingerprint, kept: one.kept }]
      : [],
  )

/**
 * Removes the answers under these keys, with the rows that fed them, inside a write. The files they kept are
 * removed from that moment, and their bytes go after `filesKept`, as those of any removed file.
 */
function forgetIn(o: Opened, tx: Tx, keys: Iterable<string>): void {
  const now = o.clock.now()
  for (const key of keys) {
    const [row] = listOf(tx.read({ from: table, where: { col: 'key', is: key }, limit: 1, pick: ['files'] }, system))
    if (row) {
      keptGone(
        tx,
        answerFiles(row).map((file) => file.kept),
        now,
      )
      tx.remove(table, key, system)
    }
    for (const fed of listOf(tx.read({ from: rowsTable, where: { col: 'key', is: key } }, system)))
      tx.remove(rowsTable, { tableName: fed.tableName, rowId: fed.rowId, key }, system)
  }
}

// How many of the answers given longest ago are read at a time, where room runs out.
const pageOfOldest = 200

/**
 * Keeps an answer under its key, with what its work read and the rows that fed it, in one write; an answer that
 * stood under the key before goes. Past `limits.remembered` of all their sizes, the answers that were given
 * longest ago go first.
 */
export function keep(o: Opened, key: string, name: string, caller: Caller, stated: Remember, kept: Keeping): void {
  const now = o.clock.now()
  const size = JSON.stringify(kept.answer ?? null).length
  const values = {
    key,
    definition: name,
    caller: stated.shared === undefined ? callerText(caller) : '',
    answer: kept.answer ?? null,
    reads: kept.reads,
    size,
    madeAt: new Date(now),
    givenAt: new Date(now),
    endsAt: new Date(now + stated.for),
  }
  const fed = new Map(kept.fed.map((one) => [`${one.tableName}\n${one.rowId}`, one]))
  o.store.write((tx) => {
    forgetIn(o, tx, [key])
    const files = kept.files.flatMap((one) => {
      const held = keptFile(tx, one.id)
      return held === undefined ? [] : [{ ...one, kept: held }]
    })
    tx.add(table, { ...values, files }, system)
    for (const row of fed.values()) tx.add(rowsTable, { ...row, key }, system)
  })
  const most = storedLimit(o.description, 'remembered')
  // The sum is worked out by the store, and only the keys and sizes of the oldest are read, a page at a time.
  const [summed] = listOf(
    o.store.read({ from: table, group: { by: [], values: { total: { sum: 'size' } } } }, system).value,
  )
  let total = Number(summed?.total ?? 0)
  const going: string[] = []
  for (let skip = 0; total > most; skip += pageOfOldest) {
    const page = listOf(
      o.store.read({ from: table, sort: [{ by: 'givenAt' }], skip, limit: pageOfOldest, pick: ['key', 'size'] }, system)
        .value,
    )
    for (const one of page) {
      if (total <= most) break
      if (one.key === key) continue
      going.push(String(one.key))
      total -= Number(one.size ?? 0)
    }
    if (page.length < pageOfOldest) break
  }
  if (going.length) o.store.write((tx) => forgetIn(o, tx, going))
}

/** Notes that an answer was given now: what goes first when room runs out is the one given longest ago. */
export const given = (o: Opened, key: string): void =>
  void o.store.write((tx) => void tx.change(table, key, { givenAt: new Date(o.clock.now()) }, system))

/** Whether an app may remember answers: a function that states `remember`, or a flow, whose steps may. */
export const mayRemember = (o: Opened): boolean =>
  Object.keys(o.description.flows).length > 0 ||
  Object.values(o.description.functions).some((one) => one.remember !== undefined)

/** The answers that rows fed, by the table of each and their ids, or by the tenant they are of. */
function fedKeys(tx: Pick<Tx, 'read'>, table: string, ids: string[]): Set<string> {
  const keys = new Set<string>()
  const where = {
    all: [
      { col: 'tableName', is: table },
      { col: 'rowId', in: ids },
    ],
  }
  for (const row of listOf(tx.read({ from: rowsTable, where }, system))) keys.add(String(row.key))
  for (const row of listOf(tx.read({ from: rowsTable, where: { col: 'of', in: ids } }, system)))
    keys.add(String(row.key))
  return keys
}

/**
 * Takes an app and a write of its shared file. Answers the write with each row of the app that it changes or removes taking
 * the remembered answers that the row fed with it, in the same write. A raw text is found by the upkeep.
 */
export function fedTx(o: Opened, tx: Tx): Tx {
  const forget = (table: string, id: unknown): void => {
    if (table.startsWith('_t_')) return
    const keys = fedKeys(tx, table, [String(Reflect.get(Object(id), 'id') ?? id)])
    if (keys.size) forgetIn(o, tx, keys)
  }
  return {
    ...tx,
    change(table, id, values, caller) {
      const row = tx.change(table, id, values, caller)
      forget(table, row.id)
      return row
    },
    remove(table, id, caller) {
      tx.remove(table, id, caller)
      forget(table, id)
    },
  }
}

/**
 * Takes an app and what a committed write of a tenant's file touched. Removes the remembered answers that a changed
 * or removed row fed, in a write of the shared file right after that commit, before anything else is answered.
 */
export function forgetFed(o: Opened, touched: Touched[]): void {
  const rows = touched.filter((one) => !one.table.startsWith('_t_') && one.ids.length)
  if (!rows.length) return
  const shared = { read: (plan: Parameters<Tx['read']>[0]) => o.store.read(plan, system).value }
  const keys = new Set(rows.flatMap((one) => [...fedKeys(shared, one.table, one.ids)]))
  if (keys.size) o.store.write((tx) => forgetIn(o, tx, keys))
}

/**
 * The upkeep of the remembered answers: those past `endsAt` go, and those that name a row which is gone, as one
 * that was removed in raw SQL is found only then.
 */
export function forgetEnded(o: Opened): void {
  const now = new Date(o.clock.now())
  const keys = new Set(
    listOf(o.store.read({ from: table, where: { col: 'endsAt', below: now } }, system).value).map((row) =>
      String(row.key),
    ),
  )
  // A row of a tenant's file is looked for where that file is open, and one of a table that is gone is gone too.
  const open = new Map((o.files?.open() ?? []).map((file) => [`${file.table}\n${file.id}`, file]))
  for (const row of listOf(o.store.read({ from: rowsTable }, system).value)) {
    const name = String(row.tableName)
    if (!Object.hasOwn(o.description.tables, name)) {
      keys.add(String(row.key))
      continue
    }
    const tenant = tenantOf(o, row)
    const file = tenant ? open.get(`${tenant.table}\n${tenant.id}`) : undefined
    const source = tenant ? (file ? o.files?.of(file) : undefined) : o.store
    if (source && source.read({ from: name, one: 'get', id: String(row.rowId) }, system).value === undefined)
      keys.add(String(row.key))
  }
  if (keys.size) o.store.write((tx) => forgetIn(o, tx, keys))
}

/** Removes the answers whose caller is a person who is removed, in the write that removes their rows. */
export function forgetPerson(o: Opened, tx: Tx, person: string): void {
  const keys = listOf(tx.read({ from: table, where: { col: 'caller', is: `user:${person}` } }, system)).map((row) =>
    String(row.key),
  )
  forgetIn(o, tx, keys)
}
