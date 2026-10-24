import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import type { TestApp, TestWorker } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

const system = { as: { kind: 'system' } } as const

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

async function joined(t: TestContext, app: TestApp, kinds: string[], atOnce = 1): Promise<TestWorker> {
  const worker = await app.worker({ kinds, atOnce })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const id = worker.at().id
  await until('the worker is ready', () =>
    app.workers().some((one) => Reflect.get(Object(one), 'id') === id && Reflect.get(Object(one), 'ready').length > 0),
  )
  return worker
}

/** The error that a promise is refused with. */
async function refusal(work: Promise<unknown>): Promise<TentError> {
  try {
    await work
  } catch (error) {
    if (error instanceof TentError) return error
    throw error
  }
  assert.fail('the call was answered')
}

test('[51-3] an action that states background is a run of one step: on a thread here with no worker, and on a worker of any once one joined', async (t) => {
  const app = await heavyApp(t)
  assert.equal(await app.call('encode', { n: 2 }, system), 20)
  const runs = app.runs.find({ flow: 'encode' })
  assert.deepEqual(
    runs.map((one) => [one.kind, one.state, one.steps.map((step) => step.name)]),
    [['action', 'done', ['call']]],
  )
  const worker = await joined(t, app, ['any'])
  const answered = app.call('encode', { n: 3 }, system)
  await until('the action is out to the worker', () => worker.at().working.length === 1)
  assert.equal(worker.at().working[0].step, 'call')
  assert.equal(await answered, 30)
})

test('[51-3] [51-5] an action on a worker outlasts its time: the caller is answered T0008 with the run, and the same call with the run waits for it again', async (t) => {
  const app = await heavyApp(t)
  // The task is out to a worker that is held still: the action outlasts its time, and its run goes on.
  const gpu = await joined(t, app, ['gpu'])
  gpu.hold()
  const late = await refusal(app.call('encodeOnGpu', { n: 4 }, system))
  assert.equal(late.code, 'T0008')
  const run = String(late.fields?.run)
  assert.equal(app.runs.read(run)?.flow, 'encodeOnGpu')
  gpu.free()
  assert.equal(await app.call('encodeOnGpu', { run }, system), 400)
  // With the worker gone, a second call outlasts its time before its task was handed out: its run is stopped.
  await gpu.kill()
  const other = await refusal(app.call('encodeOnGpu', { n: 1 }, system))
  const second = String(other.fields?.run)
  await until('the run was stopped', () => app.runs.read(second)?.state === 'stopped')
})

test('[51-3] an action on a worker whose work throws is answered that error, and is not tried again', async (t) => {
  const app = await heavyApp(t)
  await joined(t, app, ['gpu'])
  const failed = await refusal(app.call('failsOnGpu', { n: 1 }, system))
  assert.match(failed.message, /threw/)
  const [run] = app.runs.find({ flow: 'failsOnGpu' })
  assert.equal(run?.state, 'failed')
  assert.equal(run?.steps[0]?.state, 'failed')
})

test('[31-15@7b] an action that states a kind of worker is read as an entry of data, and where it outlasts its time its T0008 carries fields.run', async (t) => {
  const app = await heavyApp(t)
  // The task is out to a worker that is held still, so the action outlasts its time and its run goes on.
  const gpu = await joined(t, app, ['gpu'])
  gpu.hold()
  const asked = await app.request(
    new Request('https://heavy.test/_t/read/readOnGpu', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { n: 2 } }),
    }),
    { from: '10.1.2.3' },
  )
  const body = Object(await asked.json())
  assert.equal(body.error?.code, 'T0008', JSON.stringify(body))
  const run = String(body.error?.fields?.run)
  assert.equal(app.runs.read(run)?.flow, 'readOnGpu')
  // The run goes on: the worker carries it out once it goes on.
  gpu.free()
  assert.equal(await app.runs.wait(run), 3)
})

test('[51-2] a call that would stand behind more than queue of its kind is refused at once with T7102, and the one that waits is not', async (t) => {
  const app = await heavyApp(t)
  const first = app.call('encodeNarrow', { n: 1 }, system)
  first.catch(() => undefined)
  await until('the first call waits', () =>
    app
      .work()
      .some((one) => Reflect.get(Object(one), 'kind') === 'narrow' && Reflect.get(Object(one), 'waiting') === 1),
  )
  const second = await refusal(app.call('encodeNarrow', { n: 2 }, system))
  assert.equal(second.code, 'T7102')
  assert.equal(app.work().find((one) => Reflect.get(Object(one), 'kind') === 'narrow') !== undefined, true)
  assert.equal(
    Reflect.get(Object(app.work().find((one) => Reflect.get(Object(one), 'kind') === 'narrow')), 'waiting'),
    1,
  )
})

/** The run that a worker works on now, or nothing. */
const workingOn = (worker: TestWorker): string | undefined => worker.at().working[0]?.run

test('[51-2] with the one worker busy, a task that a call waits for is handed out before an older one that nobody waits for, and with order oldest the older one goes first', async (t) => {
  const app = await heavyApp(t)
  for (const [kind, flow, action, first] of [
    ['gpu', 'onGpu', 'encodeOnGpu', 'waited'],
    ['oldest', 'onOldest', 'encodeOnOldest', 'older'],
  ] as const) {
    const worker = await joined(t, app, [kind])
    const busy = notDropped(await app.start(flow, { n: 1 }, system)).run
    await until('the worker is busy', () => workingOn(worker) === busy)
    const older = notDropped(await app.start(flow, { n: 2 }, system)).run
    const called = app.call(action, { n: 3 }, system)
    called.catch(() => undefined)
    await until('both wait', () =>
      app.work().some((one) => Reflect.get(Object(one), 'kind') === kind && Reflect.get(Object(one), 'waiting') === 2),
    )
    await until('the worker took the next', () => workingOn(worker) !== undefined && workingOn(worker) !== busy, 1000)
    assert.equal(workingOn(worker) === older, first === 'older', kind)
    await called
    await worker.close({ now: true })
  }
})

test('[51-2] of two free workers, place pack hands a task to the one that holds more, and spread to the one whose place was free longest', async (t) => {
  const app = await heavyApp(t)
  const one = await joined(t, app, ['packed', 'gpu'], 2)
  const two = await joined(t, app, ['packed', 'gpu'], 2)
  // Spread, the kind gpu: the second task goes to the worker that was free.
  await app.start('onGpu', { n: 1 }, system)
  await until('one holds a task', () => one.at().working.length + two.at().working.length === 1)
  await app.start('onGpu', { n: 2 }, system)
  await until('each holds one', () => one.at().working.length === 1 && two.at().working.length === 1)
  await until('both are free again', () => one.at().working.length + two.at().working.length === 0, 1000)
  // Pack: the worker that holds a task is handed the next while it has a place.
  await app.start('onPacked', { n: 3 }, system)
  await until('one holds a task', () => one.at().working.length + two.at().working.length === 1)
  await app.start('onPacked', { n: 4 }, system)
  await until('one holds both', () => one.at().working.length === 2 || two.at().working.length === 2)
})

test('[51-3] an action whose worker is killed is given again, limits.lost times at most, 3 where it states none, and no try of it carries the number of one before', async (t) => {
  const app = await heavyApp(t)
  // The writer is opened with the keys of the workers before the call: a call to the writer before is not answered by the next.
  let worker = await joined(t, app, ['gpu'])
  const call = app.call('encodeSlowly', { n: 7 }, system).catch((error: unknown) => error)
  const tries: number[] = []
  for (let i = 0; i < 3; i++) {
    if (i > 0) worker = await joined(t, app, ['gpu'])
    await until('the task is out', () => worker.at().working.length > 0)
    tries.push(worker.at().working[0]?.try ?? -1)
    await worker.kill()
    for (let beat = 0; beat < 8; beat++) {
      app.clock.advance('1 second')
      await moment(5)
    }
  }
  const failed = await call
  assert.ok(failed instanceof TentError)
  assert.equal(failed.code, 'T5107')
  assert.equal(new Set(tries).size, 3, `each try had a number of its own: ${tries}`)
})
