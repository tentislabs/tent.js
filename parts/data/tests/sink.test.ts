import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { calc, col, link, number, project, table, text } from '../../core/index.ts'
import type { Clock } from '../../core/internal.ts'
import { runKilled } from '../../../rig/kill.ts'
import type { ChangeSink, Row, Store, TableLayout, TableStep } from '../index.ts'
import { applySteps, connected, historyTable, layoutOf } from '../index.ts'
import { at, described, seal, sqlOf, writing } from './shop.ts'
import { planned } from './switch.ts'
import { codeOf, made, opened, system, workFolder } from './work.ts'

type Handed = Parameters<ChangeSink['wrote']>[0]

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const customers = (more: object = {}) =>
  table('customers', {
    columns: { name: text(), taxNo: text({ sealed: true, optional: true }), ...more },
    access,
    keepHistory: true,
  })
const orders = table('orders', {
  columns: {
    customer: link('customers'),
    net: number(),
    note: text({ optional: true }),
    gross: number({ from: calc('*', col('net'), 2) }),
  },
  access,
})
const shop = described([project('shop', {}), customers(), orders])

/** Lets what waits on a promise that is settled run. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

/** A clock that a test moves by hand: a timer runs when the time is moved past it. */
function testClock() {
  let now = 1_000_000
  const timers: { at: number; run: () => void }[] = []
  const clock: Clock = {
    now: () => now,
    setTimer(when, run) {
      const timer = { at: when, run }
      timers.push(timer)
      return () => {
        if (timers.includes(timer)) timers.splice(timers.indexOf(timer), 1)
      }
    },
  }
  const pass = async (ms: number) => {
    now += ms
    for (const timer of [...timers].filter((one) => one.at <= now)) {
      timers.splice(timers.indexOf(timer), 1)
      timer.run()
    }
    await settled()
  }
  return { clock, pass, timers }
}

/** A sink that keeps what it is handed, and that can be told to fail a number of times. */
function testSink(answer: ReturnType<ChangeSink['start']> = 0) {
  const kept: { started: number[]; handed: Handed[]; tried: number[]; fail: number } = {
    started: [],
    handed: [],
    tried: [],
    fail: 0,
  }
  const sink: ChangeSink = {
    start(n) {
      kept.started.push(n)
      return answer
    },
    wrote(change) {
      kept.tried.push(change.n)
      if (kept.fail-- > 0) throw new Error('the sink is down')
      kept.handed.push(structuredClone(change))
    },
  }
  return { sink, kept }
}

/** A store with the tables of the shop and the table of row history, and the layout of both. */
function shopStores(t: Parameters<typeof workFolder>[0]): { plain: Store; layout: TableLayout[] } {
  const plain = opened(workFolder(t))
  const layout = [...layoutOf(shop), historyTable]
  made(plain, layout)
  return { plain, layout }
}

/** Applies one change that a sink was handed to a second store, as a builder who keeps a copy elsewhere would. */
function apply(copy: Store, change: Handed): void {
  const worked = (name: string) =>
    Object.entries(copy.layout().find((one) => one.name === name)?.columns ?? {}).filter(
      ([, type]) => !('from' in type && type.from !== undefined),
    )
  copy.write(
    (tx) => {
      if (change.layout) copy.applyTableChanges(change.layout)
      for (const { table: name, kind, row } of change.rows ?? []) {
        // A column that a stored row does not hold holds nothing.
        const values = Object.fromEntries(worked(name).map(([column]) => [column, row[column] ?? null]))
        if (kind === 'added')
          tx.add(name, { ...values, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt }, system)
        else if (kind === 'changed') tx.change(name, String(row.id), { ...values, updatedAt: row.updatedAt }, system)
        else tx.remove(name, String(row.id), system)
      }
      for (const { text: sql, values } of change.raw ?? []) tx.sql(sql, values, [])
    },
    { steps: change.layout !== undefined },
  )
}

const rowsOf = (store: Store, name: string): Row[] => Object(store.read({ from: name }, system).value)

test('[20-6] a ChangeSink is handed every write in order, a raw SQL write with its values and a table change with its steps among them, and a failed one again', async (t) => {
  const { plain, layout } = shopStores(t)
  const copy = shopStores(t).plain
  const { sink, kept } = testSink()
  const { clock, pass } = testClock()
  const store = connected(plain, layout, { sink, clock, wait: 5000 })
  await settled()
  // When it is connected the sink is told the number the data stands at.
  assert.deepEqual(kept.started, [0])

  const write = writing(store, shop, system, { seal })
  const ids = write((db) => {
    const acme = String(at(db, 'customers').add({ name: 'Acme', taxNo: 'TR-1' }).id)
    return { acme, order: String(at(db, 'orders').add({ customer: acme, net: 10, note: 'first' }).id) }
  })
  write((db) => at(db, 'orders').change(ids.order, { net: 12, note: null }))
  writing(store, shop, system, { system: true, touches: ['orders'] })((db) =>
    sqlOf(db)('UPDATE "orders" SET "net" = "net" + ? WHERE "net" > ?', [1, 5]),
  )
  const wider = described([project('shop', {}), customers({ more: text({ optional: true }) }), orders])
  const { steps } = planned(store, wider)
  store.write((tx) => applySteps(tx, store, steps, { seal }), { steps: true })
  const second = write((db) => String(at(db, 'orders').add({ customer: ids.acme, net: 1 }).id))
  write((db) => at(db, 'orders').remove(second))
  // A write that wrote nothing, and one that failed, take no number and are not handed on.
  store.write((tx) => tx.read({ from: 'orders' }, system))
  assert.equal(
    codeOf(() =>
      write((db) => at(db, 'orders').add({ customer: ids.acme, net: 5 }) && at(db, 'orders').add({ net: 1 })),
    ),
    'T2107',
  )
  // A write that touched the engine's own tables alone is handed as a change with no rows, so no number is left out.
  write((db) => at(db, 'customers').change(ids.acme, { name: 'Acme Works' }))
  store.write((tx) =>
    tx.add(
      historyTable.name,
      { id: 'h1', tableName: 'x', rowId: 'y', at: new Date(0), by: 'system', value: {} },
      system,
    ),
  )
  await settled()

  const { handed } = kept
  assert.deepEqual(
    handed.map((change) => change.n),
    [1, 2, 3, 4, 5, 6, 7, 8],
  )
  assert.ok(handed.every((change) => change.at === clock.now()))
  const told = (change: Handed) => (change.rows ?? []).map((one) => `${one.kind} ${one.table} ${one.row.id}`)
  // The rows as they are stored: a sealed value sealed, and a worked-out column with what it holds.
  assert.deepEqual(told(handed[0]), [`added customers ${ids.acme}`, `added orders ${ids.order}`])
  assert.equal(handed[0].rows?.[0].row.taxNo, seal.close('TR-1', `customers.taxNo.${ids.acme}`))
  assert.deepEqual(
    { ...handed[0].rows?.[1].row, createdAt: 0, updatedAt: 0 },
    { id: ids.order, createdAt: 0, updatedAt: 0, customer: ids.acme, net: 10, note: 'first', gross: 20 },
  )
  assert.deepEqual(told(handed[1]), [`changed orders ${ids.order}`])
  assert.deepEqual([handed[1].rows?.[0].row.net, handed[1].rows?.[0].row.note], [12, undefined])
  // A raw SQL write with its text and its values, and a table change with its steps.
  assert.deepEqual(handed[2].raw, [{ text: 'UPDATE "orders" SET "net" = "net" + ? WHERE "net" > ?', values: [1, 5] }])
  assert.equal(handed[2].rows, undefined)
  const added: TableStep[] = [
    { do: 'addColumn', table: 'customers', column: 'more', to: { kind: 'text', optional: true } },
  ]
  assert.deepEqual(handed[3].layout, added)
  assert.deepEqual(told(handed[4]), [`added orders ${second}`])
  assert.deepEqual(told(handed[5]), [`removed orders ${second}`])
  // The earlier version that the change of the customer kept is a row of the engine's own, and is not handed on.
  assert.deepEqual(told(handed[6]), [`changed customers ${ids.acme}`])
  assert.deepEqual([handed[7].rows, handed[7].raw, handed[7].layout], [undefined, undefined, undefined])

  // A sink that fails is told the same write again after the wait, and then after six times that, each time.
  kept.fail = 2
  kept.tried.length = 0
  write((db) => at(db, 'orders').change(ids.order, { note: 'ninth' }))
  write((db) => at(db, 'orders').change(ids.order, { note: 'tenth' }))
  await settled()
  assert.deepEqual(kept.tried, [9])
  await pass(4999)
  assert.deepEqual(kept.tried, [9])
  await pass(1)
  assert.deepEqual(kept.tried, [9, 9])
  await pass(29_999)
  assert.deepEqual(kept.tried, [9, 9])
  await pass(1)
  // Once it takes the write, what waited behind it follows, in order.
  assert.deepEqual(kept.tried, [9, 9, 9, 10])
  assert.deepEqual(
    handed.map((change) => change.n),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )

  // A file that is kept by applying them holds the tables of the app as the data does.
  for (const change of handed) apply(copy, change)
  for (const name of ['customers', 'orders']) assert.deepEqual(rowsOf(copy, name), rowsOf(store, name), name)
  assert.equal(rowsOf(store, 'orders').length, 1)
  assert.deepEqual(rowsOf(store, 'orders')[0].net, 13)
  const columns = (of: Store) => Object.keys(of.layout().find((one) => one.name === 'customers')?.columns ?? {})
  assert.deepEqual(columns(copy), columns(store))
})

test('[20-6] a sink that asks for all is handed the engine tables too, and it is told where the data stands when the store is opened again', async (t) => {
  const folder = workFolder(t)
  const plain = opened(folder)
  const layout = [...layoutOf(shop), historyTable]
  made(plain, layout)
  const { clock } = testClock()

  // `{ n, all: true }`: the rows of the engine's own tables are handed on too.
  const { sink, kept } = testSink(Promise.resolve({ n: 0, all: true }))
  const store = connected(plain, layout, { sink, clock })
  const write = writing(store, shop, system, { seal })
  const acme = write((db) => String(at(db, 'customers').add({ name: 'Acme' }).id))
  write((db) => at(db, 'customers').change(acme, { name: 'Acme Works' }))
  await settled()
  assert.deepEqual(
    kept.handed.map((change) => (change.rows ?? []).map((one) => `${one.kind} ${one.table}`)),
    [['added customers'], ['changed customers', 'added _t_history']],
  )
  assert.deepEqual(kept.started, [0])
  store.close()
  store.open(folder)
  await settled()
  assert.deepEqual(kept.started, [0, 2])
  write((db) => at(db, 'customers').add({ name: 'Bolt' }))
  await settled()
  assert.deepEqual(
    kept.handed.map((change) => change.n),
    [1, 2, 3],
  )
})

test('[20-6] a sink that falls behind past what is kept is closed, and is told the number the data stands at before it is handed a write again', async (t) => {
  const { plain, layout } = shopStores(t)
  const { clock, pass, timers } = testClock()
  const { sink, kept } = testSink()
  // Room for a few writes of one customer each.
  const store = connected(plain, layout, { sink, clock, wait: 5000, kept: 2000 })
  const write = writing(store, shop, system, { seal })
  kept.fail = 1_000_000
  for (let i = 0; i < 20; i++) {
    write((db) => at(db, 'customers').add({ name: `Customer ${i} ${'x'.repeat(100)}` }))
    await settled()
  }
  // Nothing was taken. What waited passed the bound, so the sink was closed, and what waited was let go: it was
  // told where the data stood before it was handed a write again, more than once.
  assert.equal(kept.handed.length, 0)
  assert.ok(kept.started.length > 2, `started at ${kept.started}`)
  assert.deepEqual(
    kept.started,
    [...kept.started].sort((a, b) => a - b),
  )
  assert.ok(timers.length <= 1)
  // Once it takes writes again, it is handed every write after the number it was last told, in order.
  kept.fail = 0
  write((db) => at(db, 'customers').add({ name: 'the next' }))
  await pass(30_000)
  await pass(30_000)
  const from = kept.started.at(-1) ?? 0
  assert.deepEqual(
    kept.handed.map((change) => change.n),
    Array.from({ length: 21 - from }, (_, i) => from + 1 + i),
  )
})

test('[20-6] after a kill between a commit and the handing on, start shows the gap', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'handing.ts')
  const killed = await runKilled(program, { times: 3, when: 'mid', args: [workFolder(t)] })
  assert.equal(killed.kills, 3)
  for (const [round, one] of killed.ended.entries()) {
    assert.equal(one.code, 0, `seed ${killed.seed}, round ${round}: ${one.out}`)
    // The data holds the write that was committed, and the sink was handed one write less.
    assert.match(one.out, new RegExp(`^start: the data stands at ${round + 1}, the sink holds ${round}$`, 'm'))
  }
})
