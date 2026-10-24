import assert from 'node:assert/strict'
import test from 'node:test'
import {
  amountOf,
  countsOf,
  done,
  workMoment,
  person,
  readyFor,
  seconds,
  tasksOf,
  untilAsync,
  writerFor,
  worker,
} from './workUse.ts'
import { notDropped } from './started.ts'

const userOf = (caller: { user?: { id: string } }): string => `user:${caller.user?.id}`

test('[51-10] a worker that holds two tasks for a minute counts 30 workSeconds for each, under its definition, its kind and its starter, and a lost try counts its seconds as lostSeconds beside them', async (t) => {
  const { app, advance } = await writerFor(t)
  const [ada, bo] = [await person(app(), 'Ada'), await person(app(), 'Bo')]
  const gpu = await worker(app(), { atOnce: 2 })
  await app().start('square', { n: 2 }, { as: ada })
  await app().start('square', { n: 3 }, { as: bo })
  await untilAsync('both tasks were handed out', () => tasksOf(gpu).length === 2)
  const [one, two] = tasksOf(gpu)
  if (!one || !two) throw new Error('no tasks')
  for (const task of [one, two]) gpu.send({ t: 'started', task })
  await seconds(advance, 60, [gpu])
  await done(gpu, one, 4)
  await done(gpu, two, 9)
  const rows = await countsOf(app())
  assert.equal(amountOf(rows, 'workSeconds', { name: 'square', answeredBy: 'gpu', caller: userOf(ada) }), 30)
  assert.equal(amountOf(rows, 'workSeconds', { name: 'square', answeredBy: 'gpu', caller: userOf(bo) }), 30)
  assert.equal(amountOf(rows, 'lostSeconds'), 0, 'nothing was lost')
  // A try that is lost in silence after 20 seconds alone on its worker: it was paid for, and counts twice.
  await app().start('square', { n: 4 }, { as: ada })
  await untilAsync('the third task was handed out', () => tasksOf(gpu).length === 3)
  gpu.send({ t: 'started', task: tasksOf(gpu)[2] })
  await seconds(advance, 20, [gpu])
  gpu.close()
  await seconds(advance, 30)
  const after = await countsOf(app())
  assert.equal(amountOf(after, 'lostSeconds', { name: 'square', answeredBy: 'gpu', caller: userOf(ada) }) >= 20, true)
  assert.equal(
    amountOf(after, 'workSeconds', { caller: userOf(ada) }) - 30,
    amountOf(after, 'lostSeconds', { caller: userOf(ada) }),
    'the seconds of the lost try are in workSeconds too',
  )
})

test('[51-10] the seconds of a batch are shared among its entries by its measure', async (t) => {
  const { app, advance } = await writerFor(t)
  const [ada, bo] = [await person(app(), 'Ada'), await person(app(), 'Bo')]
  // Both calls wait while no worker is joined, and go out as one batch to the first that joins.
  const calls = [app().call('measured', { n: 1 }, { as: ada }), app().call('measured', { n: 3 }, { as: bo })]
  await workMoment(50)
  const gpu = await worker(app())
  await untilAsync('the batch was handed out', () => tasksOf(gpu).length === 1)
  const [task] = tasksOf(gpu)
  if (!task) throw new Error('no task')
  const sent = Object(gpu.heard.find((one) => one.t === 'work')?.task)
  assert.equal(sent.batch, true)
  assert.equal(sent.entries.length, 2)
  gpu.send({ t: 'started', task })
  await seconds(advance, 40, [gpu])
  gpu.send({
    t: 'done',
    task,
    results: [
      { ok: true, value: 1 },
      { ok: true, value: 3 },
    ],
    cpuMs: 0,
  })
  assert.deepEqual(await Promise.all(calls), [1, 3])
  const rows = await countsOf(app())
  assert.equal(amountOf(rows, 'workSeconds', { name: 'measured', caller: userOf(ada) }), 10)
  assert.equal(amountOf(rows, 'workSeconds', { name: 'measured', caller: userOf(bo) }), 30)
})

test('[51-10] the seconds a worker was joined with no task, and those before it was ready, are counted under its kind and no caller', async (t) => {
  const { app, advance } = await writerFor(t, { countEvery: '30 seconds' })
  const gpu = await worker(app(), { ready: false })
  await seconds(advance, 10, [gpu])
  readyFor(gpu, Object(gpu.heard.find((one) => one.t === 'versions')))
  await workMoment()
  await seconds(advance, 40, [gpu])
  const rows = await countsOf(app())
  assert.equal(amountOf(rows, 'loadSeconds', { name: '', answeredBy: 'gpu', caller: '' }), 10)
  const idle = amountOf(rows, 'idleSeconds', { name: '', answeredBy: 'gpu', caller: '' })
  assert.ok(idle >= 20 && idle <= 40, `idle ${idle}`)
  assert.equal(
    rows.filter((one) => ['loadSeconds', 'idleSeconds'].includes(one.unit) && one.caller !== '').length,
    0,
    'no caller',
  )
  gpu.close()
})

test('[51-10] a task that began before the turn of the day and ended after it is counted whole on the second day', async (t) => {
  const { app, advance } = await writerFor(t, { start: Date.UTC(2031, 0, 1, 23, 59, 30) })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  await app().start('square', { n: 2 }, { as: ada })
  await untilAsync('the task was handed out', () => tasksOf(gpu).length === 1)
  const [task] = tasksOf(gpu)
  if (!task) throw new Error('no task')
  gpu.send({ t: 'started', task })
  await seconds(advance, 50, [gpu])
  await done(gpu, task, 4)
  const rows = (await countsOf(app())).filter((one) => one.unit === 'workSeconds')
  assert.deepEqual(
    rows.map((one) => [one.day, one.amount]),
    [['2031-01-02', 50]],
  )
  gpu.close()
})

test('[51-10] the cpuMs that a worker reports with done is counted under the name of the run, and used of the run holds its workSeconds', async (t) => {
  const { app, advance } = await writerFor(t)
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  const { run } = notDropped(await app().start('square', { n: 2 }, { as: ada }))
  await untilAsync('the task was handed out', () => tasksOf(gpu).length === 1)
  const [task] = tasksOf(gpu)
  if (!task) throw new Error('no task')
  gpu.send({ t: 'started', task })
  await seconds(advance, 12, [gpu])
  await done(gpu, task, 4, 1234)
  const rows = await countsOf(app())
  assert.equal(amountOf(rows, 'cpuMs', { name: 'square', caller: userOf(ada) }), 1234)
  await untilAsync('the run is done', () => app().runs.read(run)?.state === 'done')
  // What a run used is the sum of what was booked under it.
  const used = (app().runs.read(run)?.used ?? []).map((one) =>
    Number(Reflect.get(Object(Reflect.get(one, 'units')), 'workSeconds') ?? 0),
  )
  assert.equal(
    used.reduce((sum, one) => sum + one, 0),
    12,
  )
  gpu.close()
})

test('[51-10] a kind that states countBy: app is counted with the caller empty', async (t) => {
  const { app, advance } = await writerFor(t)
  const ada = await person(app(), 'Ada')
  const cheap = await worker(app(), { kinds: ['cheap'] })
  await app().start('squareCheap', { n: 2 }, { as: ada })
  await untilAsync('the task was handed out', () => tasksOf(cheap).length === 1)
  const [task] = tasksOf(cheap)
  if (!task) throw new Error('no task')
  cheap.send({ t: 'started', task })
  await seconds(advance, 5, [cheap])
  await done(cheap, task, 4)
  const rows = (await countsOf(app())).filter((one) => one.unit === 'workSeconds')
  assert.deepEqual(
    rows.map((one) => [one.name, one.answeredBy, one.caller, one.amount]),
    [['squareCheap', 'cheap', '', 5]],
  )
  cheap.close()
})
