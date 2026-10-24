import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { flowing, marksOf, settle, started, untilWithin, untilState } from './flowing.ts'

const project = 'hearing'

test('[21-20@10f] `run.failed` and `run.stopped` are raised for a run that failed and one that was stopped, with the app, the flow, the run, the key and the failure', async (t) => {
  const { app, engine } = await flowing(t, { project })
  const heard: unknown[] = []
  engine.on('run.failed', (told) => {
    if (told.flow === 'failing')
      heard.push(['run.failed', told.app === app, told.flow, told.run, told.key, told.failure])
  })
  engine.on('run.stopped', (told) => void heard.push(['run.stopped', told.app === app, told.flow, told.run, told.key]))
  const failed = await started(app, 'failing', { name: 'ada' })
  await untilState(app, failed, 'failed')
  const stopping = await started(app, 'slow')
  await untilWithin(() => app.runs.read(stopping)?.steps[0]?.state === 'started', 'the room is at work')
  app.runs.stop(stopping)
  app.runs.stop(stopping)
  await untilState(app, stopping, 'stopped')
  await settle()
  assert.deepEqual(heard, [
    [
      'run.failed',
      true,
      'failing',
      failed,
      'ada',
      { code: 'declined', message: 'The card was declined.', step: 'charge' },
    ],
    ['run.stopped', true, 'slow', stopping, undefined],
  ])
  for (const what of ['go room', 'go undo']) await app.call('addMark', { what }, { as: system })
})

test('[46-4] a flow on `run.failed` is never started by the failure of one of its own runs', async (t) => {
  const { app } = await flowing(t, { project })
  const failed = await started(app, 'failing', { name: 'bob' })
  await untilState(app, failed, 'failed')
  await untilWithin(
    () => app.runs.find({ flow: 'selfish' })[0]?.state === 'failed',
    'the flow that hears failed in turn',
  )
  await settle()
  assert.equal(app.runs.find({ flow: 'selfish' }).length, 1, 'its own failure started it no second time')
  assert.deepEqual(await marksOf(app), ['heard failing'])
})

test('[46-4] a second stop ends the run with no mark of the stop and no progress of its step left in its error', async (t) => {
  const { app } = await flowing(t, { project })
  const run = await started(app, 'slow')
  await untilWithin(() => app.runs.read(run)?.steps[0]?.state === 'started', 'the room is at work')
  app.runs.stop(run)
  await untilWithin(
    () => app.runs.read(run)?.steps.some((step) => step.name === 'onStop.undo') === true,
    'onStop works',
  )
  assert.equal(app.runs.read(run)?.error?.code, 'T5106', 'while onStop works the run keeps the mark of its stop')
  app.runs.stop(run)
  await untilState(app, run, 'stopped')
  assert.equal(app.runs.read(run)?.error, undefined, 'the stop has ended: its mark is gone')
  for (const what of ['go room', 'go undo']) await app.call('addMark', { what }, { as: system })
})
