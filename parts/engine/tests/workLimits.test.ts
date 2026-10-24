import assert from 'node:assert/strict'
import test from 'node:test'
import type { Provider, ReplyPart, Workers } from '../index.ts'
import {
  done,
  kindIn,
  kindLimits,
  workMoment,
  ownLimits,
  person,
  seconds,
  tasksOf,
  untilAsync,
  writerFor,
  worker,
} from './workUse.ts'
import { notDropped } from './started.ts'

/** What a call was refused with, or `answered`. */
async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    return String(Reflect.get(Object(error), 'code'))
  }
  return 'answered'
}

/** A host of machines that holds what it was told. */
function hostOf(): { host: Workers; needs: Record<string, unknown>[] } {
  const needs: Record<string, unknown>[] = []
  return { host: { need: (o) => void needs.push({ ...o }), idle: () => undefined }, needs }
}

test('[51-10] with ten tasks out, an eleventh step that could pass perDay of its kind with what is reserved for the ten waits, is shown held back in app.work() and in need, raises work.limit, and is handed out when they ended under their time', async (t) => {
  const { host, needs } = hostOf()
  const { app, engine, advance } = await writerFor(t, {
    workers: host,
    change: [kindLimits('gpu', { perDay: { workSeconds: 650 } })],
  })
  const limited: Record<string, unknown>[] = []
  engine.on('work.limit', ({ app: _, ...told }) => void limited.push(told))
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app(), { atOnce: 11 })
  for (let n = 1; n <= 11; n++) await app().start('square', { n }, { as: ada })
  await untilAsync('ten tasks were handed out', () => tasksOf(gpu).length === 10)
  await workMoment(50)
  assert.equal(tasksOf(gpu).length, 10, 'the eleventh waits')
  const kind = kindIn(app(), 'gpu')
  assert.equal(kind.waiting, 1)
  assert.equal(kind.heldBack, 1)
  assert.deepEqual(kind.limits, [{ unit: 'workSeconds', limit: 650, used: 0, reserved: 600 }])
  assert.deepEqual(
    limited.map((one) => [one.kind, one.which, one.unit, one.limit, one.used, one.reserved]),
    [['gpu', 'kind', 'workSeconds', 650, 0, 600]],
  )
  await untilAsync('need was told what is held back', () => needs.some((one) => one.heldBack === 1))
  const told = needs.find((one) => one.heldBack === 1)
  assert.deepEqual(told?.limits, [{ unit: 'workSeconds', limit: 650, used: 0, reserved: 600 }])
  // The ten end after ten seconds, a second of work each: the eleventh fits, and goes out.
  for (const task of tasksOf(gpu)) gpu.send({ t: 'started', task })
  await seconds(advance, 10, [gpu])
  for (const [i, task] of tasksOf(gpu).entries()) await done(gpu, task, (i + 1) ** 2)
  await untilAsync('the eleventh was handed out', () => tasksOf(gpu).length === 11)
  assert.deepEqual(kindIn(app(), 'gpu').limits, [{ unit: 'workSeconds', limit: 650, used: 10, reserved: 60 }])
  gpu.close()
})

test('[51-10] a step that a limit holds back does not fail by wait though no worker is joined, and goes at the turn of the day', async (t) => {
  const { app, advance } = await writerFor(t, {
    start: Date.UTC(2031, 0, 1, 23, 0),
    change: [kindLimits('gpu', { perDay: { workSeconds: 100 } })],
  })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  await app().start('square', { n: 1 }, { as: ada })
  await untilAsync('the first task was handed out', () => tasksOf(gpu).length === 1)
  const [first] = tasksOf(gpu)
  if (!first) throw new Error('no task')
  gpu.send({ t: 'started', task: first })
  await seconds(advance, 50, [gpu])
  await done(gpu, first, 1)
  gpu.close()
  // 50 were used, and the next step reserves 60: it is held back, and `wait` does not run for it.
  const { run } = notDropped(await app().start('square', { n: 2 }, { as: ada }))
  await seconds(advance, 30)
  assert.equal(app().runs.read(run)?.state, 'waiting')
  assert.equal(kindIn(app(), 'gpu').heldBack, 1)
  // At the turn of the day it is held back no more, so with no worker its `wait` runs, and ends it.
  advance(60 * 60_000)
  await workMoment(50)
  assert.equal(kindIn(app(), 'gpu').heldBack, 0)
  await untilAsync('the run failed for want of a worker', () => app().runs.read(run)?.state === 'failed')
  assert.equal(app().runs.read(run)?.error?.code, 'T5107')
})

test('[51-10] a call at the door that a limit holds back is refused at once with T7102, and with atLimit fail the try of a step fails with it', async (t) => {
  const { app } = await writerFor(t, { change: [kindLimits('gpu', { perDay: { workSeconds: 100 } })] })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app(), { atOnce: 3 })
  const first = app().call('encode', { n: 1 }, { as: ada })
  await untilAsync('the first call was handed out', () => tasksOf(gpu).length === 1)
  assert.equal(await refusal(app().call('encode', { n: 2 }, { as: ada })), 'T7102')
  // A step waits for the reserve to be let go, where nothing is said.
  const { run } = notDropped(await app().start('square', { n: 2 }, { as: ada }))
  await workMoment(50)
  assert.equal(app().runs.read(run)?.state, 'waiting')
  await done(gpu, String(tasksOf(gpu)[0]), 1)
  assert.equal(await first, 1)
  gpu.close()
  const failing = await writerFor(t, {
    change: [kindLimits('gpu', { perDay: { workSeconds: 100 }, atLimit: 'fail' })],
  })
  const bo = await person(failing.app(), 'Bo')
  const other = await worker(failing.app(), { atOnce: 3 })
  await failing.app().start('square', { n: 1 }, { as: bo })
  await untilAsync('the first task was handed out', () => tasksOf(other).length === 1)
  const held = notDropped(await failing.app().start('square', { n: 2 }, { as: bo }))
  // Each try fails at once, and the step is tried again after its waits, as for any failure.
  await seconds(failing.advance, 240, [other])
  await untilAsync('the held step failed', () => failing.app().runs.read(held.run)?.state === 'failed')
  assert.equal(failing.app().runs.read(held.run)?.error?.code, 'T7102')
  other.close()
})

test('[51-10] a step whose own reserve is more than the limit fails at once with T7102', async (t) => {
  const { app } = await writerFor(t, { change: [kindLimits('gpu', { perDay: { workSeconds: 30 } })] })
  const ada = await person(app(), 'Ada')
  const { run } = notDropped(await app().start('square', { n: 1 }, { as: ada }))
  await untilAsync('the run failed', () => app().runs.read(run)?.state === 'failed')
  const error = app().runs.read(run)?.error
  assert.equal(error?.code, 'T7102')
  assert.match(String(error?.message), /60/)
  assert.match(String(error?.message), /30/)
})

test('[51-10] with a reserve shorter than its time, more tasks go out at once', async (t) => {
  const timeOnly = await writerFor(t, { change: [kindLimits('gpu', { perDay: { workSeconds: 130 } })] })
  const ada = await person(timeOnly.app(), 'Ada')
  const gpu = await worker(timeOnly.app(), { atOnce: 5 })
  const calls = [1, 2, 3, 4, 5].map((n) => refusal(timeOnly.app().call('encode', { n }, { as: ada })))
  await untilAsync('two went out', () => tasksOf(gpu).length === 2)
  await workMoment(50)
  assert.equal(tasksOf(gpu).length, 2)
  for (const [i, task] of tasksOf(gpu).entries()) await done(gpu, task, i)
  assert.deepEqual((await Promise.all(calls)).sort(), ['T7102', 'T7102', 'T7102', 'answered', 'answered'])
  gpu.close()
  const short = await writerFor(t, {
    change: [kindLimits('gpu', { perDay: { workSeconds: 130 } }), ownLimits('encode', { reserve: 10_000 })],
  })
  const bo = await person(short.app(), 'Bo')
  const other = await worker(short.app(), { atOnce: 5 })
  const more = [1, 2, 3, 4, 5].map((n) => refusal(short.app().call('encode', { n }, { as: bo })))
  await untilAsync('all five went out', () => tasksOf(other).length === 5)
  for (const [i, task] of tasksOf(other).entries()) await done(other, task, i)
  assert.deepEqual(await Promise.all(more), ['answered', 'answered', 'answered', 'answered', 'answered'])
  other.close()
})

test('[51-10] after the writer opened again the reserves are what the tasks that are out make them', async (t) => {
  const writer = await writerFor(t, { change: [kindLimits('gpu', { perDay: { workSeconds: 150 } })] })
  const ada = await person(writer.app(), 'Ada')
  const gpu = await worker(writer.app(), { atOnce: 3 })
  await writer.app().start('square', { n: 1 }, { as: ada })
  await writer.app().start('square', { n: 2 }, { as: ada })
  await untilAsync('two tasks were handed out', () => tasksOf(gpu).length === 2)
  gpu.close()
  const app = await writer.reopen()
  assert.deepEqual(kindIn(app, 'gpu').limits, [{ unit: 'workSeconds', limit: 150, used: 0, reserved: 120 }])
  await app.start('square', { n: 3 }, { as: ada })
  await workMoment(50)
  assert.equal(kindIn(app, 'gpu').heldBack, 1)
})

test('[51-10] a limit that names workSeconds does not count the idle seconds, and one that names machineSeconds does', async (t) => {
  for (const [unit, heldBack] of [
    ['workSeconds', 0],
    ['machineSeconds', 1],
  ] as const) {
    const { app, advance } = await writerFor(t, {
      countEvery: '10 seconds',
      change: [kindLimits('gpu', { perDay: { [unit]: 100 } })],
    })
    const ada = await person(app(), 'Ada')
    const gpu = await worker(app())
    await seconds(advance, 50, [gpu])
    await app().start('square', { n: 1 }, { as: ada })
    await workMoment(50)
    assert.equal(kindIn(app(), 'gpu').heldBack, heldBack, unit)
    assert.equal(tasksOf(gpu).length, 1 - heldBack, unit)
    gpu.close()
  }
})

test('[51-10] perCallerPerDay stops one caller and no other, and perDay of an action stops that action alone', async (t) => {
  const { app } = await writerFor(t, {
    change: [
      kindLimits('gpu', { perCallerPerDay: { workSeconds: 100 } }),
      ownLimits('resize', { perDay: { workSeconds: 100 } }),
    ],
  })
  const [ada, bo] = [await person(app(), 'Ada'), await person(app(), 'Bo')]
  const gpu = await worker(app(), { atOnce: 5 })
  const first = app().call('encode', { n: 1 }, { as: ada })
  await untilAsync('the first call was handed out', () => tasksOf(gpu).length === 1)
  assert.equal(await refusal(app().call('encode', { n: 2 }, { as: ada })), 'T7102', 'a second for Ada passes her limit')
  // The call of Dee that is not held back is answered once its task was handed out and done.
  const answering = setInterval(() => {
    for (const task of tasksOf(gpu).slice(3)) gpu.send({ t: 'done', task, result: 6, cpuMs: 0 })
  }, 20)
  t.after(() => clearInterval(answering))
  const second = app().call('encode', { n: 3 }, { as: bo })
  await untilAsync('the call of Bo was handed out', () => tasksOf(gpu).length === 2)
  const [cy, dee] = [await person(app(), 'Cy'), await person(app(), 'Dee')]
  const resized = app().call('resize', { n: 4 }, { as: cy })
  await untilAsync('the first resize was handed out', () => tasksOf(gpu).length === 3)
  assert.equal(await refusal(app().call('resize', { n: 5 }, { as: dee })), 'T7102', 'resize passes its own limit')
  assert.equal(await refusal(app().call('encode', { n: 6 }, { as: dee })), 'answered', 'and encode does not')
  clearInterval(answering)
  for (const [i, task] of tasksOf(gpu).slice(0, 3).entries()) await done(gpu, task, i)
  assert.deepEqual(await Promise.all([first, second, resized]), [0, 1, 2])
  gpu.close()
})

/** A provider whose model first asks for the heavy tool, and then answers. */
const usingTool: Provider = {
  async *reply(o): AsyncGenerator<ReplyPart> {
    if (o.messages.at(-1)?.who === 'tool') {
      yield { text: 'Done.' }
      yield { end: { text: 'Done.', calls: [], units: { tokensOut: 1 } } }
      return
    }
    yield { end: { text: '', calls: [{ id: 'c1', tool: 'encode', input: { n: 1 } }], units: { tokensOut: 1 } } }
  },
}

test('[51-10] a run whose perRun names workSeconds fails with T7102 before a task that would pass it is handed out', async (t) => {
  const { app } = await writerFor(t, { provider: usingTool })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  const { run } = notDropped(await app().start('helper', { message: 'Encode one.' }, { as: ada }))
  await untilAsync('the run failed', () => app().runs.read(run)?.state === 'failed')
  const error = app().runs.read(run)?.error
  assert.equal(error?.code, 'T7102', JSON.stringify(error))
  assert.match(String(error?.message), /perRun/)
  await workMoment(50)
  assert.equal(tasksOf(gpu).length, 0, 'no task was handed out')
  gpu.close()
})
