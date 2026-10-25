import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Store } from '../../data/index.ts'
import { bench, openStore, settle } from './bench.ts'
import { held } from '../../../rig/budgets.ts'

const hour = 3_600_000
const minute = 60_000

test('[23-10] [night] resuming a run with 10, 1,000 and 10,000 saved steps, each with an answer of 4 kB, stays within one second', async (t) => {
  const answer = 'a'.repeat(4000)
  const b = bench(t, {
    long: {
      record: { limits: { steps: 20_000 } },
      run: async ({ input, step }) => {
        const count = Number(Object(input).steps)
        let read = 0
        for (let n = 0; n < count; n += 1) read += String(await step('work', () => answer)).length
        await step.wait('1 hour')
        return read
      },
    },
  })
  for (const steps of [10, 1000, 10_000]) {
    const run = b.start('long', { steps })
    await b.until(run, 'waiting')
    assert.equal(b.runner.read(run)?.steps.length, steps + 1)
    // The run resumes: its saved steps are read, the flow is carried out from its top, and it ends.
    const began = performance.now()
    b.clock.advance(hour)
    assert.equal(await b.runner.wait(run), steps * answer.length)
    const took = performance.now() - began
    console.log(`resuming ${steps} saved steps took ${took.toFixed(1)} ms`)
    held(`flow.resume.${steps}`, took, 'ms')
  }
})

/** A store that counts each read and each write that is made through it. */
function counting(store: Store): { store: Store; calls(): number } {
  let calls = 0
  const read = store.read.bind(store)
  const write = store.write.bind(store)
  store.read = (...handed) => {
    calls += 1
    return read(...handed)
  }
  store.write = (...handed) => {
    calls += 1
    return write(...handed)
  }
  return { store, calls: () => calls }
}

test('[23-11] [night] with 100,000 waiting runs the runner holds one timer and does no work between two wakes', async (t) => {
  const counted = counting(openStore())
  const woke: number[] = []
  const b = bench(
    t,
    {
      sleeper: {
        // Each of the runs is taken up at once: none of them waits its turn behind ten others.
        record: { together: { max: 100_000 } },
        run: async ({ input, step }) => {
          const n = Number(Object(input).n)
          await step.wait(`${n} minutes`)
          woke.push(n)
        },
      },
    },
    { store: counted.store },
  )
  const began = b.clock.now()
  const runs: string[] = []
  for (let n = 1; n <= 100_000; n += 1) runs.push(b.start('sleeper', { n }))
  // The runs are written one after another, which takes its time: the test waits for the last of them.
  for (let round = 0; b.runner.read(runs[runs.length - 1])?.state !== 'waiting'; round += 1) {
    assert.ok(round < 5_000_000, 'the last of the runs came to its wait')
    await settle(1)
  }
  await b.settle()
  assert.equal(
    b.store.read({ from: '_t_runs', where: { col: 'state', is: 'waiting' }, count: true }, { kind: 'system' }).value,
    100_000,
  )
  assert.deepEqual(b.clock.timers(), [began + minute], 'one timer, at the earliest wake of the hundred thousand')

  // Between two wakes nothing is asked of the store, however long the time and however many runs wait.
  const before = counted.calls()
  b.clock.advance(minute - 1)
  await b.settle()
  assert.equal(counted.calls(), before, 'no read and no write between two wakes')
  assert.deepEqual(woke, [])

  // A wake works on the one run that is due, and not on the others: a few reads and writes, whatever waits.
  b.clock.advance(1)
  await b.until(runs[0], 'done')
  await b.settle()
  assert.deepEqual(woke, [1])
  const forOne = counted.calls() - before
  assert.ok(forOne < 40, `the wake of one run asked the store ${forOne} times`)
  assert.deepEqual(b.clock.timers(), [began + 2 * minute], 'and the one timer stands at the next wake')
})
