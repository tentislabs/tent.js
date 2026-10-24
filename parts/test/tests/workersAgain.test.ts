import assert from 'node:assert/strict'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import { beats, heavyWith, joined, heavyMoment, system, untilAsync, workingOn } from './heavyApps.ts'
import { notDropped } from './started.ts'

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

test('[51-5] a run that is stopped ends the work on the worker at its next alive', async (t) => {
  const app = await heavyWith(t)
  const worker = await joined(t, app, ['gpu'])
  const { run } = notDropped(await app.start('onGpu', { n: 2 }, system))
  await untilAsync('the task is out', () => workingOn(worker).includes(run))
  app.runs.stop(run)
  await beats(app, 2)
  await untilAsync('the worker ended the work', () => workingOn(worker).length === 0)
  assert.equal(app.runs.read(run)?.state, 'stopped')
})

test('[51-5] a work message does not leave before the write of its hand-out is settled: with a reader that is held, nothing is handed out', async (t) => {
  const app = await heavyWith(t)
  // The worker first: the writer is opened again with the keys of its workers, and the reader joins that writer.
  const worker = await joined(t, app, ['gpu'])
  const reader = await app.reader()
  await untilAsync('the reader is current', () => reader.at().current === true)
  reader.hold()
  const { run } = notDropped(await app.start('onGpu', { n: 3 }, system))
  await heavyMoment(300)
  assert.deepEqual(workingOn(worker), [], 'a task was handed out on a write that the reader did not hold')
  reader.release()
  assert.equal(await app.runs.wait(run), 9)
})

test('[51-5] a task that waited in the queue when the writer was closed is taken up again at the opening, with no try counted', async (t) => {
  const app = await heavyWith(t)
  const { run } = notDropped(await app.start('onGpu', { n: 4 }, system))
  await untilAsync('the step waits for a worker', () =>
    app.work().some((one) => Reflect.get(Object(one), 'kind') === 'gpu' && Reflect.get(Object(one), 'waiting') === 1),
  )
  await app.restart()
  const worker = await joined(t, app, ['gpu'])
  await untilAsync('the task is out', () => workingOn(worker).includes(run))
  assert.equal(worker.at().working[0]?.try, 1)
  assert.equal(await app.runs.wait(run), 16)
})

test('[51-5] a link that is cut with no close: the worker is back within the window, takes its id over, and its task is carried out once', async (t) => {
  const app = await heavyWith(t)
  const worker = await joined(t, app, ['gpu'])
  const { run } = notDropped(await app.start('onGpu', { n: 5 }, system))
  await untilAsync('the task is out', () => workingOn(worker).includes(run))
  worker.cut()
  await beats(app, 2)
  worker.join()
  await beats(app, 2)
  assert.equal(await app.runs.wait(run), 25)
  assert.deepEqual(
    app.runs.read(run)?.steps.map((one) => [one.name, one.state]),
    [['square', 'done']],
  )
})

test('[51-2] [51-5] a call of an action whose caller is answered T0008 before its task was handed out has its run stopped; one that waited in the queue when the writer stopped is stopped at the opening', async (t) => {
  const app = await heavyWith(t)
  const late = await refusal(app.call('encodeOnSlow', { n: 1 }, system))
  assert.equal(late.code, 'T0008')
  const run = String(Object(late.fields).run)
  await untilAsync('the run is stopped', () => app.runs.read(run)?.state === 'stopped')
  const waiting = app.call('encodeNarrow', { n: 2 }, system)
  waiting.catch(() => undefined)
  await untilAsync('the call waits', () => app.runs.find({ flow: 'encodeNarrow' }).length === 1)
  const [queued] = app.runs.find({ flow: 'encodeNarrow' })
  await app.restart()
  await untilAsync('the run that waited is stopped', () => app.runs.read(queued.id)?.state === 'stopped')
})
