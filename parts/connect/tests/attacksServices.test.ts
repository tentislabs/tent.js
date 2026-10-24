import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import test from 'node:test'
import { file, get, post, secret, service, text } from '../../core/index.ts'
import type { Signer } from '../env.ts'
import { calling, codeOf } from './calling.ts'
import { standIn } from './servers.ts'

const ok = (_: unknown, response: ServerResponse) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end('{}')
}

/** The error a call was refused with, or nothing where it was kept. */
const errorOf = (call: Promise<unknown>): Promise<Record<string, unknown>> =>
  call.then(
    () => ({}),
    (error) => Object(error),
  )

test("[05-11.1] a service whose address, or whose answer that sends the call on, leads into this computer's own network is T0022", async (t) => {
  const inside = [
    'http://10.0.0.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://192.168.0.1/',
    'http://[fd00::1]/',
  ]
  let n = 0
  const sends = await standIn(t, (_, response) => {
    response.writeHead(302, { location: inside[n++ % inside.length] })
    response.end()
  })
  const { call } = calling([
    service('inner', { url: 'https://10.0.0.1', calls: { one: get('/x', { input: {} }) } }),
    service('meta', { url: 'https://169.254.169.254', calls: { one: get('/latest', { input: {} }) } }),
    service('sends', { url: sends.origin, calls: { one: get('/go', { input: {} }) } }),
  ])
  assert.equal(await codeOf(call('inner', 'one', {})), 'T0022')
  assert.equal(await codeOf(call('meta', 'one', {})), 'T0022')
  for (const _ of inside) assert.equal(await codeOf(call('sends', 'one', {})), 'T0022')
})

test('[05-11.2] a service that answers a gigabyte, and one that never ends its answer, is cut at its size and its time: T7115', async (t) => {
  const server = await standIn(t, (request, response) => {
    response.writeHead(200, {
      'content-type': request.url === '/file' ? 'application/octet-stream' : 'application/json',
    })
    if (request.url === '/slow') {
      response.write('{"a":')
      return
    }
    const piece = Buffer.alloc(1_048_576, 32)
    let sent = 0
    const more = (): void => {
      while (sent < 1024) {
        sent++
        if (!response.write(piece)) return void response.once('drain', more)
      }
      response.end()
    }
    response.on('close', () => (sent = 1024))
    more()
  })
  const { call } = calling([
    service('big', {
      url: server.origin,
      limits: { size: '2 MB', time: '1 second' },
      tries: 1,
      calls: {
        json: get('/big', { input: {} }),
        slow: get('/slow', { input: {} }),
      },
    }),
    service('plain', { url: server.origin, tries: 1, calls: { json: get('/big', { input: {} }) } }),
  ])
  const began = performance.now()
  assert.equal(await codeOf(call('big', 'json', {})), 'T7115')
  assert.equal(await codeOf(call('big', 'slow', {})), 'T7115')
  assert.equal(await codeOf(call('plain', 'json', {})), 'T7115', 'cut at 10 MB when no size is stated')
  assert.ok(performance.now() - began < 20_000)
})

test('[05-11.2] an answer of a call whose output is a file with no maxSize is cut at the size of the service', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/octet-stream' })
    response.end(Buffer.alloc(3 * 1_048_576, 1))
  })
  const { call } = calling([
    service('downloads', {
      url: server.origin,
      limits: { size: '1 MB' },
      tries: 1,
      calls: { one: get('/f', { input: {}, output: file() }) },
    }),
  ])
  assert.equal(await codeOf(call('downloads', 'one', {})), 'T7115')
})

test('[05-11.4] a value for a place in the path that holds `../admin`, a question mark or a line break stays one part of the address', async (t) => {
  const server = await standIn(t, ok)
  const { call } = calling([
    service('shop', { url: server.origin, calls: { one: get('/orders/{id}/lines', { input: { id: text() } }) } }),
  ])
  for (const id of ['../admin', '../../admin?x=1', 'a?b=c#d', 'line\r\nX-Injected: yes', '..%2fadmin'])
    await call('shop', 'one', { id })
  const paths = server.asked.map((one) => one.path)
  for (const path of paths) {
    assert.match(path, /^\/orders\/[^/?#]+\/lines$/, path)
    assert.doesNotMatch(path, /\/admin/)
  }
  for (const one of server.asked) assert.equal(one.headers['x-injected'], undefined)
  assert.equal(new Set(paths).size, paths.length, 'each value is its own part')
})

test('[05-11.32] a file in a `files` body whose name holds a quote and a line break is written with percent signs: no line is added to the part', async (t) => {
  const server = await standIn(t, ok)
  const name = 'a"b\r\nContent-Type: text/html\r\n\r\nx.txt'
  const { call } = calling(
    [service('up', { url: server.origin, calls: { send: post('/up', { input: { doc: file() }, body: 'files' }) } })],
    { files: { f1: { name, kind: 'text/plain', bytes: new Uint8Array(Buffer.from('the words')) } } },
  )
  await call('up', 'send', { doc: 'f1' })
  const [asked] = server.asked
  const lines = asked.body.split('\r\n')
  const disposition = lines.filter((line) => /^content-disposition:/i.test(line))
  assert.equal(disposition.length, 1)
  assert.doesNotMatch(disposition[0], /\r|\n/)
  assert.match(disposition[0], /%22/)
  assert.equal(lines.filter((line) => /^content-type: text\/html/i.test(line)).length, 0)
})

test('[05-11.38] [05-7.9] a call with the sign-in `header`, a secret in `headers`, and a signer, sent on to another host, carries no header but the four', async (t) => {
  const other = await standIn(t, ok)
  const first = await standIn(t, (request, response) => {
    response.writeHead(307, { location: `${other.origin}${request.url}` })
    response.end()
  })
  const signer: Signer = (request) => {
    const made = new Request(request)
    made.headers.set('X-Signature-Of-Builder', 'signed with the key')
    return made
  }
  const { call } = calling(
    [
      service('lined', {
        url: first.origin,
        auth: { header: { name: 'X-Shop-Pass', value: secret('TOKEN') } },
        headers: { 'X-Api-Secret': secret('OTHER'), 'X-Program': 'tests' },
        calls: { one: get('/s', { input: {} }), send: post('/p', { input: { n: text() } }) },
      }),
      service('signed', { url: first.origin, auth: { by: 'signed' }, calls: { one: get('/t', { input: {} }) } }),
      service('basic', {
        url: first.origin,
        auth: { basic: { user: 'me', password: secret('TOKEN') } },
        calls: { one: get('/u', { input: {} }) },
      }),
    ],
    { secrets: { TOKEN: 'the-token-value', OTHER: 'the-other-secret' }, signers: { signed: signer } },
  )
  await call('lined', 'one', {})
  await call('lined', 'send', { n: 'a body' })
  await call('signed', 'one', {})
  await call('basic', 'one', {})
  assert.equal(other.asked.length, 4)
  const four = ['accept', 'accept-language', 'content-type', 'user-agent']
  // What the runtime adds by itself to every request it sends, which is no header of the first request.
  const own = ['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding', 'sec-fetch-mode']
  for (const one of other.asked) {
    const left = Object.keys(one.headers).filter((name) => !four.includes(name) && !own.includes(name))
    assert.deepEqual(left, [], `${one.path}: ${JSON.stringify(one.headers)}`)
    assert.doesNotMatch(JSON.stringify(one.headers), /the-token-value|the-other-secret|signed with the key/)
  }
})

test('[05-11.39] a `Retry-After` of a year ends the call; one of a negative number and one of a date in the past count as none', async (t) => {
  const asks = ['31536000', '-5', new Date(Date.UTC(2001, 0, 1)).toUTCString()]
  let n = 0
  const server = await standIn(t, (_, response) => {
    n++
    if (n % 2 === 1) response.writeHead(503, { 'retry-after': asks[(n - 1) / 2] ?? '1' })
    else response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const made = calling([service('shop', { url: server.origin, calls: { one: get('/s', { input: {} }) } })])
  assert.equal(await codeOf(made.call('shop', 'one', {})), 'T7115', 'a year ends the call')
  assert.equal(server.asked.length, 1)
  n = 2
  assert.deepEqual(await made.call('shop', 'one', {}), {})
  assert.deepEqual(await made.call('shop', 'one', {}), {})
  assert.deepEqual(made.slept, [1000, 1000], 'a negative number and a past date wait as for none')
})

test('[05-11.44] a signer that throws is T0009, and one that answers a request for another host is still held to the guarded fetch', async (t) => {
  const server = await standIn(t, ok)
  const throws: Signer = () => {
    throw new Error('the signer failed')
  }
  const elsewhere: Signer = () => new Request('http://169.254.169.254/latest/meta-data')
  const { call } = calling(
    [
      service('throws', { url: server.origin, auth: { by: 'throws' }, calls: { one: get('/a', { input: {} }) } }),
      service('away', { url: server.origin, auth: { by: 'elsewhere' }, calls: { one: get('/b', { input: {} }) } }),
    ],
    { signers: { throws, elsewhere } },
  )
  assert.equal(await codeOf(call('throws', 'one', {})), 'T0009')
  assert.equal(await codeOf(call('away', 'one', {})), 'T0022')
  assert.equal(server.asked.length, 0)
})

test('[05-11.42] an error body of 10 MB of JSON from a service is kept up to `limits.error`', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'x'.repeat(10 * 1_048_576 - 20) }))
  })
  const { call } = calling([
    service('shop', {
      url: server.origin,
      limits: { size: '20 MB' },
      tries: 1,
      calls: { one: get('/s', { input: {} }) },
    }),
  ])
  const error = await errorOf(call('shop', 'one', {}))
  assert.equal(error.code, 'T7115')
  const kept = JSON.stringify(Object(error.service).body ?? '')
  assert.ok(kept.length <= 16_384 + 64, `${kept.length} characters are kept`)
})
