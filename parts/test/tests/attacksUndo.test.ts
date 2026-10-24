import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// What the attacks add to the notebook: runs that write in other ways, a raw write, and an undo with no `system`.
const more = `
export const addThenDrop = flow('addThenDrop', {
  input: {},
  run: async ({ step }) => {
    const added = await step('add', () => addNote({ title: 'Brief' }))
    await step('drop', () => dropNote({ note: String(Reflect.get(Object(added), 'id')) }))
  },
})

export const addTagged = flow('addTagged', {
  input: {},
  run: async ({ step }) => {
    await step('add', async () => {
      const note = await addNote({ title: 'Tagged by the run' })
      await tagNote({ note: String(Reflect.get(Object(note), 'id')), word: 'run' })
    })
  },
})

export const renameOne = flow('renameOne', {
  input: { note: text(), title: text() },
  run: async ({ input: given, step }) => step('rename', () => setNote({ note: given.note, title: given.title })),
})

export const rawRename = change('rawRename', {
  access: 'signedIn',
  system: 'a test writes with raw SQL',
  touches: ['notes'],
  input: { note: text(), title: text() },
  run: ({ db, input: given }) => {
    db.sql('UPDATE "notes" SET "title" = ? WHERE "_n" = ?', [given.title, db.n('notes', given.note)])
  },
})

export const undoFromAPage = action('undoFromAPage', {
  access: 'signedIn',
  input: { run: text() },
  output: json(),
  run: async ({ input: given }) => undo.run(given.run),
})
`

/** The notebook with the runs of the attacks, a person who writes in it, and three notes of theirs. */
async function notebook(t: TestContext) {
  const folder = copyOf(t, 'undone')
  appendFileSync(join(folder, 'functions', 'functions.ts'), more)
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const ada = await app.user({ name: 'Ada', roles: [] })
  const as = { as: ada }
  const ids: string[] = []
  for (const title of ['first', 'second', 'third'])
    ids.push(String(Reflect.get(Object(await app.call('addNote', { title }, as)), 'id')))
  return { app, ada, as, ids }
}

const ended = async (app: TestApp, flow: string, input: Record<string, unknown>): Promise<string> => {
  const started = await app.start(flow, input, system)
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await app.runs.wait(run)
  return run
}

const clashesOf = (value: unknown): Record<string, unknown>[] => {
  const clashes: unknown = Reflect.get(Object(value), 'clashes')
  return Array.isArray(clashes) ? clashes.map((one) => Object(one)) : []
}

const titleOf = async (app: TestApp, id: string): Promise<unknown> =>
  Reflect.get(Object(await app.read({ from: 'notes', one: 'get', id }, system)), 'title')

test('[45-19.14] an undo leaves a row that another person set or removed after the run, and names it', async (t) => {
  const { app, as, ids } = await notebook(t)
  const run = await ended(app, 'tidy', { rename: ids[0], finish: ids[1], drop: ids[2] })
  await app.call('setNote', { note: ids[0], title: 'Ada after the run' }, as)
  await app.call('dropNote', { note: ids[1] }, as)
  const answer = await app.call('undoRun', { run }, system)
  assert.equal(await titleOf(app, ids[0]), 'Ada after the run', 'what Ada set stands')
  assert.equal(
    await app.read({ from: 'notes', one: 'get', id: ids[1] }, system),
    undefined,
    'what Ada removed stays removed',
  )
  const named = clashesOf(answer).map((one) => one.id)
  assert.ok(named.includes(ids[0]) && named.includes(ids[1]), 'both are named in clashes')
})

test('[45-19.14] an undo leaves a row that another person wrote by a raw write after the run, and names it', async (t) => {
  const { app, as, ids } = await notebook(t)
  const run = await ended(app, 'renameOne', { note: ids[0], title: 'By the run' })
  await app.call('rawRename', { note: ids[0], title: 'Ada by a raw write' }, as)
  const answer = await app.call('undoRun', { run }, system)
  assert.equal(await titleOf(app, ids[0]), 'Ada by a raw write', 'a raw write made since is never overwritten')
  assert.ok(clashesOf(answer).length > 0, 'it is named in clashes')
})

test('[45-19.14] an undo of one run takes back nothing that another run wrote', async (t) => {
  const { app, ids } = await notebook(t)
  const first = await ended(app, 'renameOne', { note: ids[0], title: 'By the first run' })
  await ended(app, 'renameOne', { note: ids[1], title: 'By the second run' })
  await app.call('undoRun', { run: first }, system)
  assert.equal(await titleOf(app, ids[0]), 'first')
  assert.equal(await titleOf(app, ids[1]), 'By the second run')
})

test('[45-19.15] undo is refused to code with no full access, and to a person who calls the builder action', async (t) => {
  const { app, as, ids } = await notebook(t)
  const run = await ended(app, 'renameOne', { note: ids[0], title: 'By the run' })
  await assert.rejects(app.call('undoFromAPage', { run }, as), { code: 'T0013' })
  await assert.rejects(app.call('undoRun', { run }, as))
  assert.equal(await titleOf(app, ids[0]), 'By the run', 'nothing was taken back')
})

test('[45-17] a row that the run added and then removed is not there after the undo', async (t) => {
  const { app } = await notebook(t)
  const run = await ended(app, 'addThenDrop', {})
  await app.call('undoRun', { run }, system)
  const rows: unknown = await app.read({ from: 'notes', where: { col: 'title', is: 'Brief' } }, system)
  assert.deepEqual(rows, [], 'the rows stand as before the run')
})

test('[45-17] a row the run added that only a row of the same run links to is taken back with it', async (t) => {
  const { app } = await notebook(t)
  const run = await ended(app, 'addTagged', {})
  const answer = await app.call('undoRun', { run }, system)
  assert.deepEqual(clashesOf(answer), [], 'no row of anyone else links to it')
  const rows: unknown = await app.read({ from: 'notes', where: { col: 'title', is: 'Tagged by the run' } }, system)
  assert.deepEqual(rows, [], 'the rows stand as before the run')
})

/** The app of kept counts, with a run that adds an order, and an undo. */
async function counting(t: TestContext) {
  const folder = copyOf(t, 'counted')
  const functions = join(folder, 'functions', 'functions.ts')
  writeFileSync(
    functions,
    readFileSync(functions, 'utf8')
      .replace(/^import \{/, 'import { action, flow, json, undo,')
      .concat(`
export const orderByRun = flow('orderByRun', {
  input: { customer: text() },
  run: async ({ input: given, step }) => step('add', () => addOrder({ customer: given.customer, total: 5, status: 'open' })),
})

export const undoRun = action('undoRun', {
  access: 'nobody',
  system: 'undo writes what the run wrote',
  input: { run: text() },
  output: json(),
  run: async ({ input: given }) => undo.run(given.run),
})
`),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

test('[45-17] a kept count stands equal to its rows after an undo that left a clash', async (t) => {
  const app = await counting(t)
  const customer = String(Reflect.get(Object(await app.call('addCustomer', { name: 'Ada' }, system)), 'id'))
  const started = await app.start('orderByRun', { customer }, system)
  assert.ok('run' in started, 'the start was not dropped')
  const { run } = started
  await app.runs.wait(run)
  // Someone else orders for the same customer after the run, which writes the customer's count again.
  await app.call('addOrder', { customer, total: 7, status: 'open' }, system)
  await app.call('undoRun', { run }, system)
  const open: unknown = await app.read(
    {
      from: 'orders',
      where: {
        all: [
          { col: 'customer', is: customer },
          { col: 'status', is: 'open' },
        ],
      },
    },
    system,
  )
  const held = Reflect.get(
    Object(await app.read({ from: 'customers', one: 'get', id: customer }, system)),
    'openOrders',
  )
  assert.equal(held, Array.isArray(open) ? open.length : -1, 'the kept count never drifts')
})
