import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, command, readFile } from './desks.ts'
import { current, readersHeld } from './many.ts'
import { listened } from './probe.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const
const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** What the provider of the project was asked, made anew for each test: the test hears each `embed`. */
function seenAnew(t: TestContext): { embeds: { model: string; texts: number }[] } {
  const made: { embeds: { model: string; texts: number }[] } = { embeds: [] }
  listened(t, 'tentjs.test.vectors', (told) => {
    made.embeds.push({
      model: String(Reflect.get(Object(told), 'model')),
      texts: Number(Reflect.get(Object(told), 'texts')),
    })
  })
  return made
}

/** Changes a file of a copy of the project. */
function edited(folder: string, file: string, from: string, to: string): void {
  const path = join(folder, file)
  const text = readFileSync(path, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${from}`)
  writeFileSync(path, text.replace(from, to))
}

// The column of the docs as the project states it.
const docsColumn = "vec: vector({ size: 3, model: embedderA, optional: true, by: 'body' }),"

/** The app of a copy of the project of vectors, and what builds a change of it and has the app run it. */
async function vectors(t: TestContext, before?: (folder: string) => void) {
  const seen = seenAnew(t)
  const folder = copyOf(t, 'vectors')
  before?.(folder)
  const { app, dataFolder } = await appIn(t, folder)
  let n = 0
  const switched = async (from: string, to: string): Promise<void> => {
    edited(folder, 'tables.ts', from, to)
    n += 1
    const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${n}`) })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error').map((one) => one.message),
      [],
    )
    await app.switch(await app.add(built.bundleFolder))
  }
  return { app, dataFolder, seen, switched }
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

/**
 * The vectors of the rows of a table, as the shared file holds them now, in the order of the rows: each as its
 * numbers joined by commas, or null where it is empty. A vector stands in a table of its own, by the row's number.
 */
const vectorsOf = async (dataFolder: string, table: string): Promise<(string | null)[]> =>
  readFile(
    join(dataFolder, 'data.db'),
    `SELECT v."v" AS "v" FROM "${table}" t LEFT JOIN "${table}__vec" v ON v."_n" = t."_n" ORDER BY t."_n"`,
  ).map((row) => (row.v instanceof Uint8Array ? [...new Float32Array(Uint8Array.from(row.v).buffer)].join(',') : null))

async function addRows(app: TestApp, table: string, count: number): Promise<void> {
  await app.write(
    Array.from({ length: count }, (_, i) => ({ add: table, values: { body: `${table} ${i}` } })),
    system,
  )
}

/** The rows of the counts, by the shared file. */
const countRows = (dataFolder: string): Record<string, unknown>[] =>
  readFile(join(dataFolder, 'data.db'), 'SELECT * FROM "_t_counts"')

const amount = (dataFolder: string, name: string, caller: string, unit: string): number =>
  countRows(dataFolder)
    .filter((row) => row.name === name && row.caller === caller && row.unit === unit)
    .reduce((sum, row) => sum + Number(row.amount), 0)

test('[51-14] a vector column that states its model is filled from the column it names, 32 rows to one embed', async (t) => {
  const { app, dataFolder, seen } = await vectors(t)
  await addRows(app, 'docs', 70)
  await until(app, 'every vector is made', async () =>
    (await vectorsOf(dataFolder, 'docs')).every((one) => one === '1,0,0'),
  )
  // The rows become due a moment apart, as the clock of a test app runs: each call takes what is due, 32 at the most.
  const sizes = seen.embeds.map((one) => one.texts)
  assert.ok(
    seen.embeds.every((one) => one.model === 'a-1'),
    'the model of the column made them',
  )
  assert.equal(
    sizes.reduce((sum, one) => sum + one, 0),
    70,
    'each row was handed once',
  )
  assert.ok(Math.max(...sizes) === 32, JSON.stringify(sizes))
  assert.ok(sizes.filter((one) => one === 32).length >= 2, JSON.stringify(sizes))
})

test('[51-14] a change of the model of a vector column is refused with T2001 where it states no old, and with old drop it is emptied in the switch and filled anew, never holding the vectors of two models', async (t) => {
  const { app, dataFolder, switched } = await vectors(t)
  await addRows(app, 'docs', 40)
  await until(app, 'every vector is made', async () =>
    (await vectorsOf(dataFolder, 'docs')).every((one) => one === '1,0,0'),
  )
  await assert.rejects(switched(docsColumn, docsColumn.replace('embedderA', 'embedderB')), { code: 'T2001' })
  await switched(
    docsColumn.replace('embedderA', 'embedderB'),
    docsColumn.replace('embedderA', 'embedderB').replace('optional: true', "optional: true, old: 'drop'"),
  )
  assert.ok(
    (await vectorsOf(dataFolder, 'docs')).every((one) => one === null),
    'emptied in the switch',
  )
  for (let i = 0; i < 300; i++) {
    const now = await vectorsOf(dataFolder, 'docs')
    assert.ok(!now.includes('1,0,0'), 'no vector of the old model stands beside one of the new')
    if (now.every((one) => one === '0,1,0')) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail('never: every vector is made anew')
})

test('[51-14] what a fill used is counted under the starter of its column, and perDay of its by holds that column alone; a fill that the limit refused stays due, is not counted in tries, and is made the next day', async (t) => {
  const { app, dataFolder } = await vectors(t, (folder) =>
    edited(
      folder,
      'tables.ts',
      docsColumn,
      "vec: vector({ size: 3, model: embedderA, optional: true, by: { columns: ['body'], batch: 3, limits: { perDay: { calls: 1 } } } }),",
    ),
  )
  await addRows(app, 'docs', 5)
  await addRows(app, 'notes', 5)
  await until(app, 'the notes are made', async () =>
    (await vectorsOf(dataFolder, 'notes')).every((one) => one !== null),
  )
  await until(app, 'docs are made', async () => (await vectorsOf(dataFolder, 'docs')).some(Boolean))
  for (let i = 0; i < 30; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  // The one call of the day takes the docs that were due then, three at the most: the rest wait for the next day.
  const made = (await vectorsOf(dataFolder, 'docs')).filter(Boolean).length
  assert.ok(made >= 1 && made <= 3, `${made} docs were made`)
  assert.equal(
    amount(dataFolder, 'embedderA', 'system:fill:docs.vec', 'calls'),
    1,
    'the limit of the day holds the docs',
  )
  assert.ok(amount(dataFolder, 'embedderA', 'system:fill:notes.vec', 'calls') >= 1, 'and not the notes')
  const held = readFile(
    join(dataFolder, 'data.db'),
    `SELECT * FROM "_t_filled" WHERE "tableName" = 'docs' AND "state" = 'due'`,
  )
  assert.equal(held.length, 5 - made)
  assert.ok(
    held.every((row) => Number(row.tries) === 0),
    'a limit is no try',
  )
  // The one call of the next day takes three more, as far as there are, and the day after takes the rest.
  const madeNow = async (): Promise<number> => (await vectorsOf(dataFolder, 'docs')).filter(Boolean).length
  const next = Math.min(5, made + 3)
  app.clock.advance('1 day')
  await until(app, 'the docs are made the next day', async () => (await madeNow()) === next)
  for (let i = 0; i < 30; i++) {
    app.clock.advance('1 second')
    await moment()
  }
  assert.equal(await madeNow(), next, 'the limit of the next day holds the docs too')
  app.clock.advance('1 day')
  await until(app, 'the rest of the docs are made the day after', async () =>
    (await vectorsOf(dataFolder, 'docs')).every((one) => one !== null),
  )
})

test('[51-14] tent filled shows the limit of a by, or that it has none', async (t) => {
  const { app, dataFolder } = await vectors(t, (folder) =>
    edited(
      folder,
      'tables.ts',
      docsColumn,
      "vec: vector({ size: 3, model: embedderA, optional: true, by: { columns: ['body'], limits: { perDay: { calls: 10 } } } }),",
    ),
  )
  const told = Object(await command(app, dataFolder, 'filled', {}))
  const columns: Record<string, unknown>[] = Array.isArray(told.columns) ? told.columns : []
  const of = (table: string) => columns.find((one) => one.table === table && one.column === 'vec')
  assert.deepEqual(of('docs')?.limits, { perDay: { calls: 10 } })
  assert.equal(of('notes')?.limits, 'none')
})

test(
  '[51-14] a reader that carried out an action which states changes false sends what its model call used, and the writer counts it',
  readersHeld,
  async (t) => {
    const { app, dataFolder } = await vectors(t)
    const near = await app.reader()
    await current(app, near)
    assert.equal(await near.call('greet', undefined, { as: { kind: 'system' } }), 'Hello.')
    await until(
      app,
      'the writer counted the call of the reader',
      () => amount(dataFolder, 'thinker', 'system', 'calls') === 1,
    )
    assert.equal(amount(dataFolder, 'thinker', 'system', 'tokensOut'), 2)
  },
)
