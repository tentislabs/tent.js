import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp, TestWorker } from '../index.ts'
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

const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 500): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await holds()) return
    await moment()
  }
  assert.fail(`never: ${what}`)
}

/** A worker of gpu, closed when the test ends, once it said that it is ready. */
async function gpuWorker(t: TestContext, app: TestApp): Promise<TestWorker> {
  const worker = await app.worker({ kinds: ['gpu'] })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await until('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

/** Moves the clock on beat by beat, so that the writer takes a silent worker as gone. */
async function beats(app: TestApp, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    app.clock.advance('1 second')
    await moment(5)
  }
}

test('[51-3] a worker that is killed while it works alone: its task is handed to another after workBehind and a beat, under the next try, and the result is saved once', async (t) => {
  const app = await heavyApp(t)
  const first = await gpuWorker(t, app)
  const run = notDropped(await app.start('onGpu', { n: 3 }, system)).run
  await until('the task is out to the first worker', () => first.at().working.length === 1)
  assert.equal(first.at().working[0].try, 1)
  await first.kill()
  const second = await gpuWorker(t, app)
  // The writer heard nothing for longer than workBehind and one beat: the task is lost in silence, and given again.
  await beats(app, 8)
  await until('the task is out to the second worker', () => second.at().working.length === 1)
  assert.equal(second.at().working[0].try, 2)
  assert.equal(await app.runs.wait(run), 9)
  const steps = app.runs.read(run)?.steps ?? []
  assert.deepEqual(
    steps.map((one) => [one.name, one.state, one.result]),
    [['square', 'done', 9]],
  )
})

test('[51-3] a worker that was held still for longer than workBehind and then goes on has its done refused with T5108, and nothing of it is written', async (t) => {
  const app = await heavyApp(t)
  const first = await gpuWorker(t, app)
  const run = notDropped(await app.start('onGpu', { n: 4 }, system)).run
  await until('the task is out to the first worker', () => first.at().working.length === 1)
  first.hold()
  const second = await gpuWorker(t, app)
  await beats(app, 8)
  await until('the task went to the second worker', () => second.at().working.length === 1)
  assert.equal(await app.runs.wait(run), 16)
  // What the first worker kept is let go: its done is refused, and it holds the task no more.
  first.free()
  await beats(app, 2)
  await until('the first worker let the task go', () => first.at().working.length === 0)
  assert.equal(app.runs.read(run)?.steps[0]?.result, 16)
})

test('[51-3] a worker that leaves hands its task back, and the task is carried out again at once by another', async (t) => {
  const app = await heavyApp(t)
  const first = await gpuWorker(t, app)
  // Its work stays out long enough for the second worker to join while the first holds it.
  const run = notDropped(await app.start('onGpuLong', { n: 5 }, system)).run
  await until('the task is out to the first worker', () => first.at().working.length === 1)
  const second = await gpuWorker(t, app)
  await first.close({ now: true })
  await until('the task went to the second worker', () => second.at().working.length === 1)
  assert.equal(second.at().working[0].try, 2)
  assert.equal(await app.runs.wait(run), 25)
})

test('[51-5] after the writer is closed and opened again, a worker that still holds its task dials within a beat, names it, and the step is saved once', async (t) => {
  const app = await heavyApp(t)
  const worker = await gpuWorker(t, app)
  const run = notDropped(await app.start('onGpu', { n: 6 }, system)).run
  await until('the task is out to the worker', () => worker.at().working.length === 1)
  await app.restart()
  // The worker dials every beat while it holds a task, and sends again what the new link does not know.
  await beats(app, 3)
  assert.equal(await app.runs.wait(run), 36)
  assert.deepEqual(
    app.runs.read(run)?.steps.map((one) => [one.name, one.state, one.result]),
    [['square', 'done', 36]],
  )
})

test('[51-5] a task whose worker did not come back within workBehind and a beat of the opening is handed out again, under the next try', async (t) => {
  const app = await heavyApp(t)
  const first = await gpuWorker(t, app)
  const run = notDropped(await app.start('onGpu', { n: 7 }, system)).run
  await until('the task is out to the first worker', () => first.at().working.length === 1)
  await first.kill()
  await app.restart()
  const second = await gpuWorker(t, app)
  await beats(app, 8)
  await until('the task went to the second worker', () => second.at().working.length === 1)
  assert.equal(second.at().working[0].try, 2)
  assert.equal(await app.runs.wait(run), 49)
})
