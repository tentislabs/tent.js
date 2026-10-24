import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { addUser } from './apps.ts'
import { joiningKeys, readyWorker, writerOf } from './workLink.ts'
import { workMoment } from './workUse.ts'

/** A project whose loose files are looked for a second after they became loose. */
const quick = (description: Description): void => {
  description.project.limits = { ...Object(description.project.limits), looseKept: 1000 }
}

const auth = { authorization: `Bearer ${joiningKeys.free}` }

test("[25-16] [51-4] a file that the progress of a task on a worker names is kept with the progress: the step's next task reads it by the same door after the loose files were looked for", async (t) => {
  const { app, origin, advance, dataFolder } = await writerOf(t, { change: quick })
  const worker = await readyWorker(app, joiningKeys.free, ['locked'])
  const ada = await addUser(app, 'Ada')
  await app.start('onLocked', { what: 'one' }, { as: ada })
  const first = Object((await worker.next('work')).task)
  worker.send({ t: 'started', task: first.id })
  // What Python keeps on a worker: the value it saved, and the file each path of the folder of its call names.
  const posted = await fetch(`${origin}/_t/work/file?task=${first.id}&kind=text/plain`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/octet-stream' },
    body: 'half of the work',
  })
  const { id } = Object(Object(await posted.json()).value)
  const path = '/work/made.txt'
  worker.send({
    t: 'progress',
    task: first.id,
    n: 1,
    value: { value: { file: path }, files: { [path]: id } },
    files: [],
  })
  assert.equal((await worker.next('saved')).n, 1)
  // The loose files are looked for once more than `looseKept` has passed, and the task is handed back.
  // The worker stays alive while the clock passes the next beat of the upkeep.
  for (let i = 0; i < 65; i++) {
    advance(1000)
    worker.send({ t: 'alive', tasks: [String(first.id)] })
    await workMoment()
  }
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  const swept = data.prepare('SELECT removedAt FROM _t_files WHERE id = ?').get(id)
  data.close()
  assert.ok(swept?.removedAt, 'the file the worker posted was looked for as loose, and is removed')
  worker.send({ t: 'back', tasks: [first.id], cpuMs: {} })
  const next = Object((await worker.next('work')).task)
  const kept = String(Object(Object(next.progress).value).files[path])
  const read = await fetch(`${origin}/_t/work/file/${encodeURIComponent(kept)}?task=${next.id}`, { headers: auth })
  assert.equal(read.status, 200, `the file of the progress, ${kept}, is read by the next task`)
  assert.equal(await read.text(), 'half of the work')
  worker.close()
})
