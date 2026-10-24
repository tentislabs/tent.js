import assert from 'node:assert/strict'
import test from 'node:test'
import { file, get, list, object, post, service, text } from '../../core/index.ts'
import { bytesOf, calling, codeOf } from './calling.ts'
import { standIn } from './servers.ts'

test('[24-2] a stated output lets only its fields through, a null is a value that is not there, and an answer that does not fit is T7116', async (t) => {
  const answers = [{ id: 'r1', secret: 'not named', more: { a: 1 } }, { id: 'r2', note: null }, { id: 7 }]
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(answers.shift()))
  })
  const shop = service('shop', {
    url: server.origin,
    calls: {
      one: get('/o', { input: {}, output: object({ id: text(), note: text({ optional: true }) }) }),
    },
  })
  const { call } = calling([shop])
  assert.deepEqual(await call('shop', 'one', {}), { id: 'r1' })
  assert.deepEqual(await call('shop', 'one', {}), { id: 'r2' })
  assert.equal(await codeOf(call('shop', 'one', {})), 'T7116')
})

test('[24-2] an answer with no body fits an output that is optional, and no other', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(204)
    response.end()
  })
  const shop = service('shop', {
    url: server.origin,
    calls: {
      maybe: post('/m', { input: {}, output: object({ id: text() }, { optional: true }) }),
      must: post('/n', { input: {}, output: object({ id: text() }) }),
    },
  })
  const { call } = calling([shop])
  assert.equal(await call('shop', 'maybe', {}), undefined)
  assert.equal(await codeOf(call('shop', 'must', {})), 'T7116')
})

test('[24-2] with no output an answer that says it is JSON is read as JSON, any other as text, and one with no body answers nothing', async (t) => {
  const bodies: [string, string][] = [
    ['application/json; charset=utf-8', '{"a":[1,2]}'],
    ['text/plain', 'plain words'],
    ['text/html', '<p>x</p>'],
  ]
  const server = await standIn(t, (_, response) => {
    const next = bodies.shift()
    if (!next) {
      response.writeHead(204)
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': next[0] })
    response.end(next[1])
  })
  const shop = service('shop', { url: server.origin, calls: { one: get('/o', { input: {} }) } })
  const { call } = calling([shop])
  assert.deepEqual(await call('shop', 'one', {}), { a: [1, 2] })
  assert.equal(await call('shop', 'one', {}), 'plain words')
  assert.equal(await call('shop', 'one', {}), '<p>x</p>')
  assert.equal(await call('shop', 'one', {}), undefined)
})

test('[24-2] `output: file()` stores the bytes as a loose file of the caller under the name the answer states, answers its id, and asks for no JSON; one over `maxSize` is T7115', async (t) => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const server = await standIn(t, (request, response) => {
    if (request.url === '/big') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(Buffer.alloc(2048))
      return
    }
    response.writeHead(200, { 'content-type': 'image/png', 'content-disposition': 'attachment; filename="chart.png"' })
    response.end(png)
  })
  const shop = service('shop', {
    url: server.origin,
    calls: {
      chart: get('/chart', { input: {}, output: file() }),
      big: get('/big', { input: {}, output: file({ maxSize: '1 KB' }) }),
    },
  })
  const made = calling([shop])
  const maya = { kind: 'user' as const, user: { id: 'maya', roles: [] } }
  const id = await made.call('shop', 'chart', {}, { caller: maya })
  assert.equal(typeof id, 'string')
  const kept = made.files.get(String(id))
  assert.ok(kept)
  assert.equal(kept.name, 'chart.png')
  assert.equal(kept.of, 'maya')
  assert.deepEqual(Buffer.from(kept.bytes), png)
  assert.notEqual(server.asked[0].headers.accept, 'application/json')
  assert.equal(await codeOf(made.call('shop', 'big', {})), 'T7115')
  // The stream of a stored file reads back as it was sent.
  assert.deepEqual(Buffer.from(await bytesOf(new Blob([kept.bytes]).stream())), png)
})

test('[24-2] a file answered with no name of its own is named after the call', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/pdf' })
    response.end('%PDF-1.7 x')
  })
  const shop = service('shop', {
    url: server.origin,
    calls: { invoicePdf: get('/i', { input: {}, output: file() }) },
  })
  const made = calling([shop])
  const id = await made.call('shop', 'invoicePdf', {})
  // The store of the engine adds the ending of the kind that the bytes say, which no stated kind decides.
  assert.equal(made.files.get(String(id))?.name, 'invoicePdf')
})

test('[24-2] a list of records is filtered entry by entry', async (t) => {
  const server = await standIn(t, (_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify([{ id: 'a', x: 1 }, { id: 'b' }]))
  })
  const shop = service('shop', {
    url: server.origin,
    calls: { all: get('/a', { input: {}, output: list(object({ id: text() })) }) },
  })
  assert.deepEqual(await calling([shop]).call('shop', 'all', {}), [{ id: 'a' }, { id: 'b' }])
})
