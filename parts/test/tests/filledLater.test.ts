import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, command, readFile } from './desks.ts'
import type { Seen } from './filling/helpers/seen.ts'
import { listened } from './probe.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const
const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What the work of the project did, made anew for each test: the test hears each call, and holds it at a gate. */
function seenAnew(t: TestContext): Seen {
  const made: Seen = { calls: [] }
  listened(t, 'tentjs.test.filling', async (told) => {
    const call = { work: String(Reflect.get(Object(told), 'work')), input: Reflect.get(Object(told), 'input') }
    made.calls.push(call)
    if (made.gate?.work === call.work) await made.gate.held
  })
  return made
}

/** Changes a file of a copy of the project, where the test asks. */
function edited(folder: string, file: string, from: string, to: string): void {
  const path = join(folder, file)
  const text = readFileSync(path, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(path, text.replace(from, to))
}

/** The app of a copy of the project of filled columns, with what builds a change of it and has the app run it. */
async function filling(t: TestContext, before?: (folder: string) => void) {
  const seen = seenAnew(t)
  const folder = copyOf(t, 'filling')
  before?.(folder)
  const { app, dataFolder } = await appIn(t, folder)
  let n = 0
  const switched = async (file: string, from: string, to: string): Promise<void> => {
    edited(folder, file, from, to)
    n += 1
    const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${n}`) })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error').map((one) => one.message),
      [],
    )
    await app.switch(await app.add(built.bundleFolder))
  }
  return { app, dataFolder, seen, folder, switched }
}

async function until(app: TestApp, what: string, holds: () => boolean | Promise<boolean>, tries = 300): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail(`never: ${what}`)
}

const filledRows = (dataFolder: string): Record<string, unknown>[] =>
  readFile(join(dataFolder, 'data.db'), 'SELECT * FROM "_t_filled"')

async function addOrders(app: TestApp, count: number, values: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const rows = await app.write([{ add: 'orders', values: { title: `order ${i}`, note: 'plain', ...values } }], system)
    ids.push(String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id')))
  }
  return ids
}

const summaries = async (app: TestApp): Promise<unknown[]> => (await app.rows('orders')).map((row) => row.summary)
const countOf = (app: TestApp, column: string) =>
  Object(app.filled().find((one) => one.table === 'orders' && one.column === column))

test('[51-12] a value that reads customer.name is made anew after that name changed; the write that changed it marked one row, and a second change during the marking is not missed', async (t) => {
  const { app, dataFolder } = await filling(t)
  const rows = await app.write([{ add: 'customers', values: { name: 'Ann' } }], system)
  const customer = String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id'))
  const ids = await addOrders(app, 3, { customer })
  await until(app, 'the names are made', async () => (await app.rows('orders')).every((row) => row.who === 'for Ann'))
  const before = filledRows(dataFolder).filter((one) => one.columnName === 'who')
  await app.write([{ change: 'customers', id: customer, values: { name: 'Bea' } }], system)
  // The write marked the customer under `*`, and not one of the orders that read its name.
  assert.deepEqual(
    filledRows(dataFolder)
      .filter((one) => one.columnName === '*')
      .map((one) => [one.tableName, one.rowId]),
    [['customers', customer]],
  )
  assert.deepEqual(
    filledRows(dataFolder).filter((one) => one.columnName === 'who'),
    before,
    'the write marked the orders that read the name itself',
  )
  await app.write([{ change: 'customers', id: customer, values: { name: 'Cy' } }], system)
  await until(app, 'the names are made anew', async () =>
    (await app.rows('orders')).every((row) => row.who === 'for Cy'),
  )
  assert.equal(ids.length, 3)
})

test('[51-12] after its work changed the values are old and stay readable, a filter with filled old finds them, and a pass makes them anew after the values that are missing', async (t) => {
  const { app, seen, switched } = await filling(t)
  const made = await app.write([{ add: 'customers', values: { name: 'Ann' } }], system)
  const customer = String(Reflect.get(Object(Array.isArray(made) ? made[0] : made), 'id'))
  await addOrders(app, 3, { customer })
  await until(app, 'the values are made', async () => (await app.rows('orders')).every((row) => row.who === 'for Ann'))
  // The pass is held in the work of another group, so that what is missing and what is old are due at once.
  let open = (): void => undefined
  seen.gate = { work: 'whoOf', held: new Promise<void>((done) => (open = done)) }
  await app.write([{ change: 'customers', id: customer, values: { name: 'Bea' } }], system)
  await until(app, 'the pass is held', () =>
    seen.calls.some((one) => one.work === 'whoOf' && Object(one.input).name === 'Bea'),
  )
  await switched(
    'functions.ts',
    "await noted('summarize', input)",
    "await noted('summarize', input)\n    Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'a change of the work')",
  )
  assert.equal(countOf(app, 'summary').old, 3)
  assert.ok(
    (await summaries(app)).every((one) => typeof one === 'string'),
    'old values stay readable',
  )
  const found = await app.read({ from: 'orders', where: { col: 'summary', filled: 'old' } }, { as: 'system' })
  assert.equal(Array.isArray(found) ? found.length : -1, 3)
  const [fresh] = await addOrders(app, 1, { title: 'fresh' })
  for (let i = 0; i < 6; i++) app.clock.advance('1 second')
  const before = seen.calls.length
  delete seen.gate
  open()
  await until(
    app,
    'the old values are made anew',
    () => countOf(app, 'summary').old === 0 && countOf(app, 'summary').missing === 0,
  )
  const order = seen.calls
    .slice(before)
    .filter((one) => one.work === 'summarize')
    .map((one) => Object(one.input).title)
  assert.equal(order[0], 'fresh', `the missing value went first: ${order}`)
  assert.ok(fresh)
})

test('[51-12] with order oldest in by, the values are made by the moment each became due: the old values of a switch before a missing one that became due after it', async (t) => {
  const { app, seen, switched } = await filling(t, (folder) =>
    edited(
      folder,
      'tables.ts',
      'summary: text({ optional: true, by: summarize }),',
      "summary: text({ optional: true, by: { work: summarize, order: 'oldest' } }),",
    ),
  )
  const made = await app.write([{ add: 'customers', values: { name: 'Ann' } }], system)
  const customer = String(Reflect.get(Object(Array.isArray(made) ? made[0] : made), 'id'))
  await addOrders(app, 3, { customer })
  await until(app, 'the values are made', async () => (await app.rows('orders')).every((row) => row.who === 'for Ann'))
  // The pass is held in the work of another group, so that what is missing and what is old are due at once.
  let open = (): void => undefined
  seen.gate = { work: 'whoOf', held: new Promise<void>((done) => (open = done)) }
  await app.write([{ change: 'customers', id: customer, values: { name: 'Bea' } }], system)
  await until(app, 'the pass is held', () =>
    seen.calls.some((one) => one.work === 'whoOf' && Object(one.input).name === 'Bea'),
  )
  await switched(
    'functions.ts',
    "await noted('summarize', input)",
    "await noted('summarize', input)\n    Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'a change of the work')",
  )
  assert.equal(countOf(app, 'summary').old, 3)
  assert.ok(
    (await summaries(app)).every((one) => typeof one === 'string'),
    'old values stay readable',
  )
  const found = await app.read({ from: 'orders', where: { col: 'summary', filled: 'old' } }, { as: 'system' })
  assert.equal(Array.isArray(found) ? found.length : -1, 3)
  const [fresh] = await addOrders(app, 1, { title: 'fresh' })
  for (let i = 0; i < 6; i++) app.clock.advance('1 second')
  const before = seen.calls.length
  delete seen.gate
  open()
  await until(
    app,
    'the old values are made anew',
    () => countOf(app, 'summary').old === 0 && countOf(app, 'summary').missing === 0,
  )
  const order = seen.calls
    .slice(before)
    .filter((one) => one.work === 'summarize')
    .map((one) => Object(one.input).title)
  assert.equal(order.at(-1), 'fresh', `the missing value, due last, went last: ${order}`)
  assert.ok(fresh)
})

test('[51-12] a new debounce makes none old; with old keep none is made anew, twice in a row too, and a later change without it makes them all old; with old drop they are emptied in the switch', async (t) => {
  const { app, seen, switched } = await filling(t)
  await addOrders(app, 2)
  await until(app, 'the summaries are made', async () => (await summaries(app)).every((one) => typeof one === 'string'))
  await switched(
    'tables.ts',
    'summary: text({ optional: true, by: summarize }),',
    "summary: text({ optional: true, by: { work: summarize, debounce: '2 seconds' } }),",
  )
  await moment(100)
  assert.equal(countOf(app, 'summary').old, 0, 'a new debounce made values old')
  await switched(
    'tables.ts',
    "summary: text({ optional: true, by: { work: summarize, debounce: '2 seconds' } }),",
    "summary: text({ optional: true, old: 'keep', by: summarize }),",
  )
  await switched(
    'functions.ts',
    "await noted('summarize', input)",
    "await noted('summarize', input)\n    Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'kept the same, once')",
  )
  await moment(100)
  assert.equal(countOf(app, 'summary').old, 0)
  await switched(
    'functions.ts',
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'kept the same, once')",
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'kept the same, twice')",
  )
  await moment(100)
  assert.equal(countOf(app, 'summary').old, 0, 'keep twice in a row')
  await switched(
    'tables.ts',
    "summary: text({ optional: true, old: 'keep', by: summarize }),",
    'summary: text({ optional: true, by: summarize }),',
  )
  // The work is held back, so that the values are seen old before the pass makes them anew.
  let open = (): void => undefined
  seen.gate = { work: 'summarize', held: new Promise<void>((done) => (open = done)) }
  await switched(
    'functions.ts',
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'kept the same, twice')",
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'and now changed')",
  )
  await moment(100)
  assert.equal(
    countOf(app, 'summary').old + countOf(app, 'summary').missing,
    2,
    'a change without keep made them all old',
  )
  delete seen.gate
  open()
  await until(app, 'the summaries are made anew', () => countOf(app, 'summary').old === 0)
  seen.gate = { work: 'summarize', held: new Promise<void>((done) => (open = done)) }
  await switched(
    'tables.ts',
    'summary: text({ optional: true, by: summarize }),',
    "summary: text({ optional: true, old: 'drop', by: summarize }),",
  )
  await switched(
    'functions.ts',
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'and now changed')",
    "Reflect.set(globalThis, Symbol.for('tentjs.test.mark'), 'dropped')",
  )
  assert.ok(
    (await summaries(app)).every((one) => one === undefined || one === null),
    'the old values were emptied in the switch',
  )
  delete seen.gate
  open()
  await until(app, 'the summaries are filled anew', async () =>
    (await summaries(app)).every((one) => typeof one === 'string'),
  )
})

test('[51-12] a row written in raw SQL is found by tent filled --look', async (t) => {
  const { app, dataFolder } = await filling(t)
  // The walk of the columns that the opening saw for the first time has ended before the raw write.
  for (let i = 0; i < 3; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  await app.call(
    'rawOrder',
    { id: '01m4xzzzzzzzzzzzzzzzzzzzzz', title: 'raw', note: 'sql' },
    { as: { kind: 'system' } },
  )
  for (let i = 0; i < 10; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  const raw = async () => (await app.rows('orders')).find((row) => row.title === 'raw')
  assert.equal((await raw())?.summary, undefined, 'a write in raw SQL set a mark')
  const looked = Object(await command(app, dataFolder, 'filled', { look: true }))
  assert.ok(Number(looked.marked) >= 1)
  await until(app, 'the raw row is filled', async () => (await raw())?.summary === 'raw: sql')
})

test('[51-12] a fill by an action that states background, with the writer killed while it works, is paid for once', async (t) => {
  const { app, seen } = await filling(t)
  let open = (): void => undefined
  seen.gate = { work: 'briefOf', held: new Promise<void>((done) => (open = done)) }
  await app.write([{ add: 'letters', values: { title: 'hello' } }], system)
  await until(app, 'the work began', () => seen.calls.some((one) => one.work === 'briefOf'))
  await app.kill()
  delete seen.gate
  open()
  await app.restart()
  await until(
    app,
    'the brief is made',
    async () => (await app.rows('letters')).every((row) => row.brief === 'brief hello'),
    400,
  )
  assert.equal((await app.runs.find({ flow: 'briefOf' })).length, 1, 'a second run was made for the same value')
})
