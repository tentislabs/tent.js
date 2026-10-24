import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bench } from './bench.ts'

test('[46-3] `batch` with no `wait` waits ten seconds for the first start of a batch', async (t) => {
  const b = bench(t, {
    gathered: {
      record: { input: { n: { kind: 'number' } }, pace: { batch: { max: 3 } } },
      run: async ({ events, step }) => step('count', () => (events ?? []).length),
    },
  })
  const run = b.start('gathered', { n: 1 })
  b.clock.advance(9999)
  await b.settle()
  assert.equal(b.runner.read(run)?.state, 'queued', 'the batch waits while ten seconds have not passed')
  b.clock.advance(1)
  assert.equal(await b.runner.wait(run), 1)
})
