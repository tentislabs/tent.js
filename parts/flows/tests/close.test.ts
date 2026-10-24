import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bench } from './bench.ts'

// How the runner closes while the work of a step is under way.

test('[23-1] a runner that closes while the work of a step never settles answers within the time it is given', async (t) => {
  const b = bench(t, { hangs: async ({ step }) => step('forever', () => new Promise(() => undefined)) })
  const run = b.start('hangs')
  await b.untilStep(run, 'forever', 'started')
  const began = performance.now()
  // The step never ends: the closing waits for it as long as it is given, and no longer.
  const closed = await Promise.race([
    b.runner.close({ within: 100 }).then(() => 'closed'),
    new Promise((done) => setTimeout(() => done('held'), 3000)),
  ])
  assert.equal(closed, 'closed')
  assert.ok(performance.now() - began >= 90, 'the step was given its time')
})

test('[23-1] a runner that closes while a step is under way waits for it to be done and saved', async (t) => {
  let end: (value: string) => void = () => undefined
  const b = bench(t, {
    slow: async ({ step }) => {
      await step('first', () => new Promise<string>((done) => (end = done)))
      return step('second', () => 'never here')
    },
  })
  const run = b.start('slow')
  await b.untilStep(run, 'first', 'started')
  const closing = b.runner.close({ within: 5000 })
  end('made')
  await closing
  const steps = b.runner.read(run)?.steps.map((one) => `${one.name}:${one.state}`)
  assert.deepEqual(steps, ['first:done'], 'the step under way was saved, and no next one began')
})
