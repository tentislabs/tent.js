import assert from 'node:assert/strict'
import { test } from 'node:test'
import { system } from './apps.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

test('[51-5] a hand-out whose work never arrived is sent again under the same task and try when its worker joins', async (t) => {
  const { app } = await writerOf(t)
  const first = await readyWorker(app, joiningKeys.free)
  const { run } = notDropped(await app.start('onGpu', { n: 3 }, { as: system }))
  const sent = Object((await first.next('work')).task)
  first.close()
  // The same worker joins again, and names no task: nothing of it ever said that it had the work.
  const again = await readyWorker(app, joiningKeys.free)
  const resent = Object((await again.next('work')).task)
  assert.deepEqual([resent.id, resent.try], [sent.id, sent.try])
  again.send({ t: 'started', task: resent.id })
  again.send({ t: 'done', task: resent.id, result: 9, cpuMs: 1 })
  await again.next('saved')
  assert.equal(await app.runs.wait(run), 9)
})

test('[51-3] a task that did not say started within workFetch is taken back, lost by the worker word, and handed out again under the next try', async (t) => {
  const { app, advance } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free)
  await app.start('onGpu', { n: 4 }, { as: system })
  const first = Object((await worker.next('work')).task)
  // The worker says that it is alive every beat while the clock moves on past workFetch.
  for (let ms = 0; ms <= 10 * 60_000; ms += 1000) {
    worker.send({ t: 'alive', tasks: [first.id] })
    await new Promise((done) => setImmediate(done))
    advance(1000)
  }
  const second = Object((await worker.next('work')).task)
  assert.notEqual(second.id, first.id)
  assert.equal(second.try, Number(first.try) + 1)
})
