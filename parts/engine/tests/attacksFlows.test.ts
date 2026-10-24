import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../index.ts'
import { addUser, bundled, engineOf, portOf, refusal, send, system, testClock, workFolder } from './apps.ts'
import { flowing, settle, untilWithin, untilState } from './flowing.ts'
import { notDropped } from './started.ts'

const project = 'attackingFlows'

/** A browser of the user that a caller is, by a session that the test made: its cookie, and the user its page names. */
const browserOf = (app: App, caller: Caller): { cookie: string; as: string } => ({
  cookie: app.session(caller),
  as: String(caller.user?.id),
})

test("[46-10.1] a start with the key of another caller's run is refused with T7103 and answers nothing of that run, through the door and from code; its starter and the system are answered it", async (t) => {
  const { app, origin } = await flowing(t, { project })
  const ada = await addUser(app, 'Ada')
  const bob = await addUser(app, 'Bob')
  const [asAda, asBob] = [browserOf(app, ada), browserOf(app, bob)]
  const call = (input: object, by: { cookie: string; as: string }) =>
    send(app, `${origin}/_t/call/order`, { body: JSON.stringify({ input, as: by.as }), headers: { cookie: by.cookie } })

  // Ada starts her order through the door: the run outlasts the call, which is answered its id.
  const first = await call({ order: 'o1' }, asAda)
  assert.equal(first.error.code, 'T0008')
  const run = String(Object(first.error.fields).run)
  await untilState(app, run, 'waiting')

  // Bob sends a start of the same order, through the door and from code that is his: each is T7103, and names
  // nothing of Ada's run.
  const theirs = new RegExp(`${run}|the address of`)
  const byDoor = await call({ order: 'o1' }, asBob)
  assert.equal(byDoor.error.code, 'T7103')
  assert.doesNotMatch(JSON.stringify(byDoor.body), theirs)
  const byCode = await refusal(app.call('startOrder', { order: 'o1' }, { as: bob }))
  assert.equal(byCode.code, 'T7103')
  assert.doesNotMatch(JSON.stringify(byCode), theirs)
  // Nor does naming the run reach it.
  const named = await call({ run }, asBob)
  assert.equal(named.error.code, 'T0001')
  assert.doesNotMatch(JSON.stringify(named.body), /the address of/)
  assert.equal(app.runs.find({ flow: 'order' }).length, 1, 'nothing was started for Bob')

  // Ada's second start, and the system's, are answered her run.
  assert.equal(Object((await call({ order: 'o1' }, asAda)).error.fields).run, run)
  assert.equal(notDropped(await app.start('order', { order: 'o1' }, { as: system })).run, run)
  app.runs.approve(run, 'handed over')
  assert.equal((await call({ run }, asAda)).body.value, 'the address of o1')
  assert.equal(app.runs.find({ flow: 'order' }).length, 1)
})

test("[46-10.2] an event emitted to stop the runs of another tenant's key stops none of them: `stopOn` holds in the file of the write that emits", async (t) => {
  const { app } = await flowing(t, { project: 'attackingTenants' })
  const teamOf = async (name: string) => String(Object(await app.call('addTeam', { name }, { as: system })).id)
  const [a, b] = [await teamOf('a'), await teamOf('b')]
  const order = String(Object(await app.call('addOrder', { team: a, title: 'order' }, { as: system })).id)
  await untilWithin(
    async () => (await app.runs.find({ flow: 'drip', of: 'all' })).length === 1,
    'the drip of the order',
  )
  const [drip] = await app.runs.find({ flow: 'drip', of: 'all' })
  assert.equal(drip.key, order)
  await untilState(app, drip.id, 'waiting')

  // Team b emits the cancel of team a's order in a write of its own file, and the shared file emits it too.
  await app.call('cancelIn', { team: b, order }, { as: system })
  await app.call('cancelShared', { order }, { as: system })
  await settle()
  assert.equal(app.runs.read(drip.id)?.state, 'waiting', 'no run of another file is stopped')

  // In a write of team a's own file, the cancel stops it.
  await app.call('cancelIn', { team: a, order }, { as: system })
  await untilState(app, drip.id, 'stopped')
})

test('[46-10.3] a flood of starts of a paced flow is one row for each key under `debounce`, and the starts of one caller are bounded by the rate limit of the door', async (t) => {
  const { app, origin, advance } = await flowing(t, { project })
  const poke = (key: string, from: string) => send(app, `${origin}/_t/call/poke`, { input: { key }, from })
  const statuses: number[] = []
  for (let n = 0; n < 8; n += 1) statuses.push((await poke('k', '203.0.113.7')).status)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429, 429], 'the sixth poke of one caller is T0005')
  assert.equal((await poke('k', '203.0.113.7')).error.code, 'T0005')
  const rows = (): { key?: string; state: string }[] => app.runs.find({ flow: 'paced' })
  assert.deepEqual(
    rows().map((one) => [one.key, one.state]),
    [['k', 'queued']],
    'five starts of one key wait as one row',
  )

  // A caller who sends another key each time is held by the same count.
  const keyed: number[] = []
  for (let n = 0; n < 8; n += 1) keyed.push((await poke(`k${n}`, '203.0.113.8')).status)
  assert.deepEqual(keyed, [200, 200, 200, 200, 200, 429, 429, 429])
  assert.equal(rows().length, 6, 'one row for each key that was taken, and none for a start the door refused')
  advance(30_000)
  await untilWithin(() => rows().every((one) => one.state === 'done'), 'the waiting starts ran')
  assert.equal(rows().length, 6)
})

test("[46-10.4] work on many runs at once is the admin's on the machine: an app's caller is refused at the admin address, and code with no full access is T0013", async (t) => {
  const { app, dataFolder } = await flowing(t, { project })
  const ada = await addUser(app, 'Ada')
  const run = notDropped(await app.start('order', { order: 'o1' }, { as: ada })).run
  await untilState(app, run, 'waiting')
  const words = { what: 'stop', flow: 'order', yes: true }
  const admin = (name: string, args: object, headers: Record<string, string>) =>
    send(app, `http://localhost:${portOf(dataFolder)}/_t/admin/${name}`, { body: JSON.stringify({ args }), headers })

  // Ada, signed in, sends the bulk commands to the admin address: each is refused, and nothing is stopped.
  const { cookie } = browserOf(app, ada)
  for (const what of ['stop', 'replay', 'pause'])
    assert.equal((await admin('runs', { ...words, what }, { cookie })).error.code, 'T0006', what)
  assert.equal(app.runs.read(run)?.state, 'waiting')
  assert.deepEqual(app.runs.paused(), [])

  // The members in code are for code with full access.
  assert.equal((await refusal(app.call('stopOrders', {}, { as: ada }))).code, 'T0013')
  assert.equal((await refusal(app.call('replayOrders', {}, { as: ada }))).code, 'T0013')
  assert.equal(app.runs.read(run)?.state, 'waiting')
  assert.equal(app.runs.find({ flow: 'order' }).length, 1)

  // The admin on the machine is told the count first, and acts with `yes`.
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const counted = await admin('runs', { ...words, yes: false }, { authorization: `Bearer ${token}` })
  assert.deepEqual(Object(counted.body.value), { count: 1, runs: [run], done: false })
  assert.equal(app.runs.read(run)?.state, 'waiting')
  await admin('runs', words, { authorization: `Bearer ${token}` })
  assert.equal(app.runs.read(run)?.state, 'stopped')
})

test('[46-10.5] a sealed step result read from a backup, from the data file, or by another run is only the sealed text', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, { project }, work)
  const dataFolder = join(work, 'data')
  mkdirSync(dataFolder, { recursive: true })
  writeFileSync(join(dataFolder, 'secret.key'), `${randomBytes(32).toString('base64')}\n`)
  const { clock } = testClock()
  const app = await engineOf(t, { makers: { clock: () => clock } }).open(bundle.folder, { dataFolder, mode: 'test' })
  const run = notDropped(await app.start('charge', { last: 'secret' }, { as: system })).run
  await untilState(app, run, 'waiting')

  const backup = join(work, 'backup.db')
  await app.snapshot(backup)
  assert.doesNotMatch(readFileSync(backup).toString('latin1'), /4242-secret/, 'the backup holds the sealed text alone')
  assert.match(readFileSync(backup).toString('latin1'), /tent\.sealed/)
  for (const file of ['data.db', 'data.db-wal'].map((name) => join(dataFolder, name)).filter(existsSync))
    assert.doesNotMatch(readFileSync(file).toString('latin1'), /4242-secret/, file)

  const read = await app.runs.wait(notDropped(await app.start('snoop', { run }, { as: system })).run)
  assert.match(String(read), /tent\.sealed/)
  assert.doesNotMatch(String(read), /4242-secret/, 'another run reads the sealed text alone')
})
