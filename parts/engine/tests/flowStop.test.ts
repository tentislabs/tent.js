import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { App } from '../index.ts'
import { codeOf, system } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

const project = 'stopping'

/** Starts a trip, and answers its run once its room is half booked and the step of it is at work. */
async function underWay(app: App, name: string): Promise<string> {
  const run = await started(app, 'trip', { name })
  await untilWithin(
    () => app.runs.read(run)?.steps.find((step) => step.name === 'room')?.state === 'started',
    'the room is booked',
  )
  await settle()
  return run
}

test('[46-4] [46-1] `onStop` runs once, saved, as the last work of a stopped run, handed the step that was at work and what it kept of its progress', async (t) => {
  const { app } = await flowing(t, { project })
  const run = await underWay(app, 'ada')
  const waited = codeOf(app.runs.wait(run))
  app.runs.stop(run)
  await untilState(app, run, 'stopped')
  assert.deepEqual(await marksOf(app), ['seat ada', 'undo ada room half'])
  assert.deepEqual(
    app.runs.read(run)?.steps.map((step) => [step.name, step.state]),
    [
      ['seat', 'done'],
      ['room', 'started'],
      ['onStop.undo', 'done'],
    ],
    'the steps of onStop are saved under their names with `onStop.` in front',
  )
  assert.equal(await waited, 'T5106', 'a caller that waits is answered once onStop has ended')
  // A stopped run is stopped once: its onStop is carried out no second time.
  app.runs.stop(run)
  await settle()
  assert.deepEqual(await marksOf(app), ['seat ada', 'undo ada room half'])
  await app.call('addMark', { what: 'go room ada' }, { as: system })
})

test('[46-4] [46-1] after `stopOn` the onStop of each run that the event stopped runs', async (t) => {
  const { app } = await flowing(t, { project })
  const run = await underWay(app, 'bob')
  const other = await underWay(app, 'cy')
  await app.call('cancelTrip', { name: 'bob' }, { as: system })
  await untilState(app, run, 'stopped')
  assert.deepEqual((await marksOf(app)).sort(), ['seat bob', 'seat cy', 'undo bob room half'])
  assert.equal(app.runs.read(other)?.state, 'running', 'the trip of another name goes on')
  for (const name of ['bob', 'cy']) await app.call('addMark', { what: `go room ${name}` }, { as: system })
  await untilState(app, other, 'done')
})

test('[46-4] a second stop ends an `onStop` that is at work', async (t) => {
  const { app } = await flowing(t, { project })
  const run = await underWay(app, 'slow')
  app.runs.stop(run)
  await untilWithin(async () => (await marksOf(app)).includes('undo slow room half'), 'onStop has begun')
  await settle()
  assert.equal(app.runs.read(run)?.state, 'running', 'the run is not stopped until its onStop has ended')
  app.runs.stop(run)
  await untilState(app, run, 'stopped')
  assert.equal(
    app.runs.read(run)?.steps.find((step) => step.name === 'onStop.wait')?.state,
    'started',
    'the work of onStop was ended by the second stop',
  )
  for (const what of ['go room slow', 'go undo slow']) await app.call('addMark', { what }, { as: system })
})

test('[46-4] a flow on `run.failed` of another flow starts in the write that ended the failed run, and one on `run.stopped` in the write that stopped it', async (t) => {
  const { app, engine } = await flowing(t, { project })
  const heard: unknown[] = []
  engine.on('run.failed', (told) => void heard.push(['run.failed', told.flow, told.run, told.failure?.code]))
  engine.on('run.stopped', (told) => void heard.push(['run.stopped', told.flow, told.run, told.failure]))

  const failing = await started(app, 'billing', { fails: true })
  // The failed run and the run that hears of it are written in one write: whoever sees the one sees the other.
  await untilWithin(() => app.runs.read(failing)?.state === 'failed', 'the billing failed')
  const [told] = app.runs.find({ flow: 'toldOfBilling' })
  assert.ok(told, 'the flow that listens was started with the failure')
  await untilState(app, told.id, 'done')
  assert.deepEqual(await marksOf(app), [`told run.failed ${failing} declined`])

  const stopping = await started(app, 'billing', { fails: false })
  await untilState(app, stopping, 'waiting')
  app.runs.stop(stopping)
  assert.equal(app.runs.find({ flow: 'toldOfBilling' }).length, 2, 'the stop started the flow that listens')
  await untilWithin(async () => (await marksOf(app)).length === 2, 'the stop was told')
  assert.deepEqual((await marksOf(app))[1], `told run.stopped ${stopping} undefined`)
  await settle()
  assert.deepEqual(heard, [
    ['run.failed', 'billing', failing, 'declined'],
    ['run.stopped', 'billing', stopping, undefined],
  ])
})
