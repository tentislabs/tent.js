import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import type { FlowBody, Waiting } from '../index.ts'
import { replayTo } from '../index.ts'
import type { Made } from './bench.ts'
import { bench, codeOf } from './bench.ts'

// The runner over a stand-in for the engine: what it queues is kept, and the test plays the engine that hands it out.

const minute = 60_000

/** A bench whose engine takes workers: each queued try, each unqueued step and each task taken back is kept. */
function withWorkers(t: TestContext, flows: Record<string, Made>, workers: Record<string, object> = { gpu: {} }) {
  const queued: Waiting[] = []
  const unqueued: string[] = []
  const taken: string[] = []
  let n = 0
  const b = bench(t, flows, {
    project: { workers },
    env: {
      queue: (w) => void queued.push(w),
      unqueue: (run, step) => void unqueued.push(`${run} ${step.name}`),
      take: (task) => void taken.push(task),
    },
  })
  /** Waits until a try of a run waits in the queue, and answers it. */
  const untilQueued = async (run: string, count = 1): Promise<Waiting> => {
    for (let round = 0; round < 2000 && queued.filter((one) => one.run === run).length < count; round += 1)
      await b.settle()
    const all = queued.filter((one) => one.run === run)
    assert.ok(all.length >= count, `the run was queued ${count} times`)
    return all[count - 1]
  }
  /** Hands a queued try out as the engine does, and answers the task and what it carries. */
  const handOut = async (w: Waiting, worker = 'w1') => {
    n += 1
    const task = `task-${n}`
    const [carried] = await b.runner.out([{ run: w.run, step: w.step }], { task, worker, kind: w.kind })
    return { task, carried }
  }
  return { ...b, queued, unqueued, taken, untilQueued, handOut }
}

const flows: Record<string, Made> = {
  heavy: {
    run: async ({ input, step }) => {
      const before = await step('before', () => 'saved')
      const made = await step('encode', () => 'never here', { worker: 'gpu', time: '2 minutes' })
      return { before, made, input }
    },
  },
}

test('[51-3] a step that states a kind of worker is queued, handed out with what its run saved, and its result saved once at its end', async (t) => {
  const b = withWorkers(t, flows)
  const run = b.start('heavy', { video: 'a' })
  const waiting = await b.untilQueued(run)
  assert.deepEqual(
    [waiting.flow, waiting.of, waiting.step, waiting.kind, waiting.version, waiting.reserve],
    ['heavy', 'flow', { name: 'encode', repeat: 1 }, 'gpu', 'v1', 2 * minute],
  )
  // Nothing of the hand-out is written while the try waits: the step stands begun, and the run waits.
  assert.equal(await b.until(run, 'waiting'), 'waiting')
  const encode = () => b.runner.read(run)?.steps.find((one) => one.name === 'encode')
  assert.equal(encode()?.state, 'started')
  assert.deepEqual(b.runner.outNow(), [])
  const { task, carried } = await b.handOut(waiting)
  assert.deepEqual(
    [carried?.try, carried?.ms, carried?.input, carried?.startedBy],
    [1, 2 * minute, { video: 'a' }, { kind: 'system' }],
  )
  assert.deepEqual(carried?.saved, [{ name: 'before', repeat: 1, result: 'saved' }])
  assert.deepEqual(
    b.runner.outNow().map((one) => [one.task, one.worker, one.kind, one.steps]),
    [[task, 'w1', 'gpu', [{ run, step: { name: 'encode', repeat: 1 } }]]],
  )
  // A second hand-out of the same step finds it out already, and carries nothing.
  assert.deepEqual(await b.runner.out([{ run, step: waiting.step }], { task: 'other', worker: 'w2', kind: 'gpu' }), [
    undefined,
  ])
  await b.runner.ended(task, [{ done: 'a video' }])
  assert.deepEqual(await b.runner.wait(run), { before: 'saved', made: 'a video', input: { video: 'a' } })
  assert.equal(encode()?.result, 'a video')
  // The task has ended: what names it is the end of no current try.
  assert.equal(await codeOf(b.runner.ended(task, [{ done: 'again' }])), 'T5108')
  assert.equal(await codeOf(b.runner.progress(task, { value: 1, files: [] })), 'T5108')
})

test('[51-3] a try that was lost is given again under the next number, counted against lost of the kind, and fails with T5107 or goes to next after lost tries', async (t) => {
  const b = withWorkers(t, flows, { gpu: { lost: 2, next: { kind: 'gpuBig', after: ['lost'] } }, gpuBig: { lost: 1 } })
  const run = b.start('heavy')
  const first = await b.handOut(await b.untilQueued(run, 1))
  await b.runner.ended(first.task, [{ lost: 'said' }])
  const second = await b.handOut(await b.untilQueued(run, 2))
  assert.equal(second.carried?.try, 2)
  // The first try is not believed any more.
  assert.equal(await codeOf(b.runner.ended(first.task, [{ done: 'late' }])), 'T5108')
  await b.runner.ended(second.task, [{ lost: 'said' }])
  // Two tries were lost to the machines of gpu: the step goes to the kind that `next` names.
  const third = await b.untilQueued(run, 3)
  assert.equal(third.kind, 'gpuBig')
  const onBig = await b.handOut(third)
  assert.equal(onBig.carried?.try, 3)
  await b.runner.ended(onBig.task, [{ lost: 'said' }])
  assert.equal(await codeOf(b.runner.wait(run)), 'T5107')
})

test('[51-3] a try lost in silence alone counts against tries, one lost beside others is marked alone, and the work of a step that fails is tried again', async (t) => {
  const b = withWorkers(t, {
    once: { run: async ({ step }) => step('encode', () => 0, { worker: 'gpu', tries: 2 }) },
  })
  const run = b.start('once')
  const first = await b.handOut(await b.untilQueued(run, 1))
  await b.runner.ended(first.task, [{ lost: 'silent', beside: true }])
  const again = await b.untilQueued(run, 2)
  assert.equal(again.alone, true, 'a try lost beside others is handed out alone from then on')
  const second = await b.handOut(again)
  await b.runner.ended(second.task, [{ lost: 'silent', beside: false }])
  // Lost in silence alone, on a kind that does not state mayStop: that counts against the two tries of the step.
  const third = await b.untilQueued(run, 3)
  const last = await b.handOut(third)
  await b.runner.ended(last.task, [{ failed: new TentError('T0009', 'the work threw') }])
  assert.equal(await codeOf(b.runner.wait(run)), 'T0009')
})

test('[51-2] [51-3] no worker within wait fails with T5107 or goes to next, a try past its time is taken back with T0008, and a stopped run ends its work', async (t) => {
  const b = withWorkers(t, flows, { gpu: { next: { kind: 'cpu', after: ['wait'] } }, cpu: {} })
  const run = b.start('heavy')
  const waiting = await b.untilQueued(run)
  b.runner.none(run, waiting.step)
  const onCpu = await b.untilQueued(run, 2)
  assert.equal(onCpu.kind, 'cpu')
  const { task } = await b.handOut(onCpu)
  b.runner.started(task)
  assert.ok(b.runner.outNow()[0].startedAt !== undefined)
  b.clock.advance(2 * minute)
  await b.settle()
  assert.deepEqual(b.taken, [task], 'the task was taken back when its time ended')
  // The try failed with T0008, which is tried again after its wait.
  b.clock.advance(5000)
  const retry = await b.untilQueued(run, 3)
  assert.deepEqual(retry.step, waiting.step)
  // A run that is stopped takes its try out of the queue.
  b.runner.stop(run)
  assert.deepEqual(b.unqueued, [`${run} encode`])
  const other = withWorkers(t, flows, { gpu: {} })
  const lone = other.start('heavy')
  other.runner.none(lone, (await other.untilQueued(lone)).step)
  assert.equal(await codeOf(other.runner.wait(lone)), 'T5107')
})

test('[51-3] a run that is stopped while its task is out has the task taken back, and progress is kept in the row of its step', async (t) => {
  const b = withWorkers(t, flows)
  const run = b.start('heavy')
  const { task } = await b.handOut(await b.untilQueued(run))
  await b.runner.progress(task, { value: { at: 40 }, files: [] })
  const progress = b.runner.outNow()
  assert.equal(progress.length, 1)
  assert.equal(b.runner.waited(run), false)
  const waiting = b.runner.wait(run)
  assert.equal(b.runner.waited(run), true, 'a caller waits for the run')
  b.runner.stop(run)
  assert.deepEqual(b.taken, [task])
  assert.equal(await codeOf(waiting), 'T5106')
})

test('[51-3] a batch that is handed out and started holds one timer of its time, which its end takes away', async (t) => {
  const b = withWorkers(t, flows)
  const first = b.start('heavy', { n: 1 })
  const second = b.start('heavy', { n: 2 })
  const one = await b.untilQueued(first)
  const two = await b.untilQueued(second)
  await b.runner.out(
    [one, two].map((w) => ({ run: w.run, step: w.step })),
    { task: 'batch-1', worker: 'w1', kind: 'gpu' },
  )
  const before = b.clock.timers().length
  b.runner.started('batch-1')
  // The two entries began together: one timer holds the time of the task.
  assert.equal(b.clock.timers().length, before + 1)
  await b.runner.ended('batch-1', [{ done: 'a' }, { done: 'b' }])
  assert.equal(b.clock.timers().length, before, 'no timer of the task is left on the clock')
  assert.deepEqual(await b.runner.wait(first), { before: 'saved', made: 'a', input: { n: 1 } })
})

test('[23-29] a task carries when its saved steps ended, and a worker that replays it sees the entry of a step.first that won on the main pass', async (t) => {
  const raced: FlowBody = async ({ step }) => {
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
    return step('encode', () => won, { worker: 'gpu' })
  }
  const b = withWorkers(t, { raced: { run: raced } })
  const run = b.start('raced')
  const waiting = await b.untilQueued(run)
  // The entry that lost goes on to its next step only: its step that was under way is saved before the hand-out.
  const slow = () => b.runner.read(run)?.steps.find((one) => one.name === 'slow')?.state
  for (let round = 0; round < 200 && slow() !== 'done'; round += 1) await new Promise((done) => setTimeout(done, 10))
  const { carried } = await b.handOut(waiting)
  const ended = carried?.ended ?? []
  const at = (name: string) => ended.find((one) => one.name === name)?.at ?? 0
  assert.ok(at('quick') > 0 && at('quick') < at('slow'), 'the quick entry ended first')
  const saved = carried?.saved ?? []
  const answer = await replayTo(raced, {
    event: undefined,
    input: undefined,
    db: Object.create(null),
    step: waiting.step,
    saved: (name, repeat) => {
      const found = saved.find((one) => one.name === name && one.repeat === repeat)
      return found ? { result: found.result } : undefined
    },
    ended,
  })
  assert.equal(answer, 'b')
})
