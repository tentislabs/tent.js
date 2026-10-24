import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { bundled, engineOf, system, workFolder } from './apps.ts'
import { untilWithin } from './flowing.ts'
import { here, joiningKeys, rawWorker, writerOf } from './workLink.ts'
import { notDropped } from './started.ts'

test('[51-2] a worker of another major version, one that names a kind the project or its key does not hold, one that asks for more at once than its key allows, and one more than its key allows joined are answered no with T5109; the first worker under the key is not closed', async (t) => {
  const { app } = await writerOf(t)
  const refused = async (key: string, said: object): Promise<void> => {
    const worker = rawWorker(app, key)
    worker.send(said)
    assert.deepEqual(await worker.next('no'), { t: 'no', code: 'T5109' }, JSON.stringify(said))
    await untilWithin(() => worker.closed(), 'the link was closed')
  }
  await refused(joiningKeys.free, here({ engine: '2.0.0' }))
  await refused(joiningKeys.free, here({ kinds: ['tpu'] }))
  await refused(joiningKeys.gpuOnly, here({ kinds: ['locked'] }))
  await refused(joiningKeys.gpuOnly, here({ kinds: ['gpu'], atOnce: 2 }))
  const first = rawWorker(app, joiningKeys.single)
  first.send(here({ id: '01m4x5y72ke6aay7szexb9d1d1' }))
  await first.next('go')
  await refused(joiningKeys.single, here({ id: '01m4x5y72ke6aay7szexb9d1d2' }))
  assert.equal(first.closed(), false, 'the first worker under the key was closed')
})

test('[51-2] a second worker under the machine id of one whose link is alive is answered other-id', async (t) => {
  const { app } = await writerOf(t)
  const first = rawWorker(app, joiningKeys.free)
  first.send(here())
  await first.next('go')
  const copy = rawWorker(app, joiningKeys.free)
  copy.send(here())
  assert.deepEqual(await copy.next('other-id'), { t: 'other-id' })
  assert.equal(first.closed(), false)
})

test('[51-11.1] the addresses of a worker are not found with no key, with a key that the app does not let join, and over a connection that is not secure', async (t) => {
  const { app, origin } = await writerOf(t)
  const asked = (key?: string, address = `${origin}/_t/work/versions`) =>
    app.request(new Request(address, key ? { headers: { authorization: `Bearer ${key}` } } : {}))
  assert.equal((await asked()).status, 404)
  assert.equal((await asked('n'.repeat(40))).status, 404)
  assert.equal((await asked(joiningKeys.free)).status, 200)
  assert.equal((await asked(undefined, `${origin}/_t/work/blob/00`)).status, 404)
  assert.throws(() => app.link(new Request('http://localhost/_t/work')))
  // An app that was not told `insecure` takes no worker over a connection that is not secure.
  const plainFolder = join(workFolder(t), 'plain')
  const bundle = await bundled(t, { project: 'working' }, plainFolder)
  const plain = await engineOf(t).open(bundle.folder, {
    dataFolder: join(plainFolder, 'data'),
    mode: 'test',
    workers: [joiningKeys.free],
  })
  const port = Number(JSON.parse(readFileSync(join(plainFolder, 'data', 'engine.json'), 'utf8')).port)
  const answer = await fetch(`http://localhost:${port}/_t/work/versions`, {
    headers: { authorization: `Bearer ${joiningKeys.free}` },
  })
  assert.equal(answer.status, 404)
  assert.throws(() =>
    plain.link(new Request('http://localhost/_t/work', { headers: { authorization: `Bearer ${joiningKeys.free}` } })),
  )
})

test('[51-11.2] [51-11.3] a worker that sends done for a task it was not handed, or asks a call under another task, is answered T5108, and nothing is saved', async (t) => {
  const { app } = await writerOf(t)
  const worker = rawWorker(app, joiningKeys.free)
  worker.send(here())
  await worker.next('go')
  worker.send({ t: 'done', task: 'not-a-task', result: 1, cpuMs: 0 })
  assert.deepEqual(await worker.next('refused'), { t: 'refused', task: 'not-a-task', what: 'done', code: 'T5108' })
  worker.send({ t: 'call', id: 'c1', task: 'not-a-task', what: 'read', plan: { from: 'marks' } })
  const answer = await worker.next('answer')
  assert.equal(Object(answer.error).code, 'T5108')
  assert.deepEqual(await app.call('allMarks', {}, { as: system }), [])
})

test('[51-2] a frame that is no message, one past taskSize, and a message that the table does not give to a worker close the link', async (t) => {
  const { app } = await writerOf(t)
  for (const sent of [
    'not json',
    JSON.stringify({ t: 'work', task: {} }),
    `{"t":"alive","pad":"${'x'.repeat(17_000_000)}"}`,
  ]) {
    const worker = rawWorker(app, joiningKeys.free)
    worker.send(here())
    await worker.next('go')
    worker.sendText(sent)
    await untilWithin(() => worker.closed(), `the link was closed after ${sent.slice(0, 30)}`)
  }
})

test('[51-11.15] a worker that hands every task back loses them by its word: lost bounds them, the step fails with T5107, and app.workers shows how many in a row', async (t) => {
  const { app } = await writerOf(t)
  const worker = rawWorker(app, joiningKeys.free)
  worker.send(here())
  await worker.next('go')
  const versions = await worker.next('versions')
  for (const one of Array.isArray(versions.list) ? versions.list : [])
    worker.send({ t: 'ready', version: Object(one).version })
  const { run } = notDropped(await app.start('onGpu', { n: 2 }, { as: system }))
  for (let i = 0; i < 10; i++) {
    const work = Object((await worker.next('work')).task)
    worker.send({ t: 'back', tasks: [work.id], cpuMs: {} })
  }
  await untilWithin(() => app.runs.read(run)?.state === 'failed', 'the run failed')
  assert.equal(app.runs.read(run)?.error?.code, 'T5107')
  const [shown] = app.workers()
  assert.equal(Object(Reflect.get(Object(shown), 'inARow')).lost, 10)
})
