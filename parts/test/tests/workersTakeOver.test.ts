import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { heavyWith, joined, heavyMoment, system, untilAsync } from './heavyApps.ts'
import { notDropped } from './started.ts'

/** Moves the clock of a machine on beat by beat. */
async function beats(app: TestApp, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    app.clock.advance('1 second')
    await heavyMoment(5)
  }
}

test('[51-5] after a reader took over, a worker finds it by the address that machines named, and goes on with the work of the new writer', async (t) => {
  const app = await heavyWith(t)
  await joined(t, app, ['gpu'])
  const near = await app.reader()
  await untilAsync('the reader is current', () => near.at().current === true)
  // A beat or two, so that the worker is told of the reader in the answer to its alive.
  await beats(app, 3)
  await app.kill()
  await beats(near, 6)
  await near.takeOver()
  const { run } = notDropped(await near.start('onGpu', { n: 6 }, system))
  for (let i = 0; i < 90 && near.runs.read(run)?.state !== 'done'; i++) await beats(near, 1)
  assert.equal(await near.runs.wait(run), 36)
})
