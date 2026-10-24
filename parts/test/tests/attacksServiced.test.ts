import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { movedClock } from './living.ts'
import { answerJson, callCodeOf, remoteOf, servicedEngine, untilWithin } from './remotes.ts'
import { logOf } from './sieges.ts'
import { bytesUnder } from './storms.ts'
import { notDropped } from './started.ts'

const system: { as: Caller } = { as: { kind: 'system' } }
const nobody: { as: Caller } = { as: { kind: 'nobody' } }

// The secret that the test data of an app holds for the sign-in of the service `remote`.
const remoteKey = 'test-REMOTE_KEY'

test('[05-11.3] a service whose error echoes the key it was sent: `[secret]` in the log, and the caller is sent T7115 and nothing of the body', async (t) => {
  const remote = await remoteOf(t, (heard, response) =>
    answerJson(response, 500, { error: `the key ${heard.headers.authorization} is not good`, plain: remoteKey }),
  )
  const { app, origin, dataFolder } = await servicedEngine(t, remote)
  assert.equal(await callCodeOf(app.call('look', {}, nobody)), 'T7115')
  const answer = await app.request(
    new Request(`${origin}/_t/call/look`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    }),
  )
  const wire = await answer.text()
  assert.match(wire, /T7115/)
  assert.doesNotMatch(wire, /not good|REMOTE_KEY|\[secret\]/)
  for (const one of bytesUnder(dataFolder))
    assert.equal(one.bytes.includes(Buffer.from(remoteKey)), false, `${one.file} holds no key`)
  const read = Object(await app.call('failure', {}, nobody))
  assert.doesNotMatch(JSON.stringify(read), /REMOTE_KEY/)
  assert.match(JSON.stringify(read), /\[secret\]/)
})

test('[05-11.24] a service call inside a read-only call that states no `changes: false` is T0013, and nothing is sent', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, {}))
  const { app, origin, dataFolder } = await servicedEngine(t, remote)
  const read = await app.request(
    new Request(`${origin}/_t/read/readPay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    }),
  )
  assert.equal(Object(await read.json()).ok, false)
  assert.equal(remote.heard.length, 0)
  assert.ok(logOf(dataFolder, 'errors').some((row) => /T0013|read-only/.test(JSON.stringify(row))))
})

test("[05-11.36] a plain `fetch` of an address that a user typed, which leads into this computer's network, straight and through a redirect, is T0022", async (t) => {
  const inside = ['http://169.254.169.254/latest/meta-data', 'http://10.1.2.3/', 'http://[::1]:9/', 'http://0.0.0.0:9/']
  let n = 0
  const remote = await remoteOf(t, (_, response) => {
    response.writeHead(302, { location: inside[n++ % inside.length] })
    response.end()
  })
  const { app } = await servicedEngine(t, remote)
  for (const address of inside) assert.deepEqual(await app.call('fetched', { address }, nobody), { code: 'T0022' })
  for (const _ of inside)
    assert.deepEqual(await app.call('fetched', { address: `${remote.origin}/away` }, nobody), { code: 'T0022' })
})

test('[05-11.37] [05-11.42] an error of a service that echoes the key, kept in a failed step, is not there, and its body is kept up to `limits.error`', async (t) => {
  const remote = await remoteOf(t, (heard, response) =>
    answerJson(response, 500, { echo: heard.headers.authorization, pad: 'x'.repeat(10 * 1_048_576) }),
  )
  const moved = movedClock()
  const { app, dataFolder } = await servicedEngine(t, remote, { makers: { clock: () => moved.clock } })
  const { run } = notDropped(await app.start('paying', { n: 1 }, system))
  for (let i = 0; i < 400 && app.runs.read(run)?.state !== 'failed'; i++) {
    moved.advance(60_000)
    await new Promise((done) => setTimeout(done, 10))
  }
  await untilWithin('the run failed', () => app.runs.read(run)?.state === 'failed', 20_000)
  assert.equal(app.runs.read(run)?.error?.code, 'T7115')
  for (const one of bytesUnder(dataFolder)) {
    assert.equal(one.bytes.includes(Buffer.from(remoteKey)), false, `${one.file} holds no key`)
    assert.ok(one.bytes.length < 9 * 1_048_576 || !one.bytes.includes(Buffer.from('x'.repeat(20_000))), one.file)
  }
})
