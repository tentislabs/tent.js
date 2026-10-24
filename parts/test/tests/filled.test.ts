import assert from 'node:assert/strict'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
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

/** The app of the project of filled columns, with its data folder and what the work did. */
async function filling(t: TestContext) {
  const seen = seenAnew(t)
  const { app, dataFolder } = await appIn(t, copyOf(t, 'filling'))
  return { app, dataFolder, seen }
}

/** Waits until something holds, moving the clock on a second at a time, so that debounce and the waits pass. */
async function until(app: TestApp, what: string, holds: () => boolean | Promise<boolean>, tries = 300): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail(`never: ${what}`)
}

/** The rows of `_t_filled` of a data folder, by the shared file. */
const filledRows = (dataFolder: string): Record<string, unknown>[] =>
  readFile(join(dataFolder, 'data.db'), 'SELECT * FROM "_t_filled" ORDER BY "tableName", "rowId", "columnName"')

/** One order by its id, as the app holds it now. */
async function orderOf(app: TestApp, id: string): Promise<Record<string, unknown> | undefined> {
  return (await app.rows('orders')).find((row) => row.id === id)
}

async function addOrder(app: TestApp, values: Record<string, unknown>): Promise<string> {
  const rows = await app.write([{ add: 'orders', values }], system)
  return String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id'))
}

const calls = (seen: Seen, work: string) => seen.calls.filter((one) => one.work === work)

test('[51-12] a row that is added has its value written by the work once it stood still for debounce; a change of a column that the work reads makes it anew, and a change of another column does not', async (t) => {
  const { app, seen } = await filling(t)
  const id = await addOrder(app, { title: 'Tea', note: 'green' })
  app.clock.advance('3 seconds')
  await moment(100)
  assert.equal((await orderOf(app, id))?.summary, undefined, 'not before debounce')
  await until(app, 'the summary is made', async () => (await orderOf(app, id))?.summary === 'Tea: green')
  // The work is handed the columns it names, and nothing else of the row.
  assert.deepEqual(Object.keys(Object(calls(seen, 'summarize')[0]?.input)).sort(), ['note', 'title'])
  await app.write([{ change: 'orders', id, values: { note: 'black' } }], system)
  await until(app, 'the summary is made anew', async () => (await orderOf(app, id))?.summary === 'Tea: black')
  await app.write([{ change: 'orders', id, values: { tag: 'hot' } }], system)
  for (let i = 0; i < 10; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  assert.equal(calls(seen, 'summarize').length, 2, 'a change of a column the work does not read made it anew')
})

test('[51-12] a row that changed while the work ran: the answer is dropped and the value is made anew; a row that was removed meanwhile: nothing is written, and its rows of _t_filled are gone', async (t) => {
  const { app, dataFolder, seen } = await filling(t)
  let open = (): void => undefined
  seen.gate = {
    work: 'summarize',
    held: new Promise<void>((done) => {
      open = done
    }),
  }
  const id = await addOrder(app, { title: 'Tea', note: 'green' })
  await until(app, 'the work began', () => calls(seen, 'summarize').length === 1)
  await app.write([{ change: 'orders', id, values: { note: 'white' } }], system)
  delete seen.gate
  open()
  await until(
    app,
    'the value is made from the row as it is now',
    async () => (await orderOf(app, id))?.summary === 'Tea: white',
  )
  assert.ok(calls(seen, 'summarize').length >= 2)
  // A row that is removed while its work runs.
  seen.gate = {
    work: 'summarize',
    held: new Promise<void>((done) => {
      open = done
    }),
  }
  const gone = await addOrder(app, { title: 'Cake', note: 'lemon' })
  await until(app, 'the work began', () => calls(seen, 'summarize').some((one) => Object(one.input).title === 'Cake'))
  await app.write([{ remove: 'orders', id: gone }], system)
  delete seen.gate
  open()
  await moment(200)
  assert.equal(await orderOf(app, gone), undefined)
  assert.deepEqual(
    filledRows(dataFolder).filter((one) => one.rowId === gone),
    [],
    'the rows of _t_filled of the removed row are gone',
  )
})

test('[51-12] the work is handed the named columns alone, as the system: a read through db, a call of a query and runs.find inside it are T0013, and a row whose work always fails is failed after tries and left alone', async (t) => {
  const { app, dataFolder, seen } = await filling(t)
  for (const what of ['db', 'query', 'runs', 'fail']) await app.write([{ add: 'probes', values: { what } }], system)
  await until(
    app,
    'every probe failed',
    () => filledRows(dataFolder).filter((one) => one.tableName === 'probes' && one.state === 'failed').length === 4,
    600,
  )
  const errors = Object.fromEntries(
    filledRows(dataFolder)
      .filter((one) => one.tableName === 'probes')
      .map((one) => [String(one.rowId), String(Object(JSON.parse(String(one.error ?? '{}'))).code)]),
  )
  const probes = await app.rows('probes')
  const codeOf = (what: string) => errors[String(probes.find((row) => row.what === what)?.id)]
  assert.deepEqual([codeOf('db'), codeOf('query'), codeOf('runs')], ['T0013', 'T0013', 'T0013'])
  const tried = calls(seen, 'probing').filter((one) => Object(one.input).what === 'fail').length
  assert.equal(tried, 3, 'tried as often as tries allows')
  for (let i = 0; i < 30; i++) {
    app.clock.advance('1 minute')
    await moment(5)
  }
  assert.equal(calls(seen, 'probing').filter((one) => Object(one.input).what === 'fail').length, tried, 'left alone')
})

test('[51-12] with take, two columns that name one work are filled by one call; one filled column that reads another is made after it', async (t) => {
  const { app, seen } = await filling(t)
  const id = await addOrder(app, { title: 'Tea', note: 'green' })
  await until(app, 'the cases are made', async () => (await orderOf(app, id))?.quiet === 'tea: green')
  const order = await orderOf(app, id)
  assert.equal(order?.loud, 'TEA: GREEN')
  assert.equal(calls(seen, 'cases').length, 1, 'the two columns of one work and one input are one call')
})

test('[51-12] a fill starts no flow whose trigger does not name the column, starts one that does, and does not move updatedAt', async (t) => {
  const { app, seen } = await filling(t)
  const id = await addOrder(app, { title: 'Tea', note: 'green' })
  const before = (await orderOf(app, id))?.updatedAt
  await until(app, 'the summary is made', async () => (await orderOf(app, id))?.summary === 'Tea: green')
  await until(app, 'the flow on the summary ran', () => calls(seen, 'onSummary').length > 0)
  assert.equal(calls(seen, 'onAnyChange').length, 0, 'a fill started a flow whose trigger does not name its column')
  assert.deepEqual((await orderOf(app, id))?.updatedAt, before)
})

test('[51-12] perMinute of the by holds the pass to that many, and tent filled shows the counts', async (t) => {
  const { app, dataFolder, seen } = await filling(t)
  for (let n = 1; n <= 5; n++) await app.write([{ add: 'sizes', values: { n } }], system)
  for (let i = 0; i < 20; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  assert.equal(calls(seen, 'doubled').length, 2, 'two in the first minute')
  const filled = app.filled().find((one) => Object(one).table === 'sizes' && Object(one).column === 'double')
  assert.equal(Object(filled).missing, 3)
  const told = Object(await command(app, dataFolder, 'filled', {}))
  assert.ok(Array.isArray(told.columns) && told.columns.some((one: unknown) => Object(one).column === 'double'))
  await until(app, 'every size is made', () => calls(seen, 'doubled').length === 5, 400)
})
