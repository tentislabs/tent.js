import assert from 'node:assert/strict'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { App } from '../index.ts'
import { counts } from '../index.ts'
import { bundled } from './apps.ts'
import { placeTold, rawLink, until, worldOf, writerIn } from './machines.ts'
import { amountOf, countsOf, kindLimits, person, seconds, tasksOf, worker, writerFor } from './workUse.ts'

/** The rows of one thing of the counts of an app, as a program reads them. */
async function rowsOf(app: App, name: string): Promise<{ unit: string; caller: string; amount: number }[]> {
  const rows: unknown = await app.read(counts.where({ name }), { as: 'system' })
  return (Array.isArray(rows) ? rows : []).map((one) => ({
    unit: String(Object(one).unit),
    caller: String(Object(one).caller),
    amount: Number(Object(one).amount),
  }))
}

/** Takes the models and the agent out of the project of the counts: a world of machines makes no provider. */
const modelless = (description: Description): void => {
  for (const name of ['writer', 'shipping']) delete description.models[name]
  delete description.flows.helper
}

test('[05-18.5] a reader that sends counted batches with an amount below zero and a unit of the engine that a reader does not count: both are dropped, and the rest is believed', async (t) => {
  const world = worldOf(t)
  const app = await writerIn(world, await bundled(t, { project: 'counting', change: modelless }, world.work))
  const raw = rawLink(app, 'o'.repeat(40))
  raw.link.send(placeTold(app, 'machine-raw'))
  await until('the raw reader was taken', () => raw.got.some((one) => one.t === 'go'))
  raw.link.send(
    JSON.stringify({
      t: 'counted',
      start: 1000,
      n: 1,
      used: [
        { name: 'listNotes', answeredBy: '', caller: 'user:another', units: { calls: 2, cpuMs: -5000 } },
        // Machine time is the writer's own measure: a reader holds no worker, and counts none.
        { name: 'square', answeredBy: 'gpu', caller: 'user:another', units: { workSeconds: 1000 } },
      ],
    }),
  )
  // An `n` far ahead is believed as the word of a machine that holds the whole data.
  raw.link.send(
    JSON.stringify({
      t: 'counted',
      start: 1000,
      n: 1000000,
      used: [{ name: 'listNotes', answeredBy: '', caller: '', units: { calls: 1 } }],
    }),
  )
  await world.beat(2)
  const listed = await rowsOf(app, 'listNotes')
  assert.equal(
    listed.filter((one) => one.unit === 'calls').reduce((sum, one) => sum + one.amount, 0),
    3,
    'the rest is believed',
  )
  assert.ok(!listed.some((one) => one.amount < 0), `an amount below zero is dropped: ${JSON.stringify(listed)}`)
  assert.deepEqual(await rowsOf(app, 'square'), [], 'a unit that a reader does not count is dropped')
  raw.link.close()
})

test('[05-18.6] a worker that reports a cpuMs of a year for a task of one second: it is counted as reported, no limit rests on it, and workSeconds is the writer own measure', async (t) => {
  const { app, advance } = await writerFor(t, {
    countEvery: '1 second',
    change: [kindLimits('gpu', { perDay: { workSeconds: 650 } })],
  })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  const year = 365 * 24 * 3600 * 1000
  await app().start('square', { n: 2 }, { as: ada })
  await until('the task was handed out', () => tasksOf(gpu).length === 1)
  const [task] = tasksOf(gpu)
  gpu.send({ t: 'started', task })
  await seconds(advance, 1, [gpu])
  gpu.send({ t: 'done', task, result: 4, cpuMs: year })
  await until('the task was saved', () => gpu.heard.some((one) => one.t === 'saved' && one.task === task))
  await seconds(advance, 2, [gpu])
  const rows = await countsOf(app())
  assert.equal(amountOf(rows, 'cpuMs', { name: 'square' }), year)
  const worked = amountOf(rows, 'workSeconds', { name: 'square' })
  assert.ok(worked >= 1 && worked < 5, `workSeconds is what the writer measured: ${worked}`)
  // A second task still goes out: no limit rests on what the worker reported.
  await app().start('square', { n: 3 }, { as: ada })
  await until('the second task was handed out', () => tasksOf(gpu).length === 2)
  gpu.close()
})
