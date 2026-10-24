import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Workers } from '../index.ts'
import { fetchedIn } from '../work/fetched.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

const system = { as: { kind: 'system' } } as const
const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A host of machines that holds what it was told. */
function hostOf(): { host: Workers; needs: Record<string, unknown>[]; idles: Record<string, unknown>[] } {
  const needs: Record<string, unknown>[] = []
  const idles: Record<string, unknown>[] = []
  return { host: { need: (o) => void needs.push({ ...o }), idle: (o) => void idles.push({ ...o }) }, needs, idles }
}

/** Sets an option of a kind of worker of the project. */
const kindWith = (option: string, value: unknown) => (description: { project: Record<string, unknown> }) => {
  const workers: Record<string, Record<string, unknown>> = Object(description.project.workers)
  workers.gpu = { ...workers.gpu, [option]: value }
}

test('[51-8] Workers.need is told when a task waits and no worker of its kind is joined, with the count and the age of the oldest; again after needEvery; and once with waiting: 0', async (t) => {
  const { host, needs } = hostOf()
  const { app, engine, advance } = await writerOf(t, { workers: host })
  const waits: Record<string, unknown>[] = []
  engine.on('work.waits', ({ app: _, ...told }) => void waits.push(told))
  await app.start('onGpu', { n: 3 }, system)
  await moment()
  assert.deepEqual(needs, [{ app: 'working', mode: 'test', kind: 'gpu', waiting: 1, heldBack: 0, oldest: 0 }])
  advance(4000)
  await moment()
  assert.equal(needs.length, 1, 'nothing more before needEvery')
  advance(6000)
  await moment()
  assert.deepEqual(needs.at(-1), { app: 'working', mode: 'test', kind: 'gpu', waiting: 1, heldBack: 0, oldest: 10_000 })
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  await worker.next('work')
  await moment()
  const after = needs.length
  assert.deepEqual(needs.at(-1), { app: 'working', mode: 'test', kind: 'gpu', waiting: 0, heldBack: 0, oldest: 0 })
  // The worker stays alive while the clock moves on.
  for (let i = 0; i < 20; i++) {
    advance(1000)
    worker.send({ t: 'alive', tasks: [String(Object(worker.heard.find((one) => one.t === 'work')?.task).id)] })
    await moment()
  }
  assert.equal(needs.length, after, 'waiting: 0 is told once')
  assert.deepEqual(waits, [
    { kind: 'gpu', waiting: 1, heldBack: 0, oldest: 0 },
    { kind: 'gpu', waiting: 0, heldBack: 0, oldest: 0 },
  ])
  worker.close()
})

test('[51-8] Workers.idle names a worker that had nothing to do for idleAfter, and again after needEvery; worker.idle is raised once', async (t) => {
  const { host, idles } = hostOf()
  const { app, engine, advance } = await writerOf(t, { workers: host, change: kindWith('idleAfter', 3000) })
  const raised: Record<string, unknown>[] = []
  engine.on('worker.idle', ({ app: _, ...told }) => void raised.push(told))
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  const beat = async (): Promise<void> => {
    advance(1000)
    worker.send({ t: 'alive', tasks: [] })
    await moment()
  }
  for (let i = 0; i < 2; i++) await beat()
  assert.equal(idles.length, 0, 'not before idleAfter')
  await beat()
  assert.equal(idles.length, 1)
  assert.equal(idles[0]?.kind, 'gpu')
  assert.equal(typeof idles[0]?.worker, 'string')
  for (let i = 0; i < 10; i++) await beat()
  assert.equal(idles.length, 2, 'told again after needEvery')
  assert.equal(raised.length, 1)
  assert.deepEqual(Object.keys(raised[0] ?? {}).sort(), ['kind', 'since', 'worker'])
  worker.close()
})

test('[51-8] a worker that was released is handed nothing more, also after it joined again; app.release answers false while a hand-out to it is under way, and worker.empty is raised when it holds nothing', async (t) => {
  const { app, engine } = await writerOf(t)
  const empty: string[] = []
  engine.on('worker.empty', (told) => void empty.push(told.worker))
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  await app.start('onGpu', { n: 3 }, system)
  const work = await worker.next('work')
  const id = String(Object(app.workers()[0]).id)
  assert.equal(app.release(id), false, 'a task is out to it')
  await worker.next('release')
  const task = String(Object(work.task).id)
  worker.send({ t: 'started', task })
  worker.send({ t: 'done', task, result: 9, cpuMs: 1 })
  await worker.next('saved')
  await moment()
  assert.deepEqual(empty, [id])
  assert.equal(app.release(id), true)
  // A second run waits: the released worker is handed nothing, also on a new link.
  const { run } = notDropped(await app.start('onGpu', { n: 4 }, system))
  await moment()
  assert.equal(worker.heard.filter((one) => one.t === 'work').length, 1)
  worker.close()
  const again = await readyWorker(app, joiningKeys.free, ['gpu'])
  await moment()
  assert.equal(again.heard.filter((one) => one.t === 'work').length, 0)
  assert.notEqual(app.runs.read(run)?.state, 'done')
  assert.equal(Object(app.work().find((one) => Object(one).kind === 'gpu')).waiting, 1)
  again.close()
})

test('[51-8] a worker whose messages pass workPerMinute is refused with T0005, and a done that was refused is taken when sent again in the next minute', async (t) => {
  const { app, advance } = await writerOf(t, {
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), workPerMinute: 2 }
    },
  })
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  // A step of ten minutes: the minute that the test moves on is no end of its try.
  const { run } = notDropped(await app.start('longOnGpu', { text: 'abcde' }, system))
  const work = await worker.next('work')
  const task = String(Object(work.task).id)
  worker.send({ t: 'started', task })
  worker.send({ t: 'progress', task, value: 1, files: [], n: 1 })
  await worker.next('saved')
  worker.send({ t: 'done', task, result: 5, cpuMs: 1 })
  const refused = await worker.next('refused')
  assert.deepEqual([refused.what, refused.code], ['done', 'T0005'])
  // A minute later, the worker alive all along, the done is taken.
  for (let i = 0; i < 61; i++) {
    advance(1000)
    worker.send({ t: 'alive', tasks: [task] })
    await moment()
  }
  worker.send({ t: 'done', task, result: 5, cpuMs: 1 })
  await worker.next('saved')
  assert.equal(await app.runs.wait(run), 5)
  worker.close()
})

test('[51-8] fetched/ is held to its size, and no file that a task at work names is removed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'tent-fetched-'))
  try {
    const named = new Set(['a'])
    const fetched = fetchedIn(folder, 100, () => named)
    fetched.keep('a', 'x'.repeat(80))
    fetched.keep('b', 'y'.repeat(80))
    assert.equal(fetched.size(), 160, 'what a task at work names stays, past the size')
    fetched.keep('c', 'z'.repeat(80))
    assert.equal(fetched.read('b'), undefined, 'the oldest that no task names went')
    assert.equal(fetched.read('a')?.length, 80)
    named.clear()
    fetched.keep('d', 'w'.repeat(20))
    assert.ok(fetched.size() <= 100, `held to its size: ${fetched.size()}`)
    assert.equal(fetched.read('d')?.length, 20)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('[51-8] each event of the table of section 1 but work.limit is heard once, with its fields', async (t) => {
  const { app, engine, advance } = await writerOf(t, { change: kindWith('idleAfter', 1000) })
  const heard: [string, string[]][] = []
  for (const event of [
    'worker.joined',
    'worker.left',
    'worker.going',
    'worker.idle',
    'worker.empty',
    'work.waits',
  ] as const)
    engine.on(event, (told) => void heard.push([event, Object.keys(told).sort()]))
  await app.start('onGpu', { n: 2 }, system)
  await moment()
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  const work = await worker.next('work')
  const task = String(Object(work.task).id)
  // Released while its task is out, it becomes empty once the task was saved.
  app.release(String(Object(app.workers()[0]).id))
  worker.send({ t: 'going', within: 60_000 })
  worker.send({ t: 'started', task })
  worker.send({ t: 'done', task, result: 4, cpuMs: 1 })
  await worker.next('saved')
  await moment()
  advance(1500)
  worker.send({ t: 'alive', tasks: [] })
  await moment()
  worker.close()
  await moment()
  const names = heard.map(([name]) => name)
  for (const name of ['worker.joined', 'worker.left', 'worker.going', 'worker.idle', 'worker.empty'])
    assert.equal(names.filter((one) => one === name).length, 1, name)
  assert.equal(
    names.filter((one) => one === 'work.waits').length,
    2,
    'work.waits when work began to wait, and with waiting: 0',
  )
  assert.deepEqual(Object.fromEntries(heard), {
    'worker.joined': ['app', 'kinds', 'worker'],
    'worker.left': ['app', 'kinds', 'worker'],
    'worker.going': ['app', 'within', 'worker'],
    'worker.idle': ['app', 'kind', 'since', 'worker'],
    'worker.empty': ['app', 'worker'],
    'work.waits': ['app', 'heldBack', 'kind', 'oldest', 'waiting'],
  })
})
