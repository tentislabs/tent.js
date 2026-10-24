import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

const system = { as: { kind: 'system' } } as const

/** The test app of the project of heavy work, closed when the test ends. */
async function heavyApp(t: TestContext): Promise<TestApp> {
  const app = await testApp({ folder: copyOf(t, 'heavy') })
  closing(t, () => app.close())
  return app
}

/** A moment of real time, in which what a link carries arrives. */
const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Waits until something holds, for some moments at the most. */
async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 500): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    await moment()
  }
  assert.fail(`never: ${what}`)
}

/** Starts a run of a flow as the system, and answers its id. */
const started = async (app: TestApp, flow: string, input?: unknown): Promise<string> =>
  notDropped(await app.start(flow, input ?? {}, system)).run

test('[51-2] a step that states background runs on a thread of the writer with no worker joined, and on a worker of the kind any once one joined; background here stays on the thread', async (t) => {
  const app = await heavyApp(t)
  // No worker is joined: the work of `any` runs on a thread here, as on one machine.
  assert.equal(await app.runs.wait(await started(app, 'onAny', { n: 2 })), 4)
  const worker = await app.worker({ kinds: ['any'] })
  closing(t, () => worker.close({ now: true }))
  await until(
    'the worker joined and is ready',
    () => app.workers().length === 1 && Reflect.get(Object(app.workers()[0]), 'ready').length > 0,
  )
  const run = await started(app, 'onAny', { n: 5 })
  // While the work is out, the worker holds it.
  await until('the task is out to the worker', () => worker.at().working.length === 1)
  assert.deepEqual(worker.at().working[0].step, 'double')
  assert.equal(await app.runs.wait(run), 10)
  // `background: 'here'` runs on the thread of the writer, though a worker of `any` is joined.
  assert.equal(await app.runs.wait(await started(app, 'onHere', { n: 3 })), 9)
  assert.equal(worker.at().working.length, 0)
})

test('[51-2] a step that states a kind is carried out by a worker of that kind alone, waits while none is joined, and fails with T5107 after wait or goes to next', async (t) => {
  const app = await heavyApp(t)
  const run = await started(app, 'onGpu', { n: 7 })
  await until('the step waits for a worker', () => app.runs.read(run)?.state === 'waiting')
  assert.deepEqual(Object(app.work().find((one) => Reflect.get(Object(one), 'kind') === 'gpu')).waiting, 1)
  // A worker of another kind takes none of it.
  const other = await app.worker({ kinds: ['any'] })
  closing(t, () => other.close({ now: true }))
  await moment(50)
  assert.equal(app.runs.read(run)?.state, 'waiting')
  const gpu = await app.worker({ kinds: ['gpu'] })
  closing(t, () => gpu.close({ now: true }))
  assert.equal(await app.runs.wait(run), 49)
  // A kind that no worker joins as fails with T5107 once its `wait` has passed.
  const slow = await started(app, 'onSlow')
  await until('the step waits', () => app.runs.read(slow)?.state === 'waiting')
  app.clock.advance('2 minutes')
  await until('the run failed', () => app.runs.read(slow)?.state === 'failed')
  assert.equal(app.runs.read(slow)?.error?.code, 'T5107')
  // A kind whose `next` names wait goes to the next kind, where a worker takes it.
  const spill = await started(app, 'onSpill', { n: 1 })
  await until('the step waits', () => app.runs.read(spill)?.state === 'waiting')
  app.clock.advance('2 minutes')
  assert.equal(await app.runs.wait(spill), 2)
})

test('[51-4] work on a worker reads and calls through its writer, as the caller of its run', async (t) => {
  const app = await heavyApp(t)
  const gpu = await app.worker({ kinds: ['gpu'] })
  closing(t, () => gpu.close({ now: true }))
  await app.call('addMark', { what: 'first' }, system)
  const run = await started(app, 'onMarks', { what: 'on the worker' })
  assert.deepEqual(await app.runs.wait(run), { before: 1, after: 2 })
  assert.deepEqual((await app.rows('marks')).map((one) => one.what).sort(), ['first', 'on the worker'])
})

test('[51-2] a worker that names a kind the project does not state is answered no with T5109', async (t) => {
  const app = await heavyApp(t)
  const odd = await app.worker({ kinds: ['tpu'] })
  closing(t, () => odd.close({ now: true }))
  await moment(80)
  assert.deepEqual(app.workers(), [])
  assert.equal(odd.at().joined, false)
})
