import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App, Provider, ReplyPart } from '../index.ts'
import { bundled, codeOf, engineOf, running, system } from './apps.ts'
import { current, readerIn, worldOf } from './machines.ts'
import { cookieOf, untilTried, watcher } from './watching.ts'

/** A provider of the tests that answers every call with a few tokens. */
const mine: Provider = {
  async *reply(): AsyncGenerator<ReplyPart> {
    yield { text: 'Hello.' }
    yield { end: { text: 'Hello.', calls: [], units: { tokensIn: 4, tokensOut: 2 } } }
  },
}

/** The app of the counts as a table, with the provider of the tests. */
const shown = (t: test.TestContext) =>
  running(t, { project: 'shownCounts', engine: { makers: { providers: () => ({ mine }) } } })

/** Adds a user, and answers the caller that is that user. */
async function person(app: App, name: string): Promise<Caller> {
  const [made] = Object(await app.write([{ add: 'users', values: { name, roles: [] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(made.id), roles: [] } }
}

/** The sums of a caller's own use of the model, by unit, as the query of the app answers them. */
async function useOf(app: App, who: Caller): Promise<Record<string, number>> {
  const rows: unknown = await app.call('myUse', {}, { as: who })
  return Object.fromEntries(
    (Array.isArray(rows) ? rows : []).map((one) => [String(Object(one).unit), Number(Object(one).amount)]),
  )
}

test("[26-9] a query over a table that states shows: 'counts' answers one row for each unit, with its id, and a group sums them", async (t) => {
  const { app } = await shown(t)
  const ada = await person(app, 'Ada')
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  await app.call('ask', { words: 'Hi again.' }, { as: ada })
  const rows: unknown = await app.call('myRows', {}, { as: ada })
  const listed = Array.isArray(rows) ? rows : []
  assert.deepEqual(listed.map((one) => String(Object(one).unit)).sort(), ['calls', 'tokensIn', 'tokensOut'])
  assert.ok(listed.every((one) => typeof Object(one).id === 'string' && Object(one).id.length > 0))
  assert.deepEqual(await useOf(app, ada), { calls: 2, tokensIn: 8, tokensOut: 4 })
})

test("[26-9] with read: 'owner' a user is answered the rows of their own use and of a key made for them, a visitor those of their visitor id, and a caller who has none nothing", async (t) => {
  const { app } = await shown(t)
  const ada = await person(app, 'Ada')
  const bo = await person(app, 'Bo')
  const key: Caller = {
    kind: 'key',
    key: { id: 'k1', scopes: [], roles: [] },
    user: { id: String(ada.user?.id), roles: [] },
  }
  const visitor: Caller = { kind: 'nobody', visitor: 'visitor-one' }
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  await app.call('ask', { words: 'Hi.' }, { as: key })
  await app.call('ask', { words: 'Hi.' }, { as: visitor })
  await app.call('ask', { words: 'Hi.' }, { as: bo })
  assert.equal((await useOf(app, ada)).calls, 2, 'their own, and the key that was made for them')
  assert.equal((await useOf(app, bo)).calls, 1)
  assert.equal((await useOf(app, visitor)).calls, 1)
  assert.deepEqual(await useOf(app, { kind: 'nobody', visitor: 'another' }), {})
  assert.deepEqual(await useOf(app, { kind: 'nobody' }), {})
})

test('[26-9] a write to it, search and history on it are T2016 while running, and no name reads the counts but the table', async (t) => {
  const { app } = await shown(t)
  const ada = await person(app, 'Ada')
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  assert.equal(await codeOf(Promise.resolve().then(() => app.call('written', { unit: 'calls' }, { as: ada }))), 'T2016')
  assert.equal(await codeOf(Promise.resolve().then(() => app.call('searched', {}, { as: ada }))), 'T2016')
  assert.equal(await codeOf(app.read({ from: 'usage', history: true, id: 'x' }, { as: system })), 'T2016')
  // The engine's own table is read by the system alone, as a program reads it.
  assert.equal(await codeOf(app.read({ from: '_t_counts' }, { as: ada })), 'T0013')
})

test('[26-9] a live query over it is sent the new sum after a model call, on a reader too', async (t) => {
  const { app, origin } = await shown(t)
  const ada = await person(app, 'Ada')
  const page = watcher(app, origin, {
    cookie: cookieOf(app, String(ada.user?.id)),
    as: String(ada.user?.id),
  })
  const first = await page.watch('w1', 'myUse')
  // Nothing is counted yet: the first answer holds no row.
  assert.deepEqual([first.t, first.value], ['result', []])
  await app.call('ask', { words: 'Hi.' }, { as: ada })
  await untilTried('the new sum was sent', () => JSON.stringify(page.got.slice(1)).includes('"calls"'))
  page.close()
  // On a reader, the write of the counts arrives as every write does.
  const world = worldOf(t)
  // Here the counts of calls are open to every caller, so that a page of the reader watches them as nobody.
  const bundle = await bundled(
    t,
    {
      project: 'shownCounts',
      change: (description) =>
        Object.assign(description.tables.usage, {
          access: { read: { rule: 'where', filter: { col: 'unit', is: 'calls' } } },
        }),
    },
    world.work,
  )
  const engine = engineOf(t, { makers: { clock: () => world.clock.clock, providers: () => ({ mine }) } })
  const writer = await engine.open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: 'https://writer.test',
    readers: ['n'.repeat(40)],
  })
  world.apps['https://writer.test'] = writer
  const near = await readerIn(
    world,
    'near',
    engineOf(t, { makers: { clock: () => world.clock.clock, providers: () => ({ mine }) } }),
  )
  await current(world, near)
  const bo = await person(writer, 'Bo')
  await current(world, near)
  const read = watcher(near, 'https://near.test')
  await read.watch('w1', 'myUse')
  await writer.call('ask', { words: 'Hi.' }, { as: bo })
  for (let step = 0; step < 40 && !JSON.stringify(read.got).includes('"calls"'); step++) await world.beat(1)
  assert.ok(JSON.stringify(read.got).includes('"calls"'), JSON.stringify(read.got).slice(0, 400))
  read.close()
})
