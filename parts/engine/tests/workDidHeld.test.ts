import assert from 'node:assert/strict'
import test from 'node:test'
import type { RawWorker } from './workLink.ts'
import { amountOf, countsOf, person, tasksOf, untilAsync, worker, writerFor } from './workUse.ts'
import { notDropped } from './started.ts'

/** Asks the writer one call of a task, as a worker does, and answers its answer. */
async function asked(one: RawWorker, id: string, task: string, call: object): Promise<Record<string, unknown>> {
  one.send({ t: 'call', id, task, ...call })
  for (;;) {
    const answer = await one.next('answer')
    if (answer.id === id) return answer
  }
}

/** The `did` of the model call of the `may` it names, with a key and a place. */
const didOf = (may: string, key: string, nth: number) => ({
  what: 'did',
  may,
  model: 'thinker',
  answeredBy: 'thinker',
  call: 'reply',
  key,
  nth,
  ok: true,
  units: { tokensIn: 3, tokensOut: 5 },
  ms: 40,
})

test('[51-13] the writer holds a did to the may it answered by its key and its nth: a did of another key or place, or of no may, is refused, and nothing of it is kept', async (t) => {
  const { app } = await writerFor(t)
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app())
  notDropped(await app().start('thinkOnGpu', undefined, { as: ada }))
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
    nth: 0,
  })
  assert.equal(may.ok, true, JSON.stringify(may))
  const caller = `user:${ada.user?.id}`
  const counted = async (): Promise<number> => amountOf(await countsOf(app()), 'tokensOut', { name: 'thinker', caller })
  for (const [id, did] of [
    ['m2', didOf('p1', 'other', 0)],
    ['m3', didOf('p1', 'k', 1)],
    ['m4', didOf('p9', 'k', 0)],
  ] as const) {
    const refused = await asked(gpu, id, task, did)
    assert.equal(refused.ok, false, `${id}: ${JSON.stringify(refused)}`)
  }
  assert.equal(await counted(), 0, 'nothing of a refused did is counted')
  const did = await asked(gpu, 'm5', task, didOf('p1', 'k', 0))
  assert.equal(did.ok, true, JSON.stringify(did))
  assert.equal(await counted(), 5)
  gpu.close()
})
