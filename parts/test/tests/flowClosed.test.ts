import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { callCodeOf, remoteOf, servicedEngine, untilWithin } from './remotes.ts'
import { notDropped } from './started.ts'

const system: { as: Caller } = { as: { kind: 'system' } }

test('[23-3] a call that waits for a run is answered when its app is closed, with the error of the closing', async (t) => {
  const remote = await remoteOf(t, (_, response) => response.end())
  const { app } = await servicedEngine(t, remote)
  const { run } = notDropped(await app.start('waiting', {}, system))
  await untilWithin('the run waits', () => app.runs.read(run)?.state === 'waiting')
  const waited = callCodeOf(app.runs.wait(run))
  const called = callCodeOf(app.call('waiting', {}, system))
  await new Promise((done) => setTimeout(done, 100))
  await app.close()
  assert.equal(await waited, 'T0013')
  assert.equal(await called, 'T0013')
})
