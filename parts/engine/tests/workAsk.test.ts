import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import { addUser, system } from './apps.ts'
import { untilWithin } from './flowing.ts'
import type { RawWorker } from './workLink.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

/** Asks the writer a call under a task, and answers what it was answered. */
async function asked(worker: RawWorker, id: string, task: string, call: object): Promise<Record<string, unknown>> {
  worker.send({ t: 'call', id, task, ...call })
  for (;;) {
    const answer = await worker.next('answer')
    if (answer.id === id) return answer
  }
}

test('[51-4] what work on a worker asks is carried out as the caller of its run: a query that caller may not call is refused, and a read is answered by the rules of that caller', async (t) => {
  const { app } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  const ada: Caller = await addUser(app, 'Ada')
  await app.call('addMark', { what: 'one' }, { as: ada })
  await app.start('onLocked', { what: 'two' }, { as: ada })
  const work = Object((await worker.next('work')).task)
  assert.equal(Object(work.as).kind, 'user')
  const refused = await asked(worker, 'q1', work.id, { what: 'do', name: 'allMarks', input: {} })
  assert.equal(refused.ok, false, 'a query that the caller of the run may not call was answered')
  const read = await asked(worker, 'r1', work.id, { what: 'read', plan: { from: 'marks', limit: 10 } })
  assert.equal(read.ok, true)
})

test('[51-4] code that states uses is held to it: a function and a member of a handle that it does not name are T0013, and a call of a change sent a second time under its id is answered what the first was and carried out once', async (t) => {
  const { app } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  const ada = await addUser(app, 'Ada')
  await app.start('onLocked', { what: 'two' }, { as: ada })
  const work = Object((await worker.next('work')).task)
  const unnamed = await asked(worker, 'u1', work.id, { what: 'handle', handle: 'mail', member: 'send', args: [{}] })
  assert.equal(Object(unnamed.error).code, 'T0013')
  const other = await asked(worker, 'u2', work.id, { what: 'do', name: 'addUser', input: { name: 'Bo', roles: [] } })
  assert.equal(Object(other.error).code, 'T0013')
  const first = await asked(worker, 'm1', work.id, { what: 'do', name: 'addMark', input: { what: 'once' } })
  const second = await asked(worker, 'm1', work.id, { what: 'do', name: 'addMark', input: { what: 'once' } })
  assert.deepEqual(second, first)
  const marks = (await app.call('allMarks', {}, { as: system })) as unknown[]
  assert.equal(marks.filter((one) => Object(one).what === 'once').length, 1)
})

test('[51-4] a kind that states systemWork false is handed no task that runs as the system, and none of code that states no uses: each fails with T0013', async (t) => {
  const { app } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  const ada = await addUser(app, 'Ada')
  const { run: asSystem } = notDropped(await app.start('onLockedSystem', undefined, { as: system }))
  const { run: unsaid } = notDropped(await app.start('onLockedNoUses', undefined, { as: ada }))
  for (const run of [asSystem, unsaid]) {
    await untilWithin(() => app.runs.read(run)?.state === 'failed', `the run ${run} failed`)
    assert.equal(app.runs.read(run)?.error?.code, 'T0013')
  }
  assert.equal(worker.heard.filter((one) => one.t === 'work').length, 0, 'such a task was handed out')
})

test('[51-4] a step whose task would pass taskSize is carried out on a thread where it states background alone, and fails with T5102 where it states a kind of worker', async (t) => {
  const { app } = await writerOf(t, {
    change: (description) => {
      description.project.limits = { ...Object(description.project.limits), taskSize: 2048 }
    },
  })
  const worker = await readyWorker(app, joiningKeys.free, ['gpu', 'any'])
  const text = 'x'.repeat(4000)
  const { run: here } = notDropped(await app.start('longHere', { text }, { as: system }))
  assert.equal(await app.runs.wait(here), 4000)
  const { run: gpu } = notDropped(await app.start('longOnGpu', { text }, { as: system }))
  await untilWithin(() => app.runs.read(gpu)?.state === 'failed', 'the run failed')
  assert.equal(app.runs.read(gpu)?.error?.code, 'T5102')
  assert.match(String(app.runs.read(gpu)?.error?.message), /taskSize/)
  assert.equal(worker.heard.filter((one) => one.t === 'work').length, 0, 'such a task was handed out')
})
