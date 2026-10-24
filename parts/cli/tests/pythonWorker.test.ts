import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { TestApp, TestWorker, WorkerAsked } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { sharedPython, untilWithin } from './pythonApps.ts'

const shared = sharedPython('worker', 'pythonWorkers')

// The workers of each test: they are closed before its app, whose folder their Python programs hold open till then.
const workersOf = new WeakMap<TestContext, TestWorker[]>()

/** The test app of the project of the workers, whose workers are closed when the test ends, and then the app. */
async function workersApp(t: TestContext): Promise<TestApp> {
  const workers: TestWorker[] = []
  workersOf.set(t, workers)
  // Registered before the test app is made, so that it runs before the close that the test app holds.
  t.after(async () => {
    for (const worker of workers) await worker.close({ now: true }).catch(() => undefined)
  })
  return testApp({ folder: shared.project })
}

/** A worker of the app, closed when the test ends, once the writer holds it ready. */
async function ready(t: TestContext, app: TestApp, asked: WorkerAsked): Promise<TestWorker> {
  const worker = await app.worker(asked)
  workersOf.get(t)?.push(worker)
  const id = worker.at().id
  await untilWithin(
    () =>
      app
        .workers()
        .some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
    'the worker is ready',
    60_000,
  )
  return worker
}

/** Answers the error that a promise was refused with. */
async function refusal(promise: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await promise
  } catch (error) {
    return Object(error)
  }
  return assert.fail('the call was answered')
}

test('[51-11] a python that states worker is carried out on a worker of that kind, loaded once for two calls, handed a file of its input, and answers a file that the caller can download; its loading does not count on the time of its try, and what it wrote into tent.disk is there after the worker started again', async (t) => {
  const app = await workersApp(t)
  const ada = await app.user({ name: 'Ada' })
  const worker = await ready(t, app, { kinds: ['gpu'] })
  const id = String(await app.call('putFile', { text: 'the words of the input' }, { as: ada }))
  // The file loads for six seconds, and a try of it may take four: the loading stands before the try.
  const first = Object(await app.call('onCard', { f: id }, { as: ada }))
  assert.equal(first.text, 'the words of the input')
  assert.equal(first.disk, 'new')
  assert.equal(await app.call('readFile', { id: first.made }, { as: ada }), 'an answer of the worker')
  const second = Object(await app.call('onCard', { f: id }, { as: ada }))
  assert.equal(second.pid, first.pid, 'one loaded copy for both calls')
  assert.ok(worker.at().loaded.includes('onCard'))
  await worker.restart()
  await untilWithin(
    () => app.workers().some((one) => Reflect.get(Object(one), 'ready').length > 0),
    'ready again',
    60_000,
  )
  assert.equal(Object(await app.call('onCard', { f: id }, { as: ada })).disk, 'there')
})

test('[51-11] with atOnce: 4 four calls are in one loaded copy at one time', async (t) => {
  const app = await workersApp(t)
  const ada = await app.user({ name: 'Ada' })
  await ready(t, app, { kinds: ['gpu'], atOnce: 4 })
  const answers = (
    await Promise.all([1, 2, 3, 4].map(() => app.call('fourAtOnce', { seconds: 1.5 }, { as: ada })))
  ).map((one) => Object(one))
  assert.equal(new Set(answers.map((one) => one.pid)).size, 1)
  const lastBegan = Math.max(...answers.map((one) => one.began))
  const firstEnded = Math.min(...answers.map((one) => one.ended))
  assert.ok(lastBegan < firstEnded, 'the four were in the program at one time')
})

test('[51-11] a worker started with load says ready only after the loading, and that definition is not ended after pythonStopAfter', async (t) => {
  const app = await workersApp(t)
  const ada = await app.user({ name: 'Ada' })
  const began = performance.now()
  const worker = await ready(t, app, { kinds: ['gpu'], load: ['onCard'] })
  assert.ok(performance.now() - began >= 6000, 'ready came after the six seconds of the loading')
  assert.ok(worker.at().loaded.includes('onCard'))
  const id = String(await app.call('putFile', { text: 'words' }, { as: ada }))
  const first = Object(await app.call('onCard', { f: id }, { as: ada }))
  // Past pythonStopAfter of two seconds, the program that holds it is still the one.
  await new Promise((done) => setTimeout(done, 4000))
  assert.equal(Object(await app.call('onCard', { f: id }, { as: ada })).pid, first.pid)
})

test("[51-11] of two free workers a task goes to the one that holds its definition loaded, and with loaded: 'no' by place", async (t) => {
  const app = await workersApp(t)
  const ada = await app.user({ name: 'Ada' })
  // The other was free longer: by place alone it would be handed the task.
  const other = await ready(t, app, { kinds: ['gpu'] })
  const holding = await ready(t, app, { kinds: ['gpu'], load: ['onCard'] })
  const id = String(await app.call('putFile', { text: 'words' }, { as: ada }))
  for (let n = 0; n < 2; n++) await app.call('onCard', { f: id }, { as: ada })
  assert.ok(holding.at().loaded.includes('onCard'))
  assert.equal(other.at().loaded.includes('onCard'), false, 'the other was never handed it')

  const first = await ready(t, app, { kinds: ['spread'] })
  const second = await ready(t, app, { kinds: ['spread'] })
  await app.call('onSpread', {}, { as: ada })
  await app.call('onSpread', {}, { as: ada })
  // By place, the second task goes to the worker whose place was free longest: each holds it loaded once.
  assert.ok(first.at().loaded.includes('onSpread'))
  assert.ok(second.at().loaded.includes('onSpread'))
})

test('[51-11] a python that states batch is handed its entries, and tent.db() with no entry is T0013; one that calls what its uses does not name is T0013; raise tent.Back() hands the task back with its progress kept', async (t) => {
  const app = await workersApp(t)
  const ada = await app.user({ name: 'Ada' })
  await ready(t, app, { kinds: ['gpu'] })
  const answers = (await Promise.all([1, 2, 3].map((n) => app.call('batched', { n }, { as: ada })))).map((one) =>
    Object(one),
  )
  assert.deepEqual(
    answers.map((one) => one.n),
    [1, 2, 3],
  )
  assert.ok(
    answers.some((one) => one.of > 1),
    'calls were gathered into one batch',
  )
  assert.ok(answers.every((one) => one.alone === 'T0013'))
  const other = await refusal(app.call('asksOther', {}, { as: ada }))
  assert.equal(other.code, 'T0013', String(Reflect.get(other, 'message')))
  assert.deepEqual(await app.call('handsBack', {}, { as: ada }), [1, 2, 3])
})
