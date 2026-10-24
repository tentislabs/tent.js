import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { flowing, marksOf, untilWithin } from './flowing.ts'

const project = 'renewing'

test("[46-6] `step.again()` with no input hands the run's own input on to the run it starts", async (t) => {
  const { app } = await flowing(t, { project })
  await app.start('renewSame', { label: 'kept' }, { as: system })
  await untilWithin(() => {
    const runs = app.runs.find({ flow: 'renewSame' })
    return runs.length === 3 && runs.every((run) => run.state === 'done')
  }, 'three runs ended')
  assert.deepEqual(
    app.runs.find({ flow: 'renewSame' }).map((run) => run.input),
    [{ label: 'kept' }, { label: 'kept' }, { label: 'kept' }],
  )
  assert.deepEqual(await marksOf(app), ['same kept', 'same kept', 'same kept'])
})

test('[46-2] `runs.paused()` in code answers the flows that stand paused', async (t) => {
  const { app } = await flowing(t, { project })
  assert.deepEqual(await app.call('pausedFlows', {}, { as: system }), [])
  app.runs.pause('renew')
  assert.deepEqual(await app.call('pausedFlows', {}, { as: system }), ['renew'])
  await app.runs.resume('renew')
  assert.deepEqual(await app.call('pausedFlows', {}, { as: system }), [])
})
