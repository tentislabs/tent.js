import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { addUser, system } from './apps.ts'
import { untilWithin } from './flowing.ts'
import type { RawWorker } from './workLink.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

/** A project whose frames hold no more than a small value, so that a few rows travel as a file. */
const small = (description: Description): void => {
  description.project.limits = { ...Object(description.project.limits), inFrame: 200 }
}

const auth = { authorization: `Bearer ${joiningKeys.free}` }

/** Asks the writer a call under a task, and answers what it was answered. */
async function asked(worker: RawWorker, id: string, task: string, call: object): Promise<Record<string, unknown>> {
  worker.send({ t: 'call', id, task, ...call })
  for (;;) {
    const answer = await worker.next('answer')
    if (answer.id === id) return answer
  }
}

async function addMarks(app: Parameters<typeof readyWorker>[0], count: number): Promise<void> {
  for (let i = 0; i < count; i++)
    await app.call('addMark', { what: `mark ${i} of a list that is long` }, { as: system })
}

test('[51-4] rows travel with the task, small ones in it and large ones as a file that the worker fetches for its task alone', async (t) => {
  for (const [change, many] of [
    [undefined, 2],
    [small, 6],
  ] as const) {
    const { app, origin } = await writerOf(t, change ? { change } : {})
    const worker = await readyWorker(app, joiningKeys.free)
    await addMarks(app, many)
    await app.start('withRows', undefined, { as: system })
    const work = Object((await worker.next('work')).task)
    const rows = Object(work.rows).marks
    if (!change) {
      assert.equal(Array.isArray(rows) ? rows.length : -1, 2, 'small rows stand in the task')
      continue
    }
    const fingerprint = String(Object(rows).file)
    assert.ok(
      Array.isArray(work.files) && work.files.includes(fingerprint),
      'the file is named among the files of the task',
    )
    const fetched = await fetch(`${origin}/_t/work/file/${fingerprint}?task=${work.id}`, { headers: auth })
    assert.equal(fetched.status, 200)
    assert.equal(JSON.parse(await fetched.text()).length, 6)
    // For no task, and for one that is not out, it is not found.
    assert.equal((await fetch(`${origin}/_t/work/file/${fingerprint}`, { headers: auth })).status, 404)
    assert.equal((await fetch(`${origin}/_t/work/file/${fingerprint}?task=nothing`, { headers: auth })).status, 404)
    assert.equal((await fetch(`${origin}/_t/work/file/${fingerprint}?task=${work.id}`)).status, 404)
  }
})

test('[51-4] an answer past inFrame arrives as a file, and a result past inFrame is posted with carry and saved', async (t) => {
  const { app, origin } = await writerOf(t, { change: small })
  const worker = await readyWorker(app, joiningKeys.free)
  await addMarks(app, 6)
  const { run } = notDropped(await app.start('onGpu', { n: 2 }, { as: system }))
  const work = Object((await worker.next('work')).task)
  const read = await asked(worker, 'r1', work.id, { what: 'read', plan: { from: 'marks', limit: 10 } })
  assert.equal(read.ok, true)
  assert.equal(typeof read.file, 'string', 'a large answer stands in the frame')
  const fetched = await fetch(`${origin}/_t/work/file/${read.file}?task=${work.id}`, { headers: auth })
  assert.equal(JSON.parse(await fetched.text()).length, 6)
  const result = { words: 'a result that is larger than one frame may hold, '.repeat(10) }
  const posted = await fetch(`${origin}/_t/work/file?task=${work.id}&carry=1`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    body: JSON.stringify(result),
  })
  assert.equal(posted.status, 200)
  const { id } = Object(Object(await posted.json()).value)
  worker.send({ t: 'started', task: work.id })
  worker.send({ t: 'done', task: work.id, file: id, cpuMs: 1 })
  await worker.next('saved')
  assert.deepEqual(await app.runs.wait(run), result)
})

test('[51-4] [51-11.5] [51-11.16] a file that the work makes is stored under a name of the engine own, and a progress that names a file its task did not post and its caller may not download is T2104', async (t) => {
  const { app, origin, dataFolder } = await writerOf(t)
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  const ada = await addUser(app, 'Ada')
  const bo = await addUser(app, 'Bo')
  await app.start('onLocked', { what: 'one' }, { as: ada })
  const work = Object((await worker.next('work')).task)
  const posted = await fetch(
    `${origin}/_t/work/file?task=${work.id}&name=${encodeURIComponent('../../etc/passwd')}&kind=text/plain`,
    {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/octet-stream' },
      body: 'what the work made',
    },
  )
  assert.equal(posted.status, 200)
  const { id } = Object(Object(await posted.json()).value)
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  const row = data.prepare('SELECT name FROM _t_files WHERE id = ?').get(id)
  data.close()
  assert.ok(!String(row?.name).includes('/') && !String(row?.name).includes('passwd'), `stored as ${row?.name}`)
  // A file of another caller, which the caller of this task may not download.
  const other = await app.call('keepNote', { text: 'not for Ada' }, { as: bo })
  worker.send({ t: 'progress', task: work.id, n: 1, value: { at: 1 }, files: [String(other)] })
  assert.equal((await worker.next('refused')).code, 'T2104')
  worker.send({ t: 'progress', task: work.id, n: 2, value: { at: 2 }, files: [id] })
  assert.equal((await worker.next('saved')).n, 2)
  await untilWithin(() => true, 'nothing')
})
