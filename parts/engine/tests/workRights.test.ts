import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { App } from '../index.ts'
import { writeKey } from '../index.ts'
import { bundled, engineOf, portOf, send, system, testClock, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import { here, rawWorker } from './workLink.ts'
import { notDropped } from './started.ts'

/** A writer of the project of heavy work that lets no worker join by `workers` of `open`: its keys are rows. */
async function keyedWriter(t: TestContext, change?: (description: Description) => void) {
  const { clock } = testClock()
  const bundle = await bundled(t, { project: 'working', ...(change ? { change } : {}) })
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', insecure: true })
  return { app, dataFolder, origin: `http://localhost:${portOf(dataFolder)}` }
}

/** Sends `access-key` to the admin channel of the app, as `tent access key` does, and answers its value. */
async function admin(dataFolder: string, app: App, origin: string, args: object): Promise<Record<string, unknown>> {
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(app, `${origin}/_t/admin/access-key`, {
    body: JSON.stringify({ args }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  return Object(answered.body.value)
}

/** Opens the link of a worker with a key, after the writer took the key in: its versions answer first. */
async function joinedWith(app: Parameters<typeof rawWorker>[0], origin: string, key: string) {
  const versions = await fetch(`${origin}/_t/work/versions`, { headers: { authorization: `Bearer ${key}` } })
  assert.equal(versions.status, 200)
  return rawWorker(app, key)
}

test('[51-9] a worker joins with a key that holds the right work, and with no other: a key of another right, of the API or of a reader is not found', async (t) => {
  const { app, origin } = await keyedWriter(t)
  const work = writeKey(app, { name: 'work', rights: ['work'] }).key
  const others = [
    writeKey(app, { name: 'reads', rights: ['read'] }).key,
    writeKey(app, { name: 'near', rights: ['copy'] }).key,
    writeKey(app, { name: 'api', scopes: ['*'] }).key,
  ]
  for (const key of others) {
    const answer = await fetch(`${origin}/_t/work/versions`, { headers: { authorization: `Bearer ${key}` } })
    assert.equal(answer.status, 404, 'a key that lacks the right work')
    assert.throws(() =>
      app.link(new Request('http://localhost/_t/work', { headers: { authorization: `Bearer ${key}` } })),
    )
  }
  const worker = await joinedWith(app, origin, work)
  worker.send(here({ kinds: ['gpu'] }))
  assert.equal((await worker.next('go')).t, 'go')
  worker.close()
})

test('[51-9] a key bound to one kind is answered no with T5109 where its worker states another or more at once than it may, and a second worker under a key bound to one is answered no and does not close the first', async (t) => {
  const { app, origin } = await keyedWriter(t)
  const key = writeKey(app, { name: 'gpu', rights: ['work'], work: { kinds: ['gpu'], atOnce: 2, workers: 1 } }).key
  const refused = async (said: object): Promise<void> => {
    const worker = await joinedWith(app, origin, key)
    worker.send(said)
    assert.deepEqual(await worker.next('no'), { t: 'no', code: 'T5109' }, JSON.stringify(said))
    await untilWithin(() => worker.closed(), 'the link was closed')
  }
  await refused(here({ kinds: ['locked'] }))
  await refused(here({ kinds: ['gpu', 'any'] }))
  await refused(here({ kinds: ['gpu'], atOnce: 3 }))
  const first = await joinedWith(app, origin, key)
  first.send(here({ id: '01m4x5y72ke6aay7szexb9d1d1', kinds: ['gpu'], atOnce: 2 }))
  await first.next('go')
  await refused(here({ id: '01m4x5y72ke6aay7szexb9d1d2', kinds: ['gpu'] }))
  assert.equal(first.closed(), false, 'the first worker under the key was closed')
  first.close()
})

test('[51-9] a key of the right work that states nothing more takes one worker of any kind, and one that states two workers takes two', async (t) => {
  const { app, origin } = await keyedWriter(t)
  const plain = writeKey(app, { name: 'plain', rights: ['work'] }).key
  const two = writeKey(app, { name: 'two', rights: ['work'], work: { workers: 2 } }).key
  const one = await joinedWith(app, origin, plain)
  one.send(here({ id: '01m4x5y72ke6aay7szexb9d1d1', kinds: ['gpu', 'locked', 'any'], atOnce: 50 }))
  await one.next('go')
  const second = await joinedWith(app, origin, plain)
  second.send(here({ id: '01m4x5y72ke6aay7szexb9d1d2' }))
  assert.deepEqual(await second.next('no'), { t: 'no', code: 'T5109' })
  const a = await joinedWith(app, origin, two)
  a.send(here({ id: '01m4x5y72ke6aay7szexb9d1d3' }))
  await a.next('go')
  const b = await joinedWith(app, origin, two)
  b.send(here({ id: '01m4x5y72ke6aay7szexb9d1d4' }))
  await b.next('go')
  for (const worker of [one, a, b]) worker.close()
})

test('[51-9] tent access key add --right work binds the key to --kinds, --at-once and --workers', async (t) => {
  const { app, origin, dataFolder } = await keyedWriter(t)
  const made = await admin(dataFolder, app, origin, {
    do: 'add',
    name: 'gpus',
    right: 'work',
    kinds: 'gpu',
    atOnce: 4,
    workers: 1,
  })
  const key = String(made.key)
  const worker = await joinedWith(app, origin, key)
  worker.send(here({ kinds: ['gpu'], atOnce: 5 }))
  assert.deepEqual(await worker.next('no'), { t: 'no', code: 'T5109' })
  const fits = await joinedWith(app, origin, key)
  fits.send(here({ kinds: ['gpu'], atOnce: 4 }))
  await fits.next('go')
  fits.close()
})

test('[51-9] keys.add takes work only on a key of the right work, with kinds, atOnce and workers that fit', async (t) => {
  const { app } = await keyedWriter(t)
  for (const work of [
    { kinds: 'gpu' },
    { kinds: ['gpu', ''] },
    { atOnce: 0 },
    { atOnce: 1.5 },
    { workers: 0 },
    { other: 1 },
    'gpu',
  ]) {
    const error = (() => {
      try {
        writeKey(app, { name: 'bad', rights: ['work'], work })
      } catch (thrown) {
        return thrown
      }
      return undefined
    })()
    assert.equal(Reflect.get(Object(error), 'code'), 'T0002', JSON.stringify(work))
  }
  assert.throws(
    () => writeKey(app, { name: 'bad', rights: ['read'], work: { workers: 2 } }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0002',
  )
})

test('[51-9] with its key a worker is handed no data file, no file that no task of its own names, and no link of a reader', async (t) => {
  const { app, origin, dataFolder } = await keyedWriter(t)
  const key = writeKey(app, { name: 'work', rights: ['work'] }).key
  const worker = await joinedWith(app, origin, key)
  worker.send(here({ kinds: ['gpu'] }))
  await worker.next('go')
  const asks = (path: string) => fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${key}` } })
  const data = fingerprintOf(readFileSync(join(dataFolder, 'data.db')))
  assert.equal((await asks(`/_t/work/blob/${data}`)).status, 404, 'the data file')
  assert.equal((await asks(`/_t/work/file/${data}?task=not-a-task`)).status, 404, 'a file that no task names')
  assert.equal((await asks('/_t/copy/versions')).status, 404, 'an address of a reader')
  assert.throws(() =>
    app.link(new Request('http://localhost/_t/copy', { headers: { authorization: `Bearer ${key}` } })),
  )
  worker.close()
})

test('[51-9] the files that a worker of a key of the right work posts past workHeld are T0005', async (t) => {
  const { app, origin } = await keyedWriter(t, (description) => {
    description.project.limits = { ...Object(description.project.limits), workHeld: 100 }
  })
  const key = writeKey(app, { name: 'work', rights: ['work'] }).key
  const worker = await joinedWith(app, origin, key)
  worker.send(here({ kinds: ['gpu'] }))
  await worker.next('go')
  const versions = await worker.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    worker.send({ t: 'ready', version: Object(one).version })
  await app.start('longOnGpu', { text: 'abc' }, { as: system })
  const task = String(Object((await worker.next('work')).task).id)
  worker.send({ t: 'started', task })
  const post = (body: string) =>
    fetch(`${origin}/_t/work/file?task=${task}&kind=text/plain`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/octet-stream' },
      body,
    })
  assert.equal((await post('x'.repeat(60))).status, 200)
  assert.equal(Object(Object(await (await post('y'.repeat(60))).json()).error).code, 'T0005')
  worker.close()
})

test('[51-9] a worker whose key is removed is let go alone, and its tasks are handed out again', async (t) => {
  const { app, origin, dataFolder } = await keyedWriter(t)
  const gone = writeKey(app, { name: 'gone', rights: ['work'] })
  const stays = writeKey(app, { name: 'stays', rights: ['work'] }).key
  const ready = async (key: string, id: string) => {
    const worker = await joinedWith(app, origin, key)
    worker.send(here({ id, kinds: ['gpu'] }))
    await worker.next('go')
    const versions = await worker.next('versions')
    for (const one of Array.isArray(versions.list) ? versions.list : [])
      worker.send({ t: 'ready', version: Object(one).version })
    return worker
  }
  const first = await ready(gone.key, '01m4x5y72ke6aay7szexb9d1d1')
  const { run } = notDropped(await app.start('longOnGpu', { text: 'abc' }, { as: system }))
  const task = String(Object((await first.next('work')).task).id)
  first.send({ t: 'started', task })
  await admin(dataFolder, app, origin, { do: 'remove', name: gone.row.id })
  first.send({ t: 'alive', tasks: [task] })
  await untilWithin(() => first.closed(), 'the worker of the key that was removed was let go')
  const other = await ready(stays, '01m4x5y72ke6aay7szexb9d1d2')
  const again = Object((await other.next('work')).task)
  assert.equal(again.run, run, 'the task of the run is handed to the worker of the other key')
  other.close()
})
