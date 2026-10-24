import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Waiting } from '../index.ts'
import { threadsTable } from '../index.ts'
import { bench, codeOf, openStore, version } from './bench.ts'

// What the runner owes that no other test holds: each fails while the code does otherwise.

const minute = 60_000

test('[27-5] a conversation takes as many runs in its queue as limits.queued of the project says, and refuses one more with T7103', async (t) => {
  const b = bench(
    t,
    { chat: async ({ step }) => step.waitFor('answer') },
    {
      store: openStore(':memory:', [threadsTable]),
      project: { limits: { queued: 2 } },
    },
  )
  const start = () =>
    b.runner.add({ flow: 'chat', version, startedBy: { kind: 'system' }, thread: 'one', then: 'wait' })
  const holder = start()
  await b.until(holder, 'waiting')
  // Two stand behind the run that holds the conversation, as the project allows.
  start()
  start()
  let refused: string | undefined
  try {
    start()
  } catch (error) {
    refused = String(Reflect.get(Object(error), 'code'))
  }
  assert.equal(refused, 'T7103', 'the third run behind the holder is refused')
})

test('[23-29] a step on a thread sees the entry of a step.first that won on the main pass, after a later pass too', async (t) => {
  const b = bench(t, {
    race: async ({ step }) => {
      const won = await step.first([
        async () => {
          await step('slow', () => new Promise((done) => setTimeout(() => done('a'), 50)))
          return 'a'
        },
        async () => {
          await step('quick', () => 'b')
          return 'b'
        },
      ])
      await step.wait('1 minute')
      return step('heavy', () => won, { background: true })
    },
  })
  const run = b.start('race')
  await b.until(run, 'waiting')
  b.clock.advance(minute)
  await b.until(run, 'done', 'failed')
  // The quick entry ended first: the main pass goes on with it, and so must the work of the step on the thread.
  assert.equal(await b.runner.wait(run), 'b')
})

test('[51-6] a run of one entry of a batch that is stopped after the hand-out takes nothing else of the batch back', async (t) => {
  const queued: Waiting[] = []
  const taken: string[] = []
  const b = bench(
    t,
    { scored: async ({ step }) => step('score', () => 'never here', { worker: 'gpu', time: '2 minutes' }) },
    {
      project: { workers: { gpu: {} } },
      env: { queue: (w) => void queued.push(w), unqueue: () => undefined, take: (task) => void taken.push(task) },
    },
  )
  const first = b.start('scored', { n: 1 })
  const second = b.start('scored', { n: 2 })
  for (let round = 0; round < 2000 && queued.length < 2; round += 1) await b.settle()
  assert.equal(queued.length, 2)
  // The engine hands the two out as one batch, one task, as it gathers the calls of a definition that states `batch`.
  await b.runner.out(
    queued.map((one) => ({ run: one.run, step: one.step })),
    { task: 'batch-1', worker: 'w1', kind: 'gpu' },
  )
  b.runner.stop(first)
  await b.settle()
  // The work goes on for the other caller: its entry is still out.
  assert.deepEqual(taken, [], 'the task of the batch was not taken back')
  assert.equal(
    b.runner
      .outNow()
      .find((one) => one.task === 'batch-1')
      ?.steps.some((one) => one.run === second),
    true,
  )
  assert.equal(await codeOf(b.runner.wait(first)), 'T5106')
})

test('[51-4] a step whose task would pass taskSize by what earlier passes saved fails with T5102 where it states a kind of worker', async (t) => {
  const queued: Waiting[] = []
  const b = bench(
    t,
    {
      large: async ({ step }) => {
        await step('read', () => 'x'.repeat(5000))
        await step.wait('1 minute')
        return step('encode', () => 'never here', { worker: 'gpu' })
      },
    },
    {
      project: { workers: { gpu: {} }, limits: { taskSize: 3000 } },
      env: { queue: (w) => void queued.push(w), unqueue: () => undefined, take: () => undefined },
    },
  )
  const run = b.start('large')
  await b.until(run, 'waiting')
  b.clock.advance(minute)
  // The task would carry the 5,000 characters that the step `read` saved, past the 3,000 bytes of `taskSize`.
  for (let round = 0; round < 200 && !queued.length && b.runner.read(run)?.state !== 'failed'; round += 1)
    await b.settle()
  assert.equal(queued.length, 0, 'no task was queued for a worker')
  assert.equal(await codeOf(b.runner.wait(run)), 'T5102')
})

test('[51-5] a run that a step called is kept as long as the run at its top, past runsKept of its own end', async (t) => {
  const day = 86_400_000
  const b = bench(t, {
    parent: async ({ step }) => step.waitFor('approval', { timeout: '90 days' }),
    child: async () => 'ok',
  })
  const parent = b.start('parent')
  await b.until(parent, 'waiting')
  const caller = {
    run: parent,
    flow: 'parent',
    version,
    as: { kind: 'system' as const },
    step: { name: 'call', repeat: 1 },
  }
  const child = b.runner.add({ flow: 'child', version, startedBy: { kind: 'system' }, parent: caller, call: 'child' })
  await b.until(child, 'done')
  b.clock.advance(31 * day)
  // The upkeep removes the runs that ended longer ago than `runsKept`: the top of this one has not ended.
  b.runner.remove({ endedBefore: b.clock.now() - 30 * day })
  assert.equal(b.runner.read(parent)?.state, 'waiting')
  assert.equal(b.runner.read(child)?.state, 'done', 'the called run is still there for its top')
})

test('[51-4] a step whose task would pass taskSize by what the same pass saved fails with T5102 where it states a kind of worker', async (t) => {
  const queued: Waiting[] = []
  const b = bench(
    t,
    {
      large: async ({ step }) => {
        await step('read', () => 'x'.repeat(5000))
        return step('encode', () => 'never here', { worker: 'gpu' })
      },
    },
    {
      project: { workers: { gpu: {} }, limits: { taskSize: 3000 } },
      env: { queue: (w) => void queued.push(w), unqueue: () => undefined, take: () => undefined },
    },
  )
  const run = b.start('large')
  assert.equal(await codeOf(b.runner.wait(run)), 'T5102')
  assert.equal(queued.length, 0)
})
