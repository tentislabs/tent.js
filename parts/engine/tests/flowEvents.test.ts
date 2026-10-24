import assert from 'node:assert/strict'
import { test } from 'node:test'
import { refusal, system } from './apps.ts'
import { flowing, marksOf, settle, untilWithin } from './flowing.ts'

test('[46-5] `emit` of a declared event holds its data to the declaration while running: data that fits starts the flow on it, and data that does not is T0002 and starts nothing', async (t) => {
  const { app } = await flowing(t, { project: 'eventing' })
  await app.call('shipFits', { order: 'o1' }, { as: system })
  await untilWithin(async () => (await marksOf(app)).length === 1, 'the flow on the event ran')
  assert.deepEqual(await marksOf(app), ['o1 by post'], 'the flow is handed the data of the declared event')

  const refused = await refusal(app.call('shipUnfit', { order: 'o2' }, { as: system }))
  assert.equal(refused.code, 'T0002')
  assert.deepEqual(refused.fields, { order: 'type' })
  await settle()
  assert.equal(app.runs.find({ flow: 'noted' }).length, 1, 'the event that did not fit started no run')
})
