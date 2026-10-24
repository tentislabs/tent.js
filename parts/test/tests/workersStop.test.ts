import assert from 'node:assert/strict'
import test from 'node:test'
import { beats, heavyWith, joined, system, untilAsync, workingOn } from './heavyApps.ts'
import { notDropped } from './started.ts'

const spot =
  "    spot: { about: 'Taken away at any moment', mayStop: true, lost: 2, next: { kind: 'gpu', after: ['lost'] } },\n" +
  "    spotOnly: { about: 'Taken away, with nowhere to go', mayStop: true, lost: 2 },\n" +
  "    small: { about: 'Little memory', next: { kind: 'gpu', after: ['memory'] } },\n"

test('[51-7] on a kind that states mayStop, a worker that is told going answers true to stopping; work that then calls back is given again and handed its last progress, and work that returns is saved as done', async (t) => {
  const app = await heavyWith(t, spot)
  const first = await joined(t, app, ['spot'])
  const { run } = notDropped(await app.start('onSpot', { kind: 'spot', tries: 2 }, system))
  await untilAsync('the task is out', () => workingOn(first).includes(run))
  first.going({ within: '1 minute' })
  await untilAsync('the work handed itself back', () => workingOn(first).length === 0)
  await joined(t, app, ['spot'])
  assert.equal(await app.runs.wait(run), 2, 'the next try went on from the progress of the one before')
})

test('[51-7] a worker of a kind that states mayStop, killed without a word: the try does not count against tries; after lost such tries the task goes to next, also after the writer started again, and fails with T5107 where no next names it', async (t) => {
  const app = await heavyWith(t, spot)
  const { run } = notDropped(await app.start('onSpot', { kind: 'spot', tries: 3 }, system))
  for (let i = 0; i < 2; i++) {
    const worker = await joined(t, app, ['spot'])
    await untilAsync('the task is out', () => workingOn(worker).includes(run))
    await worker.kill()
    await beats(app, 8)
  }
  // Two tries were lost to the machines of spot: the task goes to gpu, and stays there after a restart.
  await app.restart()
  await joined(t, app, ['gpu'])
  assert.equal(await app.runs.wait(run), 3, 'the third try, on gpu, went on from what the two before kept')
  const { run: nowhere } = notDropped(await app.start('onSpot', { kind: 'spotOnly', tries: 3 }, system))
  for (let i = 0; i < 2; i++) {
    const worker = await joined(t, app, ['spotOnly'])
    await untilAsync('the task is out', () => workingOn(worker).includes(nowhere))
    await worker.kill()
    await beats(app, 8)
  }
  await untilAsync('the run failed', () => app.runs.read(nowhere)?.state === 'failed')
  assert.equal(app.runs.read(nowhere)?.error?.code, 'T5107')
})

test('[51-7] a worker that was killed for want of memory says so when it starts again: the try failed with T5110, and the task goes to a next that names memory', async (t) => {
  const app = await heavyWith(t, spot)
  const small = await joined(t, app, ['small'])
  const { run } = notDropped(await app.start('onSpot', { kind: 'small', tries: 2 }, system))
  await untilAsync('the task is out', () => workingOn(small).includes(run))
  await small.kill({ cause: 'memory' })
  await small.restart()
  // The try failed for want of memory: the task goes to gpu, with its progress, and not back to small.
  await beats(app, 8)
  assert.ok(!workingOn(small).includes(run), 'the task went back to the kind that ran out of memory')
  assert.notEqual(app.runs.read(run)?.state, 'done')
  await joined(t, app, ['gpu'])
  assert.equal(await app.runs.wait(run), 2)
})

test('[51-7] progress that a step keeps on a thread is handed to its next try', async (t) => {
  const app = await heavyWith(t)
  const { run } = notDropped(await app.start('keepsHere', undefined, system))
  await untilAsync('the first try failed', () => app.runs.read(run)?.state === 'waiting')
  app.clock.advance('2 seconds')
  assert.equal(await app.runs.wait(run), 15)
})
