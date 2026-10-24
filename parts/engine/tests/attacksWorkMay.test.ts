import assert from 'node:assert/strict'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { RawWorker } from './workLink.ts'
import { done, person, seconds, tasksOf, untilAsync, worker, writerFor } from './workUse.ts'
import { notDropped } from './started.ts'

/** A service of the app that lets one call be under way at a time. */
const ledger = (description: Description): void => {
  description.services.ledger = {
    url: 'https://ledger.example',
    calls: { book: { method: 'POST', path: '/book', input: {} } },
    limits: { atOnce: 1 },
  }
}

/** The `may` of a call of the ledger, as a worker sends it before a call that it then never makes. */
const mayOf = (id: string, task: string, may: string) => ({
  t: 'call',
  id,
  task,
  what: 'may',
  may,
  service: 'ledger',
  call: 'book',
  key: `${task} ${may}`,
  nth: 0,
})

/** The answers of the writer that a worker holds, by the ids of its calls, in the order they came. */
const answeredIds = (one: RawWorker): string[] =>
  one.heard.filter((message) => message.t === 'answer').map((message) => String(message.id))

test('[51-11.14@8a] a worker that sends may for a call it never makes holds the place of atOnce only until its try ends: at its end, and at its loss, the place is freed', async (t) => {
  const { app, advance } = await writerFor(t, { change: [ledger] })
  const ada = await person(app(), 'Ada')
  const gpu = await worker(app(), { atOnce: 2 })
  for (let n = 0; n < 2; n++) notDropped(await app().start('thinkOnGpu', undefined, { as: ada }))
  await untilAsync('both tasks were handed out', () => tasksOf(gpu).length === 2)
  const [first, second] = tasksOf(gpu)
  for (const task of [first, second]) gpu.send({ t: 'started', task })
  // The first try takes the one place, and makes no call.
  gpu.send(mayOf('m1', first, 'p1'))
  await untilAsync('the first may was answered', () => answeredIds(gpu).includes('m1'))
  // The second waits for the place: a read sent after it is answered while it still waits.
  gpu.send(mayOf('m2', second, 'p2'))
  gpu.send({ t: 'call', id: 'r1', task: second, what: 'read', plan: { from: 'users' } })
  await untilAsync('the read was answered', () => answeredIds(gpu).includes('r1'))
  assert.equal(answeredIds(gpu).includes('m2'), false, 'the place of the first may was not held')
  // The first try ends with no `did`: its place is freed, and the second may is answered.
  await done(gpu, first, { text: 'Hello.' })
  await untilAsync('the second may was answered once the first try ended', () => answeredIds(gpu).includes('m2'))
  // The second try now holds the place, and is lost with its machine: the place is freed for the try after it.
  gpu.close()
  const again = await worker(app(), { id: '01m4x5y72ke6aay7szexb9d1d2' })
  // The writer finds the first machine silent by its clock, and hands the task of the lost try out again.
  for (let s = 0; s < 300 && tasksOf(again).length === 0; s++) await seconds(advance, 1, [again])
  assert.equal(tasksOf(again).length, 1, 'the lost task was handed out again')
  const [retried] = tasksOf(again)
  again.send({ t: 'started', task: retried })
  again.send(mayOf('m3', retried, 'p3'))
  await untilAsync('the may of the next try was answered once the lost try freed its place', () =>
    answeredIds(again).includes('m3'),
  )
  const answer = again.heard.find((message) => message.t === 'answer' && message.id === 'm3')
  assert.equal(Object(answer).ok, true, JSON.stringify(answer))
  again.close()
})
