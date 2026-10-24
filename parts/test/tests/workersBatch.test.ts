import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import type { TestApp, TestWorker } from '../index.ts'
import { beats, heavyWith, joined, heavyMoment, system, untilAsync, workingOn } from './heavyApps.ts'
import { notDropped } from './started.ts'

/** What each call was answered, or the code of its error. */
const settled = (calls: Promise<unknown>[]): Promise<unknown[]> =>
  Promise.all(
    calls.map((one) =>
      one.then(
        (value) => value,
        (error: unknown) => (error instanceof TentError ? error.code : String(error)),
      ),
    ),
  )

/** A worker of gpu that holds one task at a time, kept busy with a step until ten calls wait behind it. */
async function busy(t: TestContext): Promise<{ app: TestApp; worker: TestWorker }> {
  const app = await heavyWith(t)
  const worker = await joined(t, app, ['gpu'])
  const { run } = notDropped(await app.start('onGpu', { n: 1 }, system))
  await untilAsync('the worker is busy', () => workingOn(worker).includes(run))
  return { app, worker }
}

/** Ten calls of an action, made while the worker is busy, with the numbers 1 to 10. */
const tenCalls = (app: TestApp, name: string): Promise<unknown[]> =>
  settled(Array.from({ length: 10 }, (_, i) => app.call(name, { n: i + 1 }, system)))

test('[51-6] ten calls of an action that states batch, made while the worker is busy, are carried out as one task, and each caller is answered its own entry, or the error of its own entry alone', async (t) => {
  const { app } = await busy(t)
  const answers = await tenCalls(app, 'sized')
  assert.deepEqual(answers, [10, 10, 'T0009', 10, 10, 10, 10, 10, 10, 10])
  // A lone call is carried out at once, as a batch of one.
  assert.equal(await app.call('sized', { n: 1 }, system), 1)
})

test('[51-6] with a wait, a batch that is not full is held back that long and no longer', async (t) => {
  const app = await heavyWith(t)
  await joined(t, app, ['gpu'])
  const first = app.call('sizedLater', { n: 1 }, system)
  await heavyMoment(100)
  const second = app.call('sizedLater', { n: 2 }, system)
  await heavyMoment(100)
  let answered = false
  void first.then(() => {
    answered = true
  })
  await heavyMoment(100)
  assert.equal(answered, false, 'the batch did not wait')
  await beats(app, 3)
  assert.deepEqual(await settled([first, second]), [2, 2])
})

test('[51-6] with measure, a batch holds no more than max of the sum of that field', async (t) => {
  const { app } = await busy(t)
  const answers = await settled([1, 2, 3, 4, 5, 6].map((n) => app.call('sizedByN', { n }, system)))
  // 1 + 2 + 3 + 4 make ten; 5 and 6 together would pass it, so each is a batch of its own.
  assert.deepEqual(answers, [4, 4, 4, 4, 1, 1])
})

test('[51-6] an answer that is no list of the length it was handed is T0009 for each entry; a batch that throws fails each, and with split only the entry that throws fails', async (t) => {
  const { app } = await busy(t)
  assert.deepEqual(await tenCalls(app, 'shortList'), Array(10).fill('T0009'))
  const { app: other } = await busy(t)
  const thrown = await tenCalls(other, 'breaks')
  assert.ok(
    thrown.every((one) => typeof one === 'string' && /^T/.test(one)),
    `each failed: ${thrown}`,
  )
  const { app: third } = await busy(t)
  const split = await tenCalls(third, 'breaksSplit')
  assert.deepEqual(split, [1, 2, 'T0009', 4, 5, 6, 7, 8, 9, 10])
})

test('[51-6] a batch that was lost is carried out again, each entry under its own next try', async (t) => {
  const { app, worker } = await busy(t)
  const calls = tenCalls(app, 'sized')
  await untilAsync('the batch is out', () => workingOn(worker).some((run) => app.runs.read(run)?.flow === 'sized'), 600)
  await worker.kill()
  await worker.restart()
  const answers = await calls
  assert.deepEqual(answers, [10, 10, 'T0009', 10, 10, 10, 10, 10, 10, 10])
})

test('[51-6] with no worker a batch is carried out where the call would be', async (t) => {
  const app = await heavyWith(t)
  assert.equal(await app.call('sizedHere', { n: 4 }, system), 40)
})
