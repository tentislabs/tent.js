import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App } from '../index.ts'
import type { Running } from './apps.ts'
import { addUser, logRows, nobody, running, send, system, testClock } from './apps.ts'
import { settle, untilWithin, untilState } from './flowing.ts'
import { notDropped } from './started.ts'

const hour = 3_600_000

/** The project of these attacks, opened on a clock that stands still until the test moves it. */
async function attacked(t: TestContext): Promise<Running & { advance(ms: number): void }> {
  const { clock, advance } = testClock()
  const run = await running(t, { project: 'flowAttacks', engine: { makers: { clock: () => clock } } })
  return { ...run, advance }
}

/** The marks that the work of the steps left. */
async function marksOf(app: App): Promise<string[]> {
  const rows = await app.call('allMarks', {}, { as: system })
  return (Array.isArray(rows) ? rows : []).map((row) => String(Object(row).what))
}

test('[05-2.22@7b] a step whose db is limited to the starter of its run reads a table with a private column and answers the rows as they are: the column is in no row', async (t) => {
  const { app, dataFolder } = await attacked(t)
  await app.call('addStaff', { name: 'Ada', pay: 5100 }, { as: system })
  await app.call('addStaff', { name: 'Bob', pay: 4200 }, { as: system })
  const cy = await addUser(app, 'Cy')
  const { run } = notDropped(await app.start('paidStep', undefined, { as: cy }))
  const answer = await app.runs.wait(run)
  assert.deepEqual(
    (Array.isArray(answer) ? answer : []).map((row) => [Object(row).name, 'pay' in Object(row)]),
    [
      ['Ada', false],
      ['Bob', false],
    ],
  )
  // Neither the saved step nor the row of the run, as anyone reads them, holds the pay.
  const seen = JSON.stringify(app.runs.read(run))
  for (const pay of ['5100', '4200', 'pay']) assert.equal(seen.includes(pay), false, `${pay} in ${seen}`)
  const kept = JSON.stringify([logRows(dataFolder, 'calls')])
  for (const pay of ['5100', '4200']) assert.equal(kept.includes(pay), false, pay)
})

test('[05-4.15@7b] an action that a page reads, which calls a flow or starts one, is refused with T0013 and starts no run', async (t) => {
  const { app, origin, dataFolder } = await attacked(t)
  for (const name of ['callsFlow', 'startsFlow']) {
    const read = await send(app, `${origin}/_t/read/${name}`, { input: {} })
    assert.equal(read.body.ok, false, name)
    const [logged] = logRows(dataFolder, 'calls').filter((row) => row.name === name)
    assert.equal(logged?.code, 'T0013', name)
  }
  await settle()
  assert.deepEqual(app.runs.find({ flow: 'marking' }), [])
  assert.deepEqual(await marksOf(app), [])
  // Called by a press, each does its work.
  await app.call('startsFlow', {}, { as: nobody })
  await untilWithin(() => app.runs.find({ flow: 'marking', states: ['done'] }).length === 1, 'the started run ended')
})

test('[05-4.15@7b] an action that states `background`, read by a page, holds the read-only rule inside its work: the change it calls is refused, and nothing is written', async (t) => {
  const { app, origin } = await attacked(t)
  const read = await send(app, `${origin}/_t/read/heavyMarks`, { input: {} })
  await settle()
  assert.deepEqual(await marksOf(app), [], `a read wrote a row, and was answered ${JSON.stringify(read.body)}`)
  assert.equal(read.body.ok, false)
})

test('[05-8.10@7b] a run that outlives its starter: the user is removed, and the run fails with T3101 when it is next taken up', async (t) => {
  const { app, advance } = await attacked(t)
  const ada = await addUser(app, 'Ada')
  const { run } = notDropped(await app.start('outlives', undefined, { as: ada }))
  await untilState(app, run, 'waiting')
  await app.call('removeUser', { user: ada.user?.id }, { as: system })
  advance(hour + 1)
  await untilState(app, run, 'failed')
  assert.equal(app.runs.read(run)?.error?.code, 'T3101')
  assert.deepEqual(await marksOf(app), [], 'no step of the run was carried out after its starter was gone')
})

test('[23-1] the entry of a `step.first` that finished first is the one its run goes on with, also on a later pass', async (t) => {
  const { app, advance } = await attacked(t)
  const { run } = notDropped(await app.start('firstWins', undefined, { as: system }))
  await untilState(app, run, 'waiting')
  // The entry that lost was at work when the other won, and its step was saved when it ended.
  assert.deepEqual(
    app.runs
      .read(run)
      ?.steps.map((one) => [one.name, one.state])
      .sort(),
    [
      ['fast', 'done'],
      ['pause', 'waiting'],
      ['slow', 'done'],
    ],
  )
  advance(hour + 1)
  assert.equal(await app.runs.wait(run), 'fast', 'the pass after the wait went on with the entry that lost')
})

test('[23-26] a step that starts a run, and is tried again after that run failed, starts no second run', async (t) => {
  const { app, advance } = await attacked(t)
  const { run } = notDropped(await app.start('startsTwice', undefined, { as: system }))
  await untilState(app, run, 'waiting')
  await untilWithin(
    () => app.runs.find({ flow: 'failsAtOnce', states: ['failed'] }).length === 1,
    'the started run failed',
  )
  advance(6_000)
  await untilState(app, run, 'done')
  assert.equal(app.runs.find({ flow: 'failsAtOnce' }).length, 1, 'the second try of the step started a second run')
})

test('[23-30a] a caller who is nobody with no visitor id can neither wait for nor stop the run of another such caller', async (t) => {
  const { app, origin } = await attacked(t)
  const call = (input: unknown) => send(app, `${origin}/_t/call/slowOffered`, { input })
  const late = await call({})
  assert.equal(late.error.code, 'T0008')
  const run = String(Object(late.error.fields).run)
  // A second caller, who sends no cookie either, names that run.
  assert.equal((await call({ run, stop: true })).error.code, 'T0001')
  assert.equal(app.runs.read(run)?.state, 'waiting', 'the run of another caller was stopped')
})

/** Waits until a run has ended, done or failed, within a few seconds. */
const ended = (app: App, run: string): Promise<void> =>
  untilWithin(() => ['done', 'failed'].includes(String(app.runs.read(run)?.state)), `the run ${run} ended`, 5_000)

test('[23-29] a step on a background thread after a step that failed for good and was caught, and after one that states `onFail: goOn`, runs and saves its result', async (t) => {
  const { app } = await attacked(t)
  const { run } = notDropped(await app.start('heavyAfterFailure', undefined, { as: system }))
  await ended(app, run)
  assert.equal(await app.runs.wait(run), 'heavy after a failure')
})

test('[23-29] a step on a background thread of a run that runs as its starter is carried out with the user of the main thread', async (t) => {
  const { app } = await attacked(t)
  const ada = await addUser(app, 'Ada')
  const { run } = notDropped(await app.start('heavyAsStarter', undefined, { as: ada }))
  await ended(app, run)
  assert.equal(await app.runs.wait(run), 'heavy for a user')
})

test('[23-9] a turn of the schedule of a flow that refuses a second run while one works is refused, and the schedule goes on', async (t) => {
  const { app, advance } = await attacked(t)
  advance(60_000)
  await untilWithin(
    () => app.runs.find({ flow: 'everyMinute', states: ['running'] }).length === 1,
    'the first turn works',
  )
  // The next turn comes while the first run works: it is refused, and the clock goes on.
  assert.doesNotThrow(() => advance(60_000))
  await untilWithin(() => app.runs.find({ flow: 'everyMinute', states: ['done'] }).length === 1, 'the first run ended')
  advance(60_000)
  await untilWithin(
    () => app.runs.find({ flow: 'everyMinute' }).length === 2,
    'the turn after the refused one starts a run',
  )
})
