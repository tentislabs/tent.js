import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fingerprintOf } from '../../core/internal.ts'
import type { App } from '../index.ts'
import { writeKey } from '../index.ts'
import { bundled, engineOf, portOf, send, system, testClock, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import type { RawWorker } from './workLink.ts'
import { here, joiningKeys, rawWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

/** Every address under `/_t/work` but the link, as a worker asks it, with a fingerprint and a task that may be none. */
const addressesOf = (fingerprint: string): { method: string; path: string }[] => [
  { method: 'GET', path: '/_t/work/versions' },
  { method: 'GET', path: `/_t/work/blob/${fingerprint}` },
  { method: 'GET', path: `/_t/work/file/${fingerprint}?task=01m4x5y72ke6aay7szexb9d1d1` },
  { method: 'POST', path: '/_t/work/file?task=01m4x5y72ke6aay7szexb9d1d1&kind=text/plain' },
  { method: 'POST', path: '/_t/work/file?task=01m4x5y72ke6aay7szexb9d1d1&carry=1' },
]

/** Asks every address of a worker, and the link, with a key or none: each must be as an address that is not there. */
async function noneFound(app: App, origin: string, fingerprint: string, key?: string): Promise<void> {
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {}
  for (const { method, path } of addressesOf(fingerprint)) {
    const answer = await app.request(
      new Request(`${origin}${path}`, { method, headers, ...(method === 'POST' ? { body: 'the bytes' } : {}) }),
    )
    assert.equal(answer.status, 404, `${method} ${path} with ${key ? 'a key' : 'no key'}`)
  }
  assert.throws(
    () => app.link(new Request(`${origin}/_t/work`, { headers })),
    `the link with ${key ? 'a key' : 'no key'}`,
  )
}

/** The fingerprint of a file of the running version, which a worker of the right key may fetch. */
function fileOfVersion(bundle: string): string {
  return fingerprintOf(readFileSync(join(bundle, 'description.json')))
}

test('[51-11.1@7b] /_t/work and each address under it, with no key, with a key the app does not let join, and over a connection that is not secure, are not found, and no work is sent', async (t) => {
  const { app, origin } = await writerOf(t)
  const bundle = await bundled(t, { project: 'working' })
  const fingerprint = fileOfVersion(bundle.folder)
  await noneFound(app, origin, fingerprint)
  await noneFound(app, origin, fingerprint, 'n'.repeat(40))
  // The key that the app lets join reaches them: so it is the key, and not the address, that is refused.
  const versions = await app.request(
    new Request(`${origin}/_t/work/versions`, { headers: { authorization: `Bearer ${joiningKeys.free}` } }),
  )
  assert.equal(versions.status, 200)
  // Work that waits for a worker is sent to none of them: it waits.
  const { run } = notDropped(await app.start('longOnGpu', { text: 'abc' }, { as: system }))
  assert.equal(app.runs.read(run)?.state, 'queued')
  // Over a connection that is not secure, an app that was not told `insecure` answers no address of a worker.
  const plainFolder = join(workFolder(t), 'plain')
  const plainBundle = await bundled(t, { project: 'working' }, plainFolder)
  await engineOf(t).open(plainBundle.folder, {
    dataFolder: join(plainFolder, 'data'),
    mode: 'test',
    workers: [joiningKeys.free],
  })
  const port = portOf(join(plainFolder, 'data'))
  for (const { method, path } of addressesOf(fingerprint)) {
    const answer = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: { authorization: `Bearer ${joiningKeys.free}` },
      ...(method === 'POST' ? { body: 'the bytes' } : {}),
    })
    assert.equal(answer.status, 404, `${method} ${path} over plain http`)
  }
})

/** A writer of the project of heavy work whose keys are rows, as `tent access key` makes them. */
async function keyedWriter(t: TestContext) {
  const { clock } = testClock()
  const bundle = await bundled(t, { project: 'working' })
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const dataFolder = join(workFolder(t), 'data')
  const app = await engine.open(bundle.folder, { dataFolder, mode: 'test', insecure: true })
  return { app, dataFolder, bundle: bundle.folder, origin: `http://localhost:${portOf(dataFolder)}` }
}

/** Removes a key through the admin channel of the app, as `tent access key remove` does. */
async function keyRemoved(app: App, origin: string, dataFolder: string, id: string): Promise<void> {
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(app, `${origin}/_t/admin/access-key`, {
    body: JSON.stringify({ args: { do: 'remove', name: id } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
}

/** Opens the link of a worker with a key, after it asked the versions as a worker does, and has it say `here`. */
async function joining(app: App, origin: string, key: string, said: object): Promise<RawWorker> {
  const versions = await fetch(`${origin}/_t/work/versions`, { headers: { authorization: `Bearer ${key}` } })
  assert.equal(versions.status, 200)
  const worker = rawWorker(app, key)
  worker.send(said)
  return worker
}

test('[51-11.1@8c] /_t/work and each address under it, with a key that lacks the right work, are not found', async (t) => {
  const { app, origin, bundle } = await keyedWriter(t)
  const fingerprint = fileOfVersion(bundle)
  // A key of the right work reaches the addresses, and has the app load the link of workers.
  const work = writeKey(app, { name: 'work', rights: ['work'] }).key
  const answer = await fetch(`${origin}/_t/work/versions`, { headers: { authorization: `Bearer ${work}` } })
  assert.equal(answer.status, 200)
  for (const rights of [['read'], ['push'], ['publish'], ['bundle'], ['copy'], ['far'], ['operate']])
    await noneFound(app, origin, fingerprint, writeKey(app, { name: rights.join(' '), rights }).key)
  await noneFound(app, origin, fingerprint, writeKey(app, { name: 'api', scopes: ['*'] }).key)
})

test("[51-11.4] a worker's key, taken, joins as the kinds it is bound to and no other, takes no more at once than it allows, is handed no data file, and is removed alone, its tasks handed out again", async (t) => {
  const { app, origin, dataFolder } = await keyedWriter(t)
  const taken = writeKey(app, { name: 'taken', rights: ['work'], work: { kinds: ['gpu'], atOnce: 1, workers: 1 } })
  const kept = writeKey(app, { name: 'kept', rights: ['work'] }).key
  for (const said of [
    here({ kinds: ['locked'] }),
    here({ kinds: ['gpu', 'any'] }),
    here({ kinds: ['gpu'], atOnce: 2 }),
  ]) {
    const worker = await joining(app, origin, taken.key, said)
    assert.deepEqual(await worker.next('no'), { t: 'no', code: 'T5109' }, JSON.stringify(said))
    await untilWithin(() => worker.closed(), 'the link was closed')
  }
  const thief = await joining(
    app,
    origin,
    taken.key,
    here({ id: '01m4x5y72ke6aay7szexb9d1d1', kinds: ['gpu'], atOnce: 1 }),
  )
  await thief.next('go')
  // No data file, no file of a task that is not its own, and no address of a reader.
  const asks = (path: string) => fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${taken.key}` } })
  const data = fingerprintOf(readFileSync(join(dataFolder, 'data.db')))
  assert.equal((await asks(`/_t/work/blob/${data}`)).status, 404, 'the data file')
  assert.equal((await asks(`/_t/work/file/${data}?task=01m4x5y72ke6aay7szexb9d1d9`)).status, 404, 'another task')
  assert.equal((await asks('/_t/copy/versions')).status, 404, 'an address of a reader')
  const versions = await thief.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    thief.send({ t: 'ready', version: Object(one).version })
  const { run } = notDropped(await app.start('longOnGpu', { text: 'abc' }, { as: system }))
  const task = String(Object((await thief.next('work')).task).id)
  thief.send({ t: 'started', task })
  // The worker of another key stands beside it, and stays when the taken key is removed.
  const other = await joining(app, origin, kept, here({ id: '01m4x5y72ke6aay7szexb9d1d2', kinds: ['gpu'] }))
  await other.next('go')
  await keyRemoved(app, origin, dataFolder, taken.row.id)
  thief.send({ t: 'alive', tasks: [task] })
  await untilWithin(() => thief.closed(), 'the worker of the taken key was let go')
  assert.equal(other.closed(), false, 'the worker of another key was let go too')
  const otherVersions = await other.next('versions')
  for (const one of Array.isArray(otherVersions.list) ? otherVersions.list : [])
    other.send({ t: 'ready', version: Object(one).version })
  const again = Object((await other.next('work')).task)
  assert.equal(again.run, run, 'the task of the taken key was handed out again')
  other.close()
})

test('[51-11.10] a worker that names every kind and atOnce 1000 in here is answered T5109 for what its key does not hold, and is handed nothing', async (t) => {
  const { app, origin } = await keyedWriter(t)
  const key = writeKey(app, { name: 'one', rights: ['work'], work: { kinds: ['gpu'], atOnce: 2 } }).key
  // Every kind that the project states.
  const kinds = ['gpu', 'locked']
  for (const said of [
    here({ kinds: [...kinds, 'any'], atOnce: 1000 }),
    here({ kinds: [...kinds, 'any'] }),
    here({ kinds: ['gpu'], atOnce: 1000 }),
  ]) {
    const worker = await joining(app, origin, key, said)
    assert.deepEqual(await worker.next('no'), { t: 'no', code: 'T5109' }, JSON.stringify(said))
    await untilWithin(() => worker.closed(), 'the link was closed')
    assert.equal(
      worker.heard.some((message) => message.t === 'work' || message.t === 'go'),
      false,
      JSON.stringify(worker.heard),
    )
  }
})
