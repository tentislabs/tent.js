import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { choice, link, number, project, table, text, vector } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Change, Row, Store, TableLayout } from '../index.ts'
import {
  applyChange,
  applySteps,
  changesTable,
  connected,
  hereTable,
  here,
  historyTable,
  layoutOf,
  planTableChanges,
} from '../index.ts'
import { at, described, reading, seal } from './shop.ts'
import { made, opened, system, workFolder } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const

/** The tables of the two machines: a shop with a search by words and by pieces, links that remove and clear, a sealed column, row history and vectors. */
export const shopOf = (o: { sealedNote?: boolean; more?: boolean } = {}): Description =>
  described([
    project('shop', {}),
    table('customers', {
      columns: {
        name: text(),
        taxNo: text({ sealed: true, optional: true }),
        note: text({ optional: true, ...(o.sealedNote ? { sealed: true } : {}) }),
        ...(o.more ? { more: text({ optional: true }) } : {}),
      },
      access,
      search: ['name'],
      keepHistory: true,
    }),
    table('products', {
      columns: { name: text(), price: number() },
      access,
      search: { columns: ['name'], by: 'pieces' },
    }),
    table('orders', {
      columns: {
        customer: link('customers'),
        net: number(),
        status: choice(['open', 'paid'], { default: 'open' }),
        memo: text({ optional: true }),
      },
      access,
      keepHistory: true,
    }),
    table('lines', {
      columns: {
        order: link('orders', { onRemove: 'remove' }),
        product: link('products', { optional: true, onRemove: 'clear' }),
        qty: number({ whole: true }),
      },
      access,
    }),
    table('articles', { columns: { title: text(), meaning: vector({ size: 4 }) }, access }),
  ])

/** The tables that are a machine's own: each machine makes them itself, and no record covers them. */
const own: TableLayout[] = [hereTable, changesTable]

/** A new store on a folder of the test, with the tables that are a machine's own. */
export function machine(t: TestContext, folder = workFolder(t)): Store {
  const store = opened(folder)
  made(store, own)
  return store
}

/** The layout that `connected` is handed: the tables of the app, the table of row history, and a machine's own. */
export const layoutFor = (description: Description): TableLayout[] => [...layoutOf(description), historyTable, ...own]

/** Switches a writer to a description, in one write that holds the steps, as a start does. */
export function switchTo(writer: Store, description: Description): void {
  const held = writer.layout().filter((one) => !own.some((mine) => mine.name === one.name) && one.name !== '_t_meta')
  const { steps, findings } = planTableChanges(held, [...layoutOf(description), historyTable])
  assert.deepEqual(findings, [])
  writer.write((tx) => applySteps(tx, writer, steps, { seal }), { steps: true })
}

/**
 * A writer whose changes are kept, and a reader that is handed each of them by `applyChange` as it is made. Answers
 * both, the plain store of the writer, and every change that was made.
 */
export function pair(t: TestContext, description: Description = shopOf()) {
  const plain = machine(t)
  const reader = machine(t)
  const changes: Change[] = []
  // The link between the two: a test that cuts it keeps the changes, and hands the reader none.
  const link = { on: true }
  const writer = connected(plain, layoutFor(description), {
    keep: true,
    copy: (change) => {
      changes.push(change)
      if (link.on) applyChange(reader, change)
    },
  })
  switchTo(writer, description)
  return { writer, reader, plain, changes, link }
}

/** Every row of a table as a store holds it. */
export function stored(store: Store, name: string): Row[] {
  const rows = store.read({ from: name }, system).value
  const all = Array.isArray(rows) ? rows : []
  // A table with a key of its own answers its rows in the order a file keeps them, which is each machine's own.
  return name === '_t_meta' ? all.sort((a, b) => (String(a.key) < String(b.key) ? -1 : 1)) : all
}

/** What a raw text reads of a store. */
export const raw = (store: Store, sql: string, values: unknown[] = []): Row[] =>
  (store.sql?.(sql, values) ?? []).map((row) => ({ ...Object(row) }))

/** What a store holds of the tables a record covers, table by table: its rows, its vectors as they are stored, and what `_t_meta` says. */
export function held(store: Store): Record<string, unknown> {
  const tables = store.layout().filter((one) => !one.own)
  const all: Record<string, unknown> = {}
  for (const layout of tables) {
    all[layout.name] = layout.retired ? 'retired' : stored(store, layout.name)
    for (const [column, type] of Object.entries(layout.columns))
      if (type.kind === 'vector')
        all[`${layout.name}__${column}`] = raw(
          store,
          `SELECT "t"."id", hex("v"."v") AS "v" FROM "${layout.name}__${column}" AS "v" JOIN "${layout.name}" AS "t" ON "t"."_n" = "v"."_n" ORDER BY "t"."id"`,
        )
  }
  return all
}

/** Holds a reader against its writer: the tables a record covers, the number, the running fingerprint and the kept changes. */
export function same(writer: Store, reader: Store, description: Description, what = ''): void {
  assert.deepEqual(held(reader), held(writer), what)
  assert.equal(here(reader).sum, here(writer).sum, what)
  const kept = (store: Store) =>
    stored(store, changesTable.name).map(({ record, ...row }) => ({ ...row, record: Object(record).length }))
  assert.deepEqual(kept(reader), kept(writer), what)
  // Every plan of the test answers alike, a text search and a search by meaning among them.
  for (const [i, plan] of plansOf(description).entries())
    assert.deepEqual(
      plan(reading(reader, description, system, { seal })),
      plan(reading(writer, description, system, { seal })),
      `${what} plan ${i}`,
    )
}

/** The plans that both machines are asked. */
function plansOf(description: Description): ((db: object) => unknown)[] {
  const has = (name: string) => Object.hasOwn(description.tables, name)
  return [
    (db) => at(db, 'customers').search('acme').all(),
    (db) => at(db, 'products').search('nut').all(),
    (db) => at(db, 'products').search('he').all(),
    (db) =>
      at(db, 'orders')
        .where({ net: { above: 20 } })
        .sort('-net', 'id')
        .limit(20)
        .all(),
    (db) =>
      at(db, 'orders')
        .where({ 'customer.name': { startsWith: 'a' } })
        .with('customer')
        .all(),
    (db) =>
      at(db, 'orders')
        .group('status', { n: { count: true }, net: { sum: 'net' } })
        .all(),
    (db) => at(db, 'lines').count(),
    (db) =>
      at(db, 'lines')
        .where({ product: { empty: true } })
        .count(),
    (db) => (has('articles') ? at(db, 'articles').near('meaning', [1, 0, 0, 0]).limit(5).all() : []),
    (db) =>
      has('articles') ? at(db, 'articles').near('meaning', [0, 1, 1, 0], { measure: 'straight' }).limit(50).all() : [],
  ]
}

// The change sets of SQLite, read far enough to say which tables one holds: https://sqlite.org/sessionintro.html
function varint(bytes: Uint8Array, from: number): [number, number] {
  let value = 0
  for (let i = 0; i < 9; i++) {
    const byte = bytes[from + i]
    if (i === 8) return [value * 256 + byte, from + 9]
    value = value * 128 + (byte & 0x7f)
    if (byte < 0x80) return [value, from + i + 1]
  }
  return [value, from + 9]
}

function afterValue(bytes: Uint8Array, from: number): number {
  const type = bytes[from]
  if (type === 0 || type === 5) return from + 1
  if (type === 1 || type === 2) return from + 9
  const [length, next] = varint(bytes, from + 1)
  return next + length
}

/** Takes a record of the SQLite store. Answers the tables it holds rows of, each with how many changes of rows. */
export function tablesIn(record: Uint8Array): Map<string, number> {
  const tables = new Map<string, number>()
  let at = 0
  let name = ''
  let columns = 0
  while (at < record.length) {
    // 'T' begins the part of one table: its columns, which of them are its key, and its name.
    if (record[at] === 0x54) {
      ;[columns, at] = varint(record, at + 1)
      at += columns
      const end = record.indexOf(0, at)
      name = new TextDecoder().decode(record.subarray(at, end))
      at = end + 1
      continue
    }
    // A changed row holds its values twice over, as they were and as they are.
    const changed = record[at] === 23
    at += 2
    for (let i = 0; i < (changed ? 2 * columns : columns); i++) at = afterValue(record, at)
    tables.set(name, (tables.get(name) ?? 0) + 1)
  }
  return tables
}
