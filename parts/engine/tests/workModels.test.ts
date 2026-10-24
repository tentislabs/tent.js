import assert from 'node:assert/strict'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { Provider, ReplyPart } from '../index.ts'
import { logRows } from './apps.ts'
import type { RawWorker } from './workLink.ts'
import { amountOf, countsOf, person, realWorker, tasksOf, untilAsync, writerFor, worker } from './workUse.ts'
import { notDropped } from './started.ts'

/** Asks the writer one call of a task, as a worker does, and answers its answer. */
async function asked(one: RawWorker, id: string, task: string, call: object): Promise<Record<string, unknown>> {
  one.send({ t: 'call', id, task, ...call })
  for (;;) {
    const answer = await one.next('answer')
    if (answer.id === id) return answer
  }
}

/** A provider that answers each call with the words it is made with. */
const saying = (words: string): Provider => ({
  async *reply(): AsyncGenerator<ReplyPart> {
    yield { text: words }
    yield { end: { text: words, calls: [], units: { tokensIn: 3, tokensOut: 5 } } }
  },
})

/** Sets the limits of use of the model of the project. */
const modelLimits = (limits: object) => (description: Description) => {
  description.models.thinker = { ...description.models.thinker, limits }
}

/** Has the writer make the calls of models of the work on gpu. */
const modelsByWriter = (description: Description) => {
  const workers: Record<string, Record<string, unknown>> = Object(description.project.workers)
  workers.gpu = { ...workers.gpu, outside: { models: 'writer' } }
}

test('[51-10] a model call that the work on a worker makes is counted by the writer: its may is held to the limits of the model, and its did is counted under the caller of the task and in used of its run', async (t) => {
  const { app } = await writerFor(t, { change: [modelLimits({ perDay: { tokensOut: 5 } })] })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  const { run } = notDropped(await app().start('thinkOnGpu', undefined, { as: ada }))
  await untilAsync('the task was handed out', () => tasksOf(gpu).length === 1)
  const [task] = tasksOf(gpu)
  if (!task) throw new Error('no task')
  gpu.send({ t: 'started', task })
  const may = await asked(gpu, 'm1', task, {
    what: 'may',
    may: 'p1',
    model: 'thinker',
    call: 'reply',
    key: 'k',
    nth: 1,
  })
  assert.equal(may.ok, true, JSON.stringify(may))
  const did = await asked(gpu, 'm2', task, {
    what: 'did',
    may: 'p1',
    model: 'thinker',
    answeredBy: 'thinker',
    call: 'reply',
    key: 'k',
    nth: 1,
    ok: true,
    units: { tokensIn: 3, tokensOut: 5 },
    ms: 40,
  })
  assert.equal(did.ok, true, JSON.stringify(did))
  const rows = await countsOf(app())
  const caller = `user:${ada.user?.id}`
  assert.equal(amountOf(rows, 'tokensOut', { name: 'thinker', caller }), 5)
  assert.equal(amountOf(rows, 'calls', { name: 'thinker', caller }), 1)
  const used = (app().runs.read(run)?.used ?? []).map((one) =>
    Number(Reflect.get(Object(Reflect.get(one, 'units')), 'tokensOut') ?? 0),
  )
  assert.equal(
    used.reduce((sum, one) => sum + one, 0),
    5,
  )
  // The limit of the day is reached: the next `may` is refused, and no call is made.
  const again = await asked(gpu, 'm3', task, {
    what: 'may',
    may: 'p2',
    model: 'thinker',
    call: 'reply',
    key: 'k',
    nth: 2,
  })
  assert.equal(Object(again.error).code, 'T7102', JSON.stringify(again))
  gpu.close()
})

test('[51-10] a worker makes the model call of its work itself, with its own provider, and its writer counts it; with outside models writer the writer makes it', async (t) => {
  const writer = await writerFor(t, { provider: saying('From the writer.') })
  const ada = await person(writer.app(), 'Ada')
  await realWorker(t, writer, { providers: { mine: saying('From the worker.') } })
  const { run } = notDropped(await writer.app().start('thinkOnGpu', undefined, { as: ada }))
  await untilAsync('the run is done', () => writer.app().runs.read(run)?.state === 'done')
  assert.equal(writer.app().runs.read(run)?.answer, 'From the worker.')
  const rows = await countsOf(writer.app())
  assert.equal(amountOf(rows, 'tokensOut', { name: 'thinker', caller: `user:${ada.user?.id}` }), 5)
  assert.equal(amountOf(rows, 'calls', { name: 'thinker', caller: `user:${ada.user?.id}` }), 1)
  const byWriter = await writerFor(t, { provider: saying('From the writer.'), change: [modelsByWriter] })
  const bo = await person(byWriter.app(), 'Bo')
  await realWorker(t, byWriter, { providers: { mine: saying('From the worker.') } })
  const second = notDropped(await byWriter.app().start('thinkOnGpu', undefined, { as: bo }))
  await untilAsync('the second run is done', () => byWriter.app().runs.read(second.run)?.state === 'done')
  assert.equal(byWriter.app().runs.read(second.run)?.answer, 'From the writer.')
  assert.equal(amountOf(await countsOf(byWriter.app()), 'calls', { name: 'thinker' }), 1)
})

test('[51-13] a fetch that the work on a worker makes itself sends a may before it and a did after it, and is in outgoing of the writer log', async (t) => {
  const writer = await writerFor(t)
  const ada = await person(writer.app(), 'Ada')
  await realWorker(t, writer)
  const { run } = notDropped(await writer.app().start('fetchOnGpu', undefined, { as: ada }))
  await untilAsync('the run is done', () => writer.app().runs.read(run)?.state === 'done')
  assert.equal(writer.app().runs.read(run)?.answer, 'fetched')
  await untilAsync('the row of outgoing was written', () =>
    logRows(writer.dataFolder, 'outgoing').some((row) => row.run === run),
  )
  const [row] = logRows(writer.dataFolder, 'outgoing').filter((one) => one.run === run)
  assert.equal(row?.service, '')
  assert.equal(row?.status, 200)
})
