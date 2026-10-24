import assert from 'node:assert/strict'
import test from 'node:test'
import { describe, describing } from '../../core/internal.ts'
import { query } from '../../core/index.ts'
import { userOf } from './apps.ts'
import { counting } from './countingApps.ts'
import { notDropped } from './started.ts'

const ada = userOf('ada')
const bo = userOf('bo')

test('[21-22] a request that the door refused at its first steps, one for a name that is no function, and one for the health of the app are counted under door', async (t) => {
  const { app, origin, counted, sum } = await counting(t)
  const refused = await app.request(
    new Request(`${origin}/_t/call/listNotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://elsewhere.example' },
      body: '{"input":{}}',
    }),
  )
  assert.equal(refused.status, 403)
  await refused.text()
  const unknown = await app.request(
    new Request(`${origin}/_t/call/noSuchThing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":{}}',
    }),
  )
  assert.equal(unknown.status, 404)
  await unknown.text()
  const health = await app.request(new Request(`${origin}/_t/health`))
  await health.text()
  const rows = await counted()
  assert.equal(sum(rows, 'door', 'calls'), 3)
  assert.equal(sum(rows, 'door', 'failed'), 2)
  assert.ok(sum(rows, 'door', 'bytesIn') > 0)
  assert.ok(sum(rows, 'door', 'bytesOut') > 0)
  // A name that a caller sent makes no row of its own.
  assert.equal(
    rows.some((one) => one.name === 'noSuchThing'),
    false,
  )
  assert.equal(sum(rows, 'listNotes', 'calls'), 0)
})

test("[21-22] with countBy left out the caller is empty; with 'caller' on the project there is a row for each caller and none for the whole", async (t) => {
  const apart = await counting(t)
  await apart.app.call('listNotes', {}, { as: ada })
  await apart.app.call('listNotes', {}, { as: bo })
  const whole = await apart.counted()
  assert.deepEqual(
    whole.filter((one) => one.name === 'listNotes' && one.unit === 'calls').map((one) => [one.caller, one.amount]),
    [['', 2]],
  )
  const byCaller = await counting(t, {
    change: (description) => Object.assign(description.project, { countBy: 'caller' }),
  })
  await byCaller.app.call('listNotes', {}, { as: ada })
  await byCaller.app.call('listNotes', {}, { as: bo })
  await byCaller.app.call('listNotes', {}, { as: bo })
  const rows = await byCaller.counted()
  assert.deepEqual(
    rows
      .filter((one) => one.name === 'listNotes' && one.unit === 'calls')
      .map((one) => [one.caller, one.user, one.amount])
      .sort(),
    [
      ['user:ada', 'ada', 1],
      ['user:bo', 'bo', 2],
    ],
  )
})

test("[21-22] 'caller' on one function or on one flow counts that one by caller and the rest for the whole; with 'limits' only the models are counted", async (t) => {
  const one = await counting(t, {
    change: (description) => {
      Object.assign(Object(description.functions.addNote), { countBy: 'caller' })
      Object.assign(Object(description.flows.tidy), { countBy: 'caller' })
    },
  })
  // A run is started by a user who is there.
  const [made] = Object(await one.app.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' }))
  const ida = userOf(String(made.id))
  await one.app.call('addNote', { title: 'A note' }, { as: ida })
  await one.app.call('listNotes', {}, { as: ida })
  const run = notDropped(await one.app.start('tidy', {}, { as: ida }))
  await one.app.runs.wait(run.run)
  const rows = await one.counted()
  const callers = (name: string): string[] => [
    ...new Set(rows.filter((row) => row.name === name).map((row) => row.caller)),
  ]
  assert.deepEqual(callers('addNote'), [`user:${made.id}`])
  assert.deepEqual(callers('listNotes'), [''])
  assert.deepEqual(callers('tidy'), [`user:${made.id}`])
  const limits = await counting(t, {
    change: (description) => Object.assign(description.project, { countBy: 'limits' }),
  })
  await limits.app.call('listNotes', {}, { as: ada })
  assert.equal(await limits.app.call('writer.reply', ['Hi.'], { as: ada }), 'Hello.')
  const kept = await limits.counted()
  assert.deepEqual([...new Set(kept.map((row) => row.name))], ['writer'])
  // A model call is counted by caller where nothing is said, since a limit for each caller rests on it.
  assert.ok(kept.every((row) => row.caller === 'user:ada'))
})

test("[21-22] a model that states countBy: 'app' is counted with the caller empty, and another countBy on a function is T1014", async (t) => {
  const { app, counted } = await counting(t, {
    change: (description) => Object.assign(Object(description.models.writer), { countBy: 'app' }),
  })
  assert.equal(await app.call('writer.reply', ['Hi.'], { as: ada }), 'Hello.')
  const rows = (await counted()).filter((row) => row.name === 'writer')
  assert.ok(rows.length > 0)
  assert.ok(rows.every((row) => row.caller === ''))
  // A function written with a value of `countBy` that the word does not take, as code that the checker does not read.
  const oddly = describing(() => query('oddly', { access: 'signedIn', input: {}, run: () => 1 }))
  Reflect.set(oddly.options, 'countBy', 'app')
  const { findings } = describe({ definitions: [{ value: oddly, file: 'functions.ts', exportName: 'oddly' }] })
  assert.ok(
    findings.some((one) => one.code === 'T1014' && /countBy/.test(one.message)),
    JSON.stringify(findings),
  )
})
