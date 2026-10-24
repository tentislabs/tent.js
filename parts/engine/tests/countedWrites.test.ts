import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import type { App } from '../index.ts'
import { counts } from '../index.ts'
import { bundled, send, workFolder } from './apps.ts'
import { counting } from './countingApps.ts'
import { current, placeTold, rawLink, readerIn, until, worldOf, writerIn } from './machines.ts'
import { rowsIn } from './modeling.ts'

/** The sum of one unit of one thing over the counts of an app, read as a program reads them, by the day it names. */
async function summed(app: App | TestApp, name: string, unit: string, day?: string): Promise<number> {
  const rows: unknown = await app.read(counts.where({}), { as: 'system' })
  return (Array.isArray(rows) ? rows : [])
    .filter((one) => Object(one).name === name && Object(one).unit === unit)
    .filter((one) => day === undefined || new Date(Object(one).day).toISOString().startsWith(day))
    .reduce((all: number, one) => all + Number(Object(one).amount), 0)
}

/** Takes the models and the agent out of the project of the counts: a world of machines makes no provider. */
const modelless = (description: Description): void => {
  for (const name of ['writer', 'shipping']) delete description.models[name]
  delete description.flows.helper
}

/** A test app of the shop of the counts, in a folder of the test. */
async function shop(t: test.TestContext): Promise<TestApp> {
  const folder = join(workFolder(t), 'shop')
  cpSync(join(import.meta.dirname, 'countedShop'), folder, { recursive: true })
  const app = await testApp({ folder })
  t.after(() => app.close())
  return app
}

test('[21-22] the counts are written within countEvery and when the app closes', async (t) => {
  const { app, advance, dataFolder } = await counting(t)
  await app.call('listNotes', {}, { as: { kind: 'system' } })
  assert.equal(await summed(app, 'listNotes', 'calls'), 0, 'gathered, and not written yet')
  advance(59_000)
  assert.equal(await summed(app, 'listNotes', 'calls'), 0)
  advance(1000)
  assert.equal(await summed(app, 'listNotes', 'calls'), 1, 'written within one countEvery')
  await app.call('listNotes', {}, { as: { kind: 'system' } })
  await app.close()
  const [written] = rowsIn(
    dataFolder,
    'data.db',
    "SELECT SUM(amount) AS n FROM _t_counts WHERE name = 'listNotes' AND unit = 'calls'",
  )
  assert.equal(written?.n, 2, 'written when the app closed')
})

test('[21-22] a program that is killed has lost no more than one countEvery, and no count is over', async (t) => {
  const app = await shop(t)
  const ada = await app.user({ name: 'Ada', roles: [] })
  for (let n = 0; n < 3; n++) await app.as(ada).call('listNotes', {})
  app.clock.advance('1 minute')
  for (let n = 0; n < 2; n++) await app.as(ada).call('listNotes', {})
  await app.kill()
  await app.restart()
  const kept = await summed(app, 'listNotes', 'calls')
  assert.ok(kept >= 3 && kept <= 5, `between the written and the made, and not ${kept}`)
  assert.equal(kept, 3, 'what was gathered since the last write is lost')
})

test('[21-22] after a day has ended and one countEvery has passed, no sum of that day changes, also after two people who used the app that day were removed', async (t) => {
  const { app, advance, origin, dataFolder } = await counting(t, {
    change: (description) => Object.assign(description.project, { countBy: 'caller' }),
  })
  const person = async (name: string): Promise<{ kind: 'user'; user: { id: string; roles: string[] } }> => {
    const [made] = Object(await app.write([{ add: 'users', values: { name, roles: [] } }], { as: 'system' }))
    return { kind: 'user', user: { id: String(made.id), roles: [] } }
  }
  const ada = await person('Ada')
  const bo = await person('Bo')
  // The clock of the test stands at the start of a day in UTC: to two minutes before its end.
  advance(86_400_000 - 120_000)
  const day = '2031-01-01'
  await app.call('listNotes', {}, { as: ada })
  await app.call('listNotes', {}, { as: bo })
  await app.call('listNotes', {}, { as: bo })
  advance(60_000)
  const before = await summed(app, 'listNotes', 'calls', day)
  assert.equal(before, 3)
  // The day ends, one countEvery passes, the app is used, and both are removed.
  advance(180_000)
  await app.call('listNotes', {}, { as: ada })
  advance(60_000)
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  for (const who of [ada, bo]) {
    const answered = await send(app, `${origin}/_t/admin/data`, {
      body: JSON.stringify({ args: { what: 'user', do: 'remove', id: who.user.id, yes: true } }),
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
  }
  assert.equal(await summed(app, 'listNotes', 'calls', day), before)
  const rows: unknown = await app.read(counts.where({}), { as: 'system' })
  assert.ok(
    (Array.isArray(rows) ? rows : []).every((one) => !String(Object(one).caller).startsWith('user:')),
    'the rows that named them are joined into rows of removed',
  )
})

test('[21-22] a reader counts by what its writer was opened with, and its batch is booked to the day it arrives', async (t) => {
  const world = worldOf(t)
  const bundle = await bundled(t, { project: 'counting', change: modelless }, world.work)
  const engine = world.engine()
  const writer = await engine.open(bundle.folder, {
    dataFolder: join(world.work, 'writer'),
    mode: 'test',
    address: '*',
    own: 'https://writer.test',
    readers: ['n'.repeat(40)],
    countBy: 'caller',
  })
  world.apps['https://writer.test'] = writer
  const near = await readerIn(world, 'near')
  await current(world, near)
  const ada = { kind: 'user' as const, user: { id: 'ada', roles: [] } }
  await near.call('listNotes', {}, { as: ada })
  await near.call('listNotes', {}, { as: ada })
  // The batch goes once one countEvery has passed, and is booked by the writer to the day it arrives.
  for (let step = 0; step < 30 && (await summed(writer, 'listNotes', 'calls')) === 0; step++) await world.beat(10)
  const arrived = new Date(world.clock.clock.now()).toISOString().slice(0, 10)
  const rows: unknown = await writer.read(counts.where({ name: 'listNotes', unit: 'calls' }), { as: 'system' })
  const listed = Array.isArray(rows) ? rows : []
  assert.deepEqual(
    listed.map((one) => [Object(one).caller, Object(one).amount, new Date(Object(one).day).toISOString().slice(0, 10)]),
    [['user:ada', 2, arrived]],
  )
})

test('[21-22] a batch that is sent twice is counted once, also after another machine took over as writer, and a reader that was started again is counted from its first new batch on', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, { project: 'counting', change: modelless }, world.work))
  const near = await readerIn(world, 'near')
  await current(world, near)
  const raw = rawLink(app, 'o'.repeat(40))
  raw.link.send(placeTold(app, 'machine-raw'))
  await until('the raw reader was taken', () => raw.got.some((one) => one.t === 'go'))
  const batch = (start: number, n: number): string =>
    JSON.stringify({
      t: 'counted',
      start,
      n,
      used: [{ name: 'listNotes', answeredBy: '', caller: '', units: { calls: 1 } }],
    })
  raw.link.send(batch(1000, 1))
  raw.link.send(batch(1000, 1))
  await world.beat(2)
  assert.equal(await summed(app, 'listNotes', 'calls'), 1)
  // Started again, the reader's numbers begin anew with its new start.
  raw.link.send(batch(2000, 1))
  await world.beat(2)
  assert.equal(await summed(app, 'listNotes', 'calls'), 2)
  // The near reader holds the kept numbers, takes over, and drops what was written already.
  await current(world, near)
  world.apps['https://writer.test'] = undefined
  raw.link.close()
  await app.close()
  await world.beat(7)
  await near.takeOver()
  const again = rawLink(near, 'o'.repeat(40))
  again.link.send(placeTold(near, 'machine-raw'))
  await until('the raw reader was taken by the new writer', () => again.got.some((one) => one.t === 'go'))
  again.link.send(batch(2000, 1))
  again.link.send(batch(2000, 2))
  await world.beat(2)
  assert.equal(await summed(near, 'listNotes', 'calls'), 3)
})
