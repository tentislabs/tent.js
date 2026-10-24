import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Caller } from '../../core/index.ts'
import { createEngine } from '../../engine/index.ts'
import { liveMoment, movedClock } from './living.ts'
import { closing, copyOf } from './projects.ts'
import { answerJson, callCodeOf, remoteOf, servicedEngine, untilWithin } from './remotes.ts'
import { logOf } from './sieges.ts'
import { notDropped } from './started.ts'

const system: { as: Caller } = { as: { kind: 'system' } }
const nobody: { as: Caller } = { as: { kind: 'nobody' } }
const userOf = (id: string): { as: Caller } => ({ as: { kind: 'user', user: { id, roles: [] } } })

// The secret that the test data of an app holds for the sign-in of the service `remote`.
const remoteKey = 'test-REMOTE_KEY'

test('[24-1a] a signer made in `engine.ts` changes the request, after the once-only key of the step and once for each try', async (t) => {
  let n = 0
  const remote = await remoteOf(t, (_, response) => answerJson(response, ++n === 1 ? 503 : 200, {}))
  const { app } = await servicedEngine(t, remote)
  await app.call('signing', { n: 1 }, system)
  assert.equal(remote.heard.length, 2)
  const [first, second] = remote.heard
  const key = first.headers['idempotency-key']
  assert.match(key, /^[0-9a-f]{32}$/)
  assert.equal(second.headers['idempotency-key'], key)
  for (const one of remote.heard) assert.equal(one.headers['x-signed'], `by the signer, key ${key}`)
})

test('[24-1a] [16-2@8a] a service whose signer nobody made stops the app from opening, with T7113', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, {}))
  const folder = copyOf(t, 'serviced')
  writeFileSync(join(folder, 'engine.ts'), 'export default { signers: () => ({}) }\n')
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const error = await engine.open(made.bundleFolder, { dataFolder: join(folder, 'data'), mode: 'test' }).then(
    () => undefined,
    (failed) => failed,
  )
  assert.equal(error?.code, 'T7113')
  assert.match(String(error?.message), /signed/)
  assert.equal(remote.heard.length, 0)
})

test('[24-1a] a secret of a sign-in is on the request and in no row of the log, also where the service answers it back in a failure', async (t) => {
  const remote = await remoteOf(t, (heard, response) =>
    answerJson(response, 500, { error: `the key ${heard.headers.authorization} is not good` }),
  )
  const { app, dataFolder } = await servicedEngine(t, remote)
  assert.equal(await callCodeOf(app.call('look', {}, nobody)), 'T7115')
  assert.equal(remote.heard[0].headers.authorization, `Bearer ${remoteKey}`)
  const log = JSON.stringify(['calls', 'errors', 'lines', 'outgoing'].map((table) => logOf(dataFolder, table)))
  assert.doesNotMatch(log, new RegExp(remoteKey))
  assert.deepEqual(
    logOf(dataFolder, 'outgoing').map((row) => [row.service, row.call, row.status]),
    [['remote', 'look', 500]],
  )
})

test('[24-1a] a file in a body in parts arrives as its bytes, and one that the caller may not download is T2104', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, {}))
  const { app } = await servicedEngine(t, remote)
  const maya = userOf('maya')
  const deniz = userOf('deniz')
  const id = String(await app.call('keep', { words: 'the words of maya' }, maya))
  await app.call('sendFile', { doc: id }, maya)
  const [sent] = remote.heard
  const type = sent.headers['content-type']
  const parts = await new Response(new Uint8Array(sent.body), { headers: { 'content-type': type } }).formData()
  const doc = parts.get('doc')
  assert.ok(doc instanceof File)
  assert.equal(await doc.text(), 'the words of maya')
  assert.equal(doc.name, 'words.txt')
  assert.equal(await callCodeOf(app.call('sendById', { id }, deniz)), 'T2104')
  assert.equal(remote.heard.length, 1)
})

test('[24-2] `output: file()` keeps a loose file of the caller, whose kind is the one its bytes say', async (t) => {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
      '1f15c4890000000d49444154789c636000000000050001a5f645400000000049454e44ae426082',
    'hex',
  )
  const remote = await remoteOf(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(png)
  })
  const { app } = await servicedEngine(t, remote)
  const maya = userOf('maya')
  const id = String(await app.call('chart', {}, maya))
  assert.deepEqual(await app.call('fileOf', { id }, maya), { kind: 'image/png', name: 'chart.png', size: png.length })
  // The file is maya's own, while it is loose.
  assert.deepEqual(await app.call('fileOf', { id }, userOf('deniz')), { none: true })
})

test('[24-3] a post inside a step is tried again with the same once-only key, and a step does not try T7116 again', async (t) => {
  let pays = 0
  const remote = await remoteOf(t, (heard, response) => {
    if (heard.path === '/pay') return answerJson(response, ++pays === 1 ? 503 : 200, {})
    answerJson(response, 200, { id: 7 })
  })
  const { app } = await servicedEngine(t, remote)
  await app.call('paying', { n: 2 }, system)
  const keys = remote.heard.filter((one) => one.path === '/pay').map((one) => one.headers['idempotency-key'])
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  assert.equal(await callCodeOf(app.call('shaping', {}, system)), 'T7116')
  assert.equal(remote.heard.filter((one) => one.path === '/shaped').length, 1)
})

test('[24-3] a 404 is T7115 for code with the status and the body, a secret that the body echoes is not in what is kept, and a caller is sent the code alone', async (t) => {
  const remote = await remoteOf(t, (heard, response) =>
    answerJson(response, 404, { error: 'missing', echo: heard.headers.authorization }),
  )
  const { app, origin } = await servicedEngine(t, remote)
  const read = await app.call('failure', {}, nobody)
  assert.deepEqual(read, {
    code: 'T7115',
    service: { status: 404, body: { error: 'missing', echo: 'Bearer [secret]' } },
  })
  const answer = await app.request(
    new Request(`${origin}/_t/call/look`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    }),
  )
  assert.equal(answer.status, 502)
  const wire = await answer.json()
  assert.equal(wire.error.code, 'T7115')
  assert.equal(wire.error.service, undefined)
  assert.doesNotMatch(JSON.stringify(wire), /missing|REMOTE_KEY/)
})

test('[24-3] a plain `fetch` writes a row of `outgoing` with its host as its call, reaches a host that `privateHosts` lists, and is cut at no size', async (t) => {
  const large = Buffer.alloc(11 * 1_048_576, 120)
  const remote = await remoteOf(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(large)
  })
  const { app, dataFolder } = await servicedEngine(t, remote)
  assert.deepEqual(await app.call('fetched', { address: `${remote.origin}/large` }, nobody), {
    status: 200,
    size: large.length,
  })
  const [row] = logOf(dataFolder, 'outgoing')
  assert.deepEqual([row.service, row.call, row.status], ['', new URL(remote.origin).host, 200])
})

test('[24-3] a plain `fetch` is T0022 for an address inside this computer that the project does not list, straight and through a redirect', async (t) => {
  const remote = await remoteOf(t, (_, response) => {
    response.writeHead(302, { location: `http://localhost:${new URL(remote.origin).port}/inside` })
    response.end()
  })
  const { app } = await servicedEngine(t, remote)
  assert.deepEqual(
    await app.call('fetched', { address: `http://localhost:${new URL(remote.origin).port}/x` }, nobody),
    {
      code: 'T0022',
    },
  )
  assert.deepEqual(await app.call('fetched', { address: `${remote.origin}/away` }, nobody), { code: 'T0022' })
  assert.deepEqual(
    remote.heard.map((one) => one.path),
    ['/away'],
  )
})

test('[24-3] a service call in a query and in a change is T0013, and an action that is read only calls what states `changes: false` and nothing else', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, { read: true }))
  const { app, origin, dataFolder } = await servicedEngine(t, remote)
  assert.equal(await callCodeOf(Promise.resolve().then(() => app.call('inQuery', {}, nobody))), 'T0013')
  assert.equal(await callCodeOf(Promise.resolve().then(() => app.call('inChange', {}, nobody))), 'T0013')
  const read = (name: string) =>
    app.request(
      new Request(`${origin}/_t/read/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }),
    )
  const looked = await (await read('readLook')).json()
  assert.deepEqual(looked, { ok: true, value: { read: true } })
  const paid = await (await read('readPay')).json()
  // T0013 has no status of its own, so a caller is sent T0009, and the log holds the refusal.
  assert.equal(paid.error.code, 'T0009')
  assert.ok(
    logOf(dataFolder, 'errors').some((row) => /read-only/.test(String(row.message))),
    'the log holds the refusal of the call that only reads',
  )
  assert.deepEqual(
    remote.heard.map((one) => one.path),
    ['/look'],
  )
})

test('[24-17] a service call adds the secret, never logs it, respects a stated limit, and tries only safe calls again', async (t) => {
  let n = 0
  const remote = await remoteOf(t, (heard, response) =>
    answerJson(response, ++n === 1 ? 503 : 200, { echo: heard.headers['x-counted-key'] }),
  )
  const moved = movedClock()
  const { app, dataFolder } = await servicedEngine(t, remote, {
    secrets: { COUNTED_KEY: 'the-counted-key' },
    makers: { clock: () => moved.clock },
  })
  // A get is tried again after its 503. The first try counts against `perMinute: 1`, so the second waits for the
  // next minute, and starts once the clock of the test is there.
  const looked = app.call('countedLook', {}, nobody)
  await untilWithin('the first try', () => remote.heard.length === 1)
  assert.equal(remote.heard[0].headers['x-counted-key'], 'the-counted-key')
  moved.advance(30_000)
  await liveMoment(200)
  assert.equal(remote.heard.length, 1, 'the second try waits for its turn')
  moved.advance(30_000)
  await looked
  assert.equal(remote.heard.length, 2)
  // A post that states no `changes: false` and carries no once-only key is not tried again.
  n = 0
  const paid = app.call('countedPay', {}, nobody)
  await untilWithin('the post waits its turn', () => remote.heard.length === 2)
  moved.advance(60_000)
  assert.equal(await callCodeOf(paid), 'T7115')
  assert.equal(remote.heard.length, 3)
  const log = JSON.stringify(['calls', 'errors', 'lines', 'outgoing'].map((table) => logOf(dataFolder, table)))
  assert.doesNotMatch(log, /the-counted-key/)
})

test('[24-17] a post with no once-only key is not tried again', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 503, {}))
  const { app } = await servicedEngine(t, remote)
  assert.equal(await callCodeOf(app.call('pay', { n: 1 }, nobody)), 'T7115')
  assert.equal(remote.heard.length, 1)
})

test('[24-3] the row of `outgoing` of a call inside a step names its run', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, {}))
  const { app, dataFolder } = await servicedEngine(t, remote)
  const { run } = notDropped(await app.start('paying', { n: 3 }, system))
  await app.runs.wait(run)
  const [row] = logOf(dataFolder, 'outgoing')
  assert.deepEqual([row.service, row.call, row.status, row.run], ['remote', 'pay', 200, run])
})
