import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import { bench, codeOf } from './bench.ts'

// What becomes of a run whose pass throws outside the work of a step.

test('[23-2] a pass that throws outside the work of a step fails its run with that error, and leaves no rejection unheard', async (t) => {
  let thrown = false
  const unheard: unknown[] = []
  const hear = (reason: unknown): void => void unheard.push(reason)
  process.on('unhandledRejection', hear)
  t.after(() => void process.off('unhandledRejection', hear))
  const b = bench(
    t,
    { plain: async ({ step }) => step('one', () => 'made') },
    {
      env: {
        // The engine fails to hear that the run began: no step of it is under way yet.
        told: (what) => {
          if (thrown || what.kind !== 'run' || what.state !== 'running') return
          thrown = true
          throw new TentError('T0013', 'The log is full.')
        },
      },
    },
  )
  const run = b.start('plain')
  assert.equal(await b.until(run, 'failed', 'done'), 'failed')
  assert.equal(await codeOf(b.runner.wait(run)), 'T0013')
  await b.settle()
  assert.deepEqual(unheard, [])
})
