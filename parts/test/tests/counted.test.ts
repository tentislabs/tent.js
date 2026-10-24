import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { dataPlace, openOn, readFile } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

type Row = Record<string, unknown>

/** Every row of a table, as the system reads it. */
async function rowsOf(app: App, table: string): Promise<Row[]> {
  const rows: unknown = await app.read({ from: table, sort: [{ by: 'id' }] }, system)
  return Array.isArray(rows) ? rows : []
}

/** The kept numbers of each customer, and the same numbers worked out by a query of its orders. */
async function keptAndCounted(app: App): Promise<{ kept: Row[]; counted: Row[] }> {
  const [customers, orders] = [await rowsOf(app, 'customers'), await rowsOf(app, 'orders')]
  const kept = customers.map((one) => ({
    id: one.id,
    openOrders: one.openOrders,
    spent: one.spent,
    least: one.least ?? null,
    most: one.most ?? null,
  }))
  const counted = customers.map((one) => {
    const mine = orders.filter((order) => order.customer === one.id)
    const totals = mine.map((order) => Number(order.total))
    const paid = mine.filter((order) => order.status === 'paid').map((order) => Number(order.total))
    return {
      id: one.id,
      openOrders: mine.filter((order) => order.status === 'open').length,
      spent: totals.reduce((all, n) => all + n, 0),
      least: totals.length ? Math.min(...totals) : null,
      most: paid.length ? Math.max(...paid) : null,
    }
  })
  return { kept, counted }
}

/** A source of numbers from 0 up to 1 that gives the same numbers on every run. */
function drawer(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))

test('[45-3] after adds, sets, removes and a raw write, each kept count, sum, least and most equals what a query of the linked rows works out, in every case', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'counted') })
  closing(t, () => app.close())
  const customers: string[] = []
  for (const name of ['Ada', 'Bob', 'Cem', 'Dee']) customers.push(idOf(await app.call('addCustomer', { name }, system)))
  // A customer with no order holds 0 and 0, and nothing as its least and its most.
  assert.deepEqual((await keptAndCounted(app)).kept[0], {
    id: customers[0],
    openOrders: 0,
    spent: 0,
    least: null,
    most: null,
  })
  const draw = drawer(45)
  const pick = <T>(from: T[]): T => from[Math.floor(draw() * from.length)]
  const status = () => (draw() < 0.5 ? 'open' : 'paid')
  const orders: string[] = []
  const done: string[] = []
  for (let k = 0; k < 120; k++) {
    const kind = orders.length < 4 ? 0 : Math.floor(draw() * 5)
    if (kind <= 1) {
      const total = 1 + Math.floor(draw() * 100)
      orders.push(idOf(await app.call('addOrder', { customer: pick(customers), total, status: status() }, system)))
      done.push('add')
    } else if (kind === 2) {
      // A set that may move the order to another customer: both are counted anew.
      const order = pick(orders)
      const total = 1 + Math.floor(draw() * 100)
      await app.call('setOrder', { order, customer: pick(customers), total, status: status() }, system)
      done.push('set')
    } else if (kind === 3) {
      const order = pick(orders)
      orders.splice(orders.indexOf(order), 1)
      await app.call('removeOrder', { order }, system)
      done.push('remove')
    } else {
      await app.call('payAll', { customer: pick(customers) }, system)
      done.push('raw')
    }
    const { kept, counted } = await keptAndCounted(app)
    assert.deepEqual(kept, counted, `after write ${k}, a ${done.at(-1)}`)
  }
  for (const kind of ['add', 'set', 'remove', 'raw']) assert.ok(done.includes(kind), `a ${kind} was made`)
  // The removal of a customer removes its orders, and nothing is left to count.
  await app.write([{ remove: 'customers', id: customers[1] }], system)
  const { kept, counted } = await keptAndCounted(app)
  assert.deepEqual(kept, counted)
})

test('[45-3] a kept count is written by no code: a change that names it is T2107', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'counted') })
  closing(t, () => app.close())
  const ada = idOf(await app.call('addCustomer', { name: 'Ada' }, system))
  await assert.rejects(app.call('setCount', { customer: ada }, system), { code: 'T2107' })
  assert.equal((await rowsOf(app, 'customers'))[0].openOrders, 0)
})

/** Builds the project of the counts, where `bare` leaves the kept columns out of its customers, with `page` as its `limits.workPage`. */
async function countedBundle(t: TestContext, bare: boolean, page?: number): Promise<string> {
  const project = copyOf(t, 'counted')
  if (page !== undefined) {
    const file = join(project, 'tent.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace('backups:', `limits: { workPage: ${page} },\n  backups:`))
  }
  if (bare) {
    const file = join(project, 'tables', 'customers.ts')
    const text = readFileSync(file, 'utf8')
    writeFileSync(
      file,
      text
        .replace(/ {4}openOrders:[\s\S]*?most: number\(\{ from: max\([^\n]*\n/, '')
        .replace(
          "import { anyone, count, max, min, number, sum, table, text } from 'tentjs'",
          "import { anyone, table, text } from 'tentjs'",
        )
        .replace("import { orders } from './orders'\n", ''),
    )
    const functions = join(project, 'functions', 'functions.ts')
    const kept = readFileSync(functions, 'utf8')
    writeFileSync(functions, kept.slice(0, kept.indexOf('// A kept count is the engine')))
  }
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return built.bundleFolder
}

test('[45-3] kept columns that a version adds are worked out once, by a walk, at the switch that adds them', async (t) => {
  const dataFolder = dataPlace(t)
  const before = await openOn(t, await countedBundle(t, true), dataFolder)
  const customers: string[] = []
  for (const name of ['Ada', 'Bob', 'Cem']) customers.push(idOf(await before.app.call('addCustomer', { name }, system)))
  for (let i = 0; i < 30; i++)
    await before.app.call(
      'addOrder',
      { customer: customers[i % 3], total: 10 + i, status: i % 4 ? 'open' : 'paid' },
      system,
    )
  await before.engine.close()
  const after = await openOn(t, await countedBundle(t, false), dataFolder)
  const { kept, counted } = await keptAndCounted(after.app)
  assert.deepEqual(kept, counted)
  assert.ok(kept.every((one) => Number(one.openOrders) > 0))
})

test('[45-3] the kept columns that a version adds are filled by the one walk of a switch, a page to a write, and its notes are gone at its end', async (t) => {
  const dataFolder = dataPlace(t)
  const before = await openOn(t, await countedBundle(t, true, 2), dataFolder)
  const customers: string[] = []
  for (const name of ['Ada', 'Bob', 'Cem', 'Dee', 'Eda'])
    customers.push(idOf(await before.app.call('addCustomer', { name }, system)))
  for (let i = 0; i < 20; i++)
    await before.app.call(
      'addOrder',
      { customer: customers[i % 5], total: 10 + i, status: i % 3 ? 'open' : 'paid' },
      system,
    )
  await before.engine.close()
  // Five customers in pages of two: a walk that stopped after its first page leaves the last three at nothing.
  const after = await openOn(t, await countedBundle(t, false, 2), dataFolder)
  const { kept, counted } = await keptAndCounted(after.app)
  assert.deepEqual(kept, counted)
  assert.ok(kept.every((one) => Number(one.openOrders) > 0))
  await after.engine.close()
  const notes = readFile(join(dataFolder, 'data.db'), `SELECT "key" FROM "_t_meta" WHERE "key" LIKE 'walk.%'`)
  assert.deepEqual(notes, [])
})
