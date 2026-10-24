import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { logRows, system } from './apps.ts'
import { flowing, marksOf, settle, untilWithin } from './flowing.ts'
import { notDropped } from './started.ts'

const project = 'pacingRows'

/** Adds a row to a table of the project, and answers its id. */
async function added(app: App, table: string, name: string, rank?: number): Promise<string> {
  // Each table has a change that adds to it, named after what its rows start.
  const adding: Record<string, string> = {
    throttledRows: 'addThrottled',
    droppedRows: 'addDropped',
    batchedRows: 'addBatched',
    rankedRows: 'addRanked',
  }
  const row = await app.call(adding[table], { name, ...(rank === undefined ? {} : { rank }) }, { as: system })
  return String(Object(row).id)
}

/** Changes the name of a row, which is a change that its table trigger fires on. */
const renamed = (app: App, table: string, id: string, name: string): Promise<unknown> =>
  app.call('renameRow', { table, id, name }, { as: system })

/** The marks that begin with a word, sorted. */
const marked = async (app: App, word: string): Promise<string[]> =>
  (await marksOf(app)).filter((one) => one.startsWith(`${word} `)).sort()

test('[46-3] on a table trigger with no key, `perMinute` lets two runs a minute start for each row, and the rest of a row wait their turn', async (t) => {
  const { app, advance } = await flowing(t, { project })
  const [one, two] = [await added(app, 'throttledRows', 'one'), await added(app, 'throttledRows', 'two')]
  for (const n of [1, 2, 3]) await renamed(app, 'throttledRows', one, `one ${n}`)
  for (const n of [1, 2]) await renamed(app, 'throttledRows', two, `two ${n}`)
  await untilWithin(async () => (await marked(app, 'throttled')).length === 4, 'two runs of each row went')
  assert.deepEqual(await marked(app, 'throttled'), [
    'throttled one 1',
    'throttled one 2',
    'throttled two 1',
    'throttled two 2',
  ])
  await settle()
  assert.equal((await marked(app, 'throttled')).length, 4, 'the third change of the first row waits its turn')
  advance(60_000)
  await untilWithin(async () => (await marked(app, 'throttled')).includes('throttled one 3'), 'it went a minute later')
})

test('[46-3] on a table trigger with no key, `drop` lets one run an hour start for each row, and each drop is a line of the log', async (t) => {
  const { app, dataFolder } = await flowing(t, { project })
  const [one, two] = [await added(app, 'droppedRows', 'one'), await added(app, 'droppedRows', 'two')]
  for (const n of [1, 2, 3]) await renamed(app, 'droppedRows', one, `one ${n}`)
  await renamed(app, 'droppedRows', two, 'two 1')
  await untilWithin(async () => (await marked(app, 'dropped')).length === 2, 'one run of each row went')
  await settle()
  assert.deepEqual(await marked(app, 'dropped'), ['dropped one 1', 'dropped two 1'])
  assert.equal(app.runs.find({ flow: 'droppedRow' }).length, 2, 'a dropped start leaves no run')
  const drops = logRows(dataFolder, 'lines').filter((row) => String(row.message).includes('dropped'))
  assert.equal(drops.length, 2, 'each drop is a line of the log')
  assert.match(String(drops[0].data), new RegExp(one))
})

test('[46-3] on a table trigger with no key, `batch` gathers the starts of each row into one run, which is handed their events', async (t) => {
  const { app, advance } = await flowing(t, { project })
  const [one, two] = [await added(app, 'batchedRows', 'one'), await added(app, 'batchedRows', 'two')]
  await renamed(app, 'batchedRows', one, 'one 1')
  await renamed(app, 'batchedRows', two, 'two 1')
  await renamed(app, 'batchedRows', one, 'one 2')
  await untilWithin(async () => (await marked(app, 'batched')).length === 1, 'the batch of the first row is full')
  assert.deepEqual(await marked(app, 'batched'), ['batched one 1 one 2'], 'the second row is a batch of its own')
  advance(10_000)
  await untilWithin(
    async () => (await marked(app, 'batched')).length === 2,
    'the batch of the second row waited ten seconds',
  )
  assert.deepEqual(await marked(app, 'batched'), ['batched one 1 one 2', 'batched two 1'])
})

test('[46-3] on a table trigger with no key, `order` and `turns` order the starts that wait: the higher first, and of equals each row in turn', async (t) => {
  const { app } = await flowing(t, { project })
  const holder = await added(app, 'rankedRows', 'start', 0)
  await renamed(app, 'rankedRows', holder, 'holder')
  await untilWithin(() => app.runs.find({ flow: 'rankedRow' })[0]?.steps[0]?.state === 'started', 'the holder works')
  const [one, two, three] = [
    await added(app, 'rankedRows', 'r1', 1),
    await added(app, 'rankedRows', 'r2', 1),
    await added(app, 'rankedRows', 'r3', 9),
  ]
  await renamed(app, 'rankedRows', one, 'one first')
  await renamed(app, 'rankedRows', one, 'one second')
  await renamed(app, 'rankedRows', two, 'two first')
  await renamed(app, 'rankedRows', three, 'three first')
  await settle()
  await app.call('addMark', { what: 'go holder' }, { as: system })
  await untilWithin(
    async () => (await marksOf(app)).filter((one) => one.startsWith('ranked ')).length === 4,
    'all went',
  )
  assert.deepEqual(
    (await marksOf(app)).filter((one) => one.startsWith('ranked ')),
    ['ranked three first', 'ranked one first', 'ranked two first', 'ranked one second'],
  )
})

test('[46-3] a start that `drop` dropped answers `{ dropped: true }` and no run, from `start`, from a call of the flow, and from a step', async (t) => {
  const { app } = await flowing(t, { project })
  const started: unknown = await app.call('startOnceTwice', {}, { as: system })
  assert.ok(Array.isArray(started))
  assert.ok(typeof Object(started[0]).run === 'string', 'the first start is a run')
  assert.deepEqual(started[1], { dropped: true })
  assert.deepEqual(
    await app.call('callOnce', {}, { as: system }),
    { dropped: true },
    'a call is answered so, and waits for nothing',
  )
  const run = notDropped(await app.start('startsInStep', undefined, { as: system })).run
  assert.ok(run)
  assert.deepEqual(
    await app.runs.wait(String(run)),
    [{ dropped: true }, { dropped: true }],
    'a step is held to the pace as any start is',
  )
  assert.equal(app.runs.find({ flow: 'once' }).length, 1)
})
