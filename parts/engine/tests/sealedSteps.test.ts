import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeSecretKey } from '../index.ts'
import { running, system } from './apps.ts'
import { notDropped } from './started.ts'

test('[20-1a] a sealed column returns its value to a step of a flow, and to the flow between its steps, as it does to an action', async (t) => {
  const { app, dataFolder } = await running(t, { project: 'sealedSteps', open: { mode: 'live' } })
  makeSecretKey(dataFolder)
  const row = Object(await app.call('keep', { title: 'first', note: 'the note of the first' }, { as: system }))
  const id = String(row.id)
  assert.equal(await app.call('noteOf', { id }, { as: system }), 'the note of the first', 'an action reads the note')
  const run = notDropped(await app.start('noteInStep', { id }, { as: system })).run
  assert.equal(
    await app.runs.wait(run),
    'the note of the first the note of the first',
    'the flow reads the note between its steps and inside its step',
  )
})
