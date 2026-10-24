import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import test from 'node:test'
import { get, post, service, text } from '../../core/index.ts'
import type { TentError } from '../../core/index.ts'
import { calling, codeOf } from './calling.ts'
import { standIn } from './servers.ts'

/** A server that answers its requests with the statuses it is given, in turn, and 200 once they are used up. */
async function answering(t: test.TestContext, statuses: (number | [number, Record<string, string>])[]) {
  return standIn(t, (_, response: ServerResponse) => {
    const next = statuses.shift() ?? 200
    const [status, headers] = Array.isArray(next) ? next : [next, {}]
    response.writeHead(status, { 'content-type': 'application/json', ...headers })
    response.end(status < 400 ? '{"done":true}' : '{"error":"no"}')
  })
}

test('[24-3] a 503 and then a 200 on a get is one call for the caller, which waits one second between the two tries', async (t) => {
  const server = await answering(t, [503])
  const shop = service('shop', { url: server.origin, calls: { one: get('/o', { input: {} }) } })
  const made = calling([shop])
  assert.deepEqual(await made.call('shop', 'one', {}), { done: true })
  assert.equal(server.asked.length, 2)
  assert.deepEqual(made.slept, [1000])
  assert.equal(made.logged.length, 1)
  assert.equal(made.logged[0].status, 200)
})

test('[24-3] the waits between tries grow four times each, and the tries are as many as `tries` says in all', async (t) => {
  const server = await answering(t, [503, 502, 504, 429])
  const shop = service('shop', { url: server.origin, tries: 4, calls: { one: get('/o', { input: {} }) } })
  const made = calling([shop])
  assert.equal(await codeOf(made.call('shop', 'one', {})), 'T7115')
  assert.equal(server.asked.length, 4)
  assert.deepEqual(made.slept, [1000, 4000, 16000])
})

test('[24-3] a post with no once-only key is not tried again, and one that carries a key is, with the same key both times', async (t) => {
  const server = await answering(t, [503, 503])
  const shop = service('shop', {
    url: server.origin,
    onceOnlyHeader: 'Idempotency-Key',
    calls: { pay: post('/pay', { input: { n: text() } }) },
  })
  assert.equal(await codeOf(calling([shop]).call('shop', 'pay', { n: 'a' })), 'T7115')
  assert.equal(server.asked.length, 1)
  await calling([shop], { once: () => 'key-of-the-step' }).call('shop', 'pay', { n: 'a' })
  assert.deepEqual(
    server.asked.slice(1).map((one) => one.headers['idempotency-key']),
    ['key-of-the-step', 'key-of-the-step'],
  )
})

test('[24-3] a post that states `changes: false` is tried again with no key', async (t) => {
  const server = await answering(t, [503])
  const shop = service('shop', {
    url: server.origin,
    calls: { look: post('/look', { input: {}, changes: false }) },
  })
  await calling([shop]).call('shop', 'look', {})
  assert.equal(server.asked.length, 2)
})

test('[24-3] `Retry-After` is waited for up to `tries.wait`, in seconds and as a date, and a longer one ends the call at once', async (t) => {
  const made = calling([])
  const at = new Date(made.at() + 7000).toUTCString()
  const server = await answering(t, [
    [429, { 'retry-after': '3' }],
    [503, { 'retry-after': at }],
    [503, { 'retry-after': 'soon' }],
    [429, { 'retry-after': '120' }],
  ])
  const shop = service('shop', {
    url: server.origin,
    tries: { max: 5, wait: '30 seconds' },
    calls: { one: get('/o', { input: {} }) },
  })
  const both = calling([shop])
  const error = await both.call('shop', 'one', {}).then(
    () => undefined,
    (failed: TentError) => failed,
  )
  assert.equal(error?.code, 'T7115')
  assert.equal(error?.service?.status, 429)
  assert.equal(server.asked.length, 4)
  // Three seconds; the moment of the date, which the clock of the test stands seven seconds before; a word that
  // does not read counts as none, so the next of the waits by themselves.
  assert.equal(both.slept.length, 3)
  assert.equal(both.slept[0], 3000)
  assert.ok(both.slept[1] >= 3000 && both.slept[1] <= 7000, `a wait of ${both.slept[1]}`)
  assert.equal(both.slept[2], 16000)
})

test('[24-3] a 404 is T7115 with the status and the body in `service`, and is not tried again', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":{"code":"missing"}}')
  })
  const shop = service('shop', { url: server.origin, calls: { one: get('/o', { input: {} }) } })
  const error = await calling([shop])
    .call('shop', 'one', {})
    .then(
      () => undefined,
      (failed: TentError) => failed,
    )
  assert.equal(error?.code, 'T7115')
  assert.deepEqual(error?.service, { status: 404, body: { error: { code: 'missing' } } })
  assert.equal(server.asked.length, 1)
})

test('[24-3] the body that a failure keeps is cut at `limits.error`, as text where it is no JSON', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(500, { 'content-type': 'text/plain' })
    response.end('x'.repeat(5000))
  })
  const shop = service('shop', {
    url: server.origin,
    tries: 1,
    limits: { error: '1 KB' },
    calls: { one: get('/o', { input: {} }) },
  })
  const error = await calling([shop])
    .call('shop', 'one', {})
    .then(
      () => undefined,
      (failed: TentError) => failed,
    )
  assert.equal(error?.service?.status, 500)
  assert.equal(error?.service?.body, 'x'.repeat(1024))
})

test('[24-3] an answer after `limits.time` is T7115, with no status', async (t) => {
  const server = await standIn(t, () => undefined)
  const shop = service('shop', {
    url: server.origin,
    tries: 1,
    limits: { time: '300 ms' },
    calls: { one: get('/o', { input: {} }) },
  })
  const began = performance.now()
  const error = await calling([shop], { real: true })
    .call('shop', 'one', {})
    .then(
      () => undefined,
      (failed: TentError) => failed,
    )
  assert.equal(error?.code, 'T7115')
  assert.equal(error?.service?.status, undefined)
  assert.ok(performance.now() - began < 5000)
})

test('[24-3] a status that `tries.on` names is tried again', async (t) => {
  const server = await answering(t, [409])
  const shop = service('shop', {
    url: server.origin,
    tries: { max: 3, on: [409] },
    calls: { one: get('/o', { input: {} }) },
  })
  await calling([shop]).call('shop', 'one', {})
  assert.equal(server.asked.length, 2)
})

test('[24-3] a try that got no answer is tried again, and `tries.first` sets the first wait', async (t) => {
  let n = 0
  const server = await standIn(t, (request, response) => {
    n++
    if (n === 1) {
      request.socket.destroy()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const shop = service('shop', {
    url: server.origin,
    tries: { max: 2, first: '2 seconds' },
    calls: { one: get('/o', { input: {} }) },
  })
  const made = calling([shop])
  await made.call('shop', 'one', {})
  assert.equal(n, 2)
  assert.deepEqual(made.slept, [2000])
})

test('[24-3] the signal of the call ends a wait, and the call fails with what it carries', async (t) => {
  const server = await answering(t, [[503, { 'retry-after': '20' }]])
  const shop = service('shop', { url: server.origin, calls: { one: get('/o', { input: {} }) } })
  const made = calling([shop], { real: true })
  const stop = new AbortController()
  const reason = Object.assign(new Error('the time is up'), { code: 'T0008' })
  setTimeout(() => stop.abort(reason), 100)
  assert.equal(await codeOf(made.call('shop', 'one', {}, { signal: stop.signal })), 'T0008')
})
