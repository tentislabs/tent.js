import assert from 'node:assert/strict'
import test from 'node:test'
import { addUser } from './apps.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'

const moment = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

test('[51-6] [51-11.6] two entries of two callers are each handed the rows of their own caller; a read from inside the batch that names no entry is T0013, and one under an entry is held to that entry caller', async (t) => {
  const { app } = await writerOf(t)
  const ada = await addUser(app, 'Ada')
  const bo = await addUser(app, 'Bo')
  await app.call('addNote', { title: 'of Ada' }, { as: ada })
  await app.call('addNote', { title: 'of Bo, one' }, { as: bo })
  await app.call('addNote', { title: 'of Bo, two' }, { as: bo })
  // Both calls wait while no worker is joined, and go out as one batch.
  const calls = [app.call('notesOf', { n: 1 }, { as: ada }), app.call('notesOf', { n: 2 }, { as: bo })]
  await moment()
  const worker = await readyWorker(app, joiningKeys.free, ['gpu'])
  const work = await worker.next('work')
  const task: Record<string, unknown> = Object(work.task)
  const entries: Record<string, unknown>[] = Array.isArray(task.entries) ? task.entries.map((one) => Object(one)) : []
  assert.equal(entries.length, 2, 'the two calls are one batch')
  const titles = entries.map((one) =>
    (Array.isArray(Object(one.rows).notes) ? Object(one.rows).notes : []).map((row: unknown) => Object(row).title),
  )
  assert.deepEqual(titles, [['of Ada'], ['of Bo, one', 'of Bo, two']])
  const id = String(task.id)
  worker.send({ t: 'started', task: id })
  worker.send({ t: 'call', id: 'c1', task: id, what: 'read', plan: { from: 'notes' } })
  const none = await worker.next('answer')
  assert.equal(Object(none.error).code, 'T0013')
  // Asked under the entry of Ada, the read answers what Ada may read, and nothing of Bo.
  worker.send({ t: 'call', id: 'c2', task: id, entry: 0, what: 'read', plan: { from: 'notes' } })
  const under = await worker.next('answer')
  assert.deepEqual(
    (Array.isArray(under.value) ? under.value : []).map((row: unknown) => Object(row).title),
    ['of Ada'],
  )
  worker.send({
    t: 'done',
    task: id,
    results: [
      { ok: true, value: 1 },
      { ok: true, value: 2 },
    ],
    cpuMs: 1,
  })
  assert.deepEqual(await Promise.all(calls), [1, 2])
  worker.close()
})
