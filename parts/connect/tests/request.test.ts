import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import test from 'node:test'
import {
  boolean,
  date,
  day,
  file,
  get,
  json,
  list,
  number,
  object,
  post,
  request,
  secret,
  service,
  text,
} from '../../core/index.ts'
import { calling, codeOf } from './calling.ts'
import { standIn } from './servers.ts'

// Each test answers 200 with an empty record, unless it says otherwise.
const ok = (_: unknown, response: ServerResponse) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end('{}')
}

test('[24-1a] a field of the path is written into it as one part, also with a slash in it, and every other field of a get after the question mark, with each form of `lists`', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    calls: {
      one: get('/orders/{id}', {
        input: {
          id: text(),
          count: number(),
          paid: boolean(),
          from: date(),
          on: day(),
          tags: list(text()),
          left: text({ optional: true }),
        },
      }),
      brackets: get('/b', { input: { tags: list(text()) }, lists: 'brackets' }),
      comma: get('/c', { input: { tags: list(text()) }, lists: 'comma' }),
      deep: get('/d', { input: { where: object({ city: text(), near: object({ km: number() }) }) } }),
      gone: request('DELETE', '/orders/{id}', { input: { id: text(), why: text() } }),
    },
  })
  const { call } = calling([shop])
  await call('shop', 'one', {
    id: 'a/b c',
    count: 3,
    paid: false,
    from: new Date(Date.UTC(2026, 9, 9, 9, 30)),
    on: '2026-10-09',
    tags: ['x', 'y'],
  })
  await call('shop', 'brackets', { tags: ['x', 'y'] })
  await call('shop', 'comma', { tags: ['x', 'y'] })
  await call('shop', 'deep', { where: { city: 'Izmir', near: { km: 5 } } })
  await call('shop', 'gone', { id: '7', why: 'late' })
  assert.deepEqual(
    server.asked.map((one) => `${one.method} ${decodeURIComponent(one.path)}`),
    [
      'GET /orders/a/b c?count=3&paid=false&from=2026-10-09T09:30:00.000Z&on=2026-10-09&tags=x&tags=y',
      'GET /b?tags[]=x&tags[]=y',
      'GET /c?tags=x,y',
      'GET /d?where[city]=Izmir&where[near][km]=5',
      'DELETE /orders/7?why=late',
    ],
  )
  // The slash of the value stays inside its one part of the path.
  assert.match(server.asked[0].path, /^\/orders\/a%2Fb%20c\?/)
})

test('[24-1a] a name in curly brackets in `url` is filled by the setting of that name, or by the input field of that name of the call', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: `${server.origin}/{tenant}/{region}`,
    calls: { one: get('/orders', { input: { region: text() } }) },
  })
  const { call } = calling([shop], { settings: { tenant: 'acme', region: 'not this' } })
  await call('shop', 'one', { region: 'eu' })
  // The field of the call is written into the address and is not sent again after the question mark.
  assert.deepEqual(
    server.asked.map((one) => one.path),
    ['/acme/eu/orders'],
  )
})

test('[24-1a] a json body writes a date as text in the standard form and keeps a null of a json field, a form body writes lists and records by their places, and `query` puts a field of a post into the address', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    calls: {
      asJson: post('/j', {
        input: {
          at: date(),
          n: number(),
          tags: list(text()),
          more: object({ a: text() }),
          raw: json({ optional: true }),
          left: text({ optional: true }),
        },
      }),
      asForm: post('/f', {
        input: { tags: list(text()), where: object({ city: text(), near: object({ km: number() }) }), at: date() },
        body: 'form',
      }),
      queried: post('/q', { input: { tenant: text(), name: text() }, query: ['tenant'] }),
    },
  })
  const { call } = calling([shop])
  await call('shop', 'asJson', {
    at: new Date(Date.UTC(2026, 9, 9)),
    n: 2,
    tags: ['a'],
    more: { a: 'b' },
    raw: null,
  })
  await call('shop', 'asForm', {
    tags: ['x', 'y'],
    where: { city: 'Izmir', near: { km: 5 } },
    at: new Date(Date.UTC(2026, 9, 9)),
  })
  await call('shop', 'queried', { tenant: 't1', name: 'n' })
  const [first, second, third] = server.asked
  assert.equal(first.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(first.body), {
    at: '2026-10-09T00:00:00.000Z',
    n: 2,
    tags: ['a'],
    more: { a: 'b' },
    raw: null,
  })
  assert.equal(second.headers['content-type'], 'application/x-www-form-urlencoded')
  assert.deepEqual(
    [...new URLSearchParams(second.body).entries()],
    [
      ['tags[0]', 'x'],
      ['tags[1]', 'y'],
      ['where[city]', 'Izmir'],
      ['where[near][km]', '5'],
      ['at', '2026-10-09T00:00:00.000Z'],
    ],
  )
  assert.equal(third.path, '/q?tenant=t1')
  assert.deepEqual(JSON.parse(third.body), { name: 'n' })
})

test('[24-1a] a body in parts holds a part of text, a part for each entry of a list under one name, one part of JSON for a record, and a file as its bytes with its name and its kind', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    calls: {
      send: post('/up', {
        input: { note: text(), tags: list(text()), more: object({ a: text() }), doc: file() },
        body: 'files',
      }),
    },
  })
  const { call } = calling([shop], {
    files: { f1: { name: 'a "b"\nc.txt', kind: 'text/plain', bytes: new TextEncoder().encode('the bytes') } },
  })
  await call('shop', 'send', { note: 'hi', tags: ['x', 'y'], more: { a: 'b' }, doc: 'f1' })
  const [one] = server.asked
  const type = one.headers['content-type']
  assert.match(type, /^multipart\/form-data; boundary=/)
  const parts = await new Response(one.body, { headers: { 'content-type': type } }).formData()
  assert.equal(parts.get('note'), 'hi')
  assert.deepEqual(parts.getAll('tags'), ['x', 'y'])
  assert.deepEqual(JSON.parse(String(parts.get('more'))), { a: 'b' })
  const doc = parts.get('doc')
  assert.ok(doc instanceof File)
  assert.equal(await doc.text(), 'the bytes')
  assert.equal(doc.type, 'text/plain')
  // A quote and a line break of the name are written with percent signs, so they end nothing.
  assert.match(one.body, /filename="a %22b%22%0Ac\.txt"/)
})

test('[24-1a] a file of a body in parts that the caller may not download is T2104, and nothing is sent', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    calls: { send: post('/up', { input: { doc: file() }, body: 'files' }) },
  })
  const { call } = calling([shop], {
    files: { f1: { name: 'a.txt', kind: 'text/plain', bytes: new Uint8Array([1]), of: 'maya' } },
  })
  assert.equal(
    await codeOf(call('shop', 'send', { doc: 'f1' }, { caller: { kind: 'user', user: { id: 'deniz', roles: [] } } })),
    'T2104',
  )
  assert.equal(server.asked.length, 0)
})

test('[24-1a] the headers of the service, the lines a request carries by itself, a field that `headers` names, a field as the whole body, and `request` with another method', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    headers: { 'Stripe-Version': '2026-06-30', 'X-Key': secret('HEADER_KEY') },
    calls: {
      tagged: post('/t', {
        input: { tenant: text(), on: list(text()), at: date(), n: text() },
        headers: { 'X-Tenant': 'tenant', 'X-On': 'on', 'X-At': 'at' },
      }),
      xml: post('/x', { input: { payload: text() }, body: { text: 'payload', type: 'application/xml' } }),
      raw: post('/r', { input: { payload: file() }, body: { bytes: 'payload', type: 'application/octet-stream' } }),
      look: request('HEAD', '/h', { input: {} }),
      own: get('/o', { input: {}, headers: {} }),
    },
  })
  const { call } = calling([shop], {
    secrets: { HEADER_KEY: 'header-key-value' },
    files: { f1: { name: 'b.bin', kind: 'application/octet-stream', bytes: new Uint8Array([7, 8, 9]) } },
  })
  await call('shop', 'tagged', { tenant: 't1', on: ['a', 'b'], at: new Date(Date.UTC(2026, 9, 9)), n: 'x' })
  await call('shop', 'xml', { payload: '<a/>' })
  await call('shop', 'raw', { payload: 'f1' })
  await call('shop', 'look', {})
  const [tagged, xml, raw, look] = server.asked
  assert.equal(tagged.headers['stripe-version'], '2026-06-30')
  assert.equal(tagged.headers['x-key'], 'header-key-value')
  assert.equal(tagged.headers['user-agent'], 'tentjs/1.0')
  assert.equal(tagged.headers.accept, 'application/json')
  assert.equal(tagged.headers['x-tenant'], 't1')
  assert.equal(tagged.headers['x-on'], 'a,b')
  assert.equal(tagged.headers['x-at'], '2026-10-09T00:00:00.000Z')
  assert.deepEqual(JSON.parse(tagged.body), { n: 'x' })
  assert.equal(xml.headers['content-type'], 'application/xml')
  assert.equal(xml.body, '<a/>')
  assert.equal(raw.headers['content-type'], 'application/octet-stream')
  assert.deepEqual([...Buffer.from(raw.body, 'utf8')], [7, 8, 9])
  assert.equal(look.method, 'HEAD')
})

test('[24-1a] a line of the headers of a service wins over a line the request carries by itself', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    headers: { 'User-Agent': 'shop/2', Accept: 'application/vnd.shop+json' },
    calls: { one: get('/o', { input: {} }) },
  })
  await calling([shop]).call('shop', 'one', {})
  assert.equal(server.asked[0].headers['user-agent'], 'shop/2')
  assert.equal(server.asked[0].headers.accept, 'application/vnd.shop+json')
})

test('[24-1a] each form of auth is on the request: bearer, header, basic and query, with a secret or a literal', async (t) => {
  const server = await standIn(t, ok)
  const of = (name: string, auth: object) =>
    service(name, { url: server.origin, auth: auth as never, calls: { one: get('/s', { input: {} }) } })
  const { call } = calling(
    [
      of('bearer', { bearer: secret('TOKEN') }),
      of('lined', { header: { name: 'X-Api-Key', value: secret('TOKEN') } }),
      of('basic', { basic: { user: 'shop', password: secret('TOKEN') } }),
      of('query', { query: { name: 'key', value: 'literal-key' } }),
    ],
    { secrets: { TOKEN: 'the-token-value' } },
  )
  for (const name of ['bearer', 'lined', 'basic', 'query']) await call(name, 'one', {})
  const [bearer, lined, basic, query] = server.asked
  assert.equal(bearer.headers.authorization, 'Bearer the-token-value')
  assert.equal(lined.headers['x-api-key'], 'the-token-value')
  assert.equal(basic.headers.authorization, `Basic ${Buffer.from('shop:the-token-value').toString('base64')}`)
  assert.equal(query.path, '/s?key=literal-key')
})

test('[24-1a] a secret that a sign-in needs and that has no value is T0019, and nothing is sent', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    auth: { bearer: secret('NONE') },
    calls: { one: get('/s', { input: {} }) },
  })
  assert.equal(await codeOf(calling([shop]).call('shop', 'one', {})), 'T0019')
  assert.equal(server.asked.length, 0)
})

test('[24-1a] a signer is handed the finished request after the once-only key, once for each try, and its answer is sent; one that throws is T0009 and is not tried again', async (t) => {
  let n = 0
  const server = await standIn(t, (_, response) => {
    n++
    response.writeHead(n === 1 ? 503 : 200, { 'content-type': 'application/json' })
    response.end('{}')
  })
  const seen: string[] = []
  const shop = service('shop', {
    url: server.origin,
    auth: { by: 'signed' },
    onceOnlyHeader: 'Idempotency-Key',
    calls: { pay: post('/pay', { input: { amount: number() } }), fails: post('/fails', { input: {} }) },
  })
  const signed = async (request: Request, o: { service: string }): Promise<Request> => {
    seen.push(`${o.service} ${request.headers.get('idempotency-key')} ${await request.clone().text()}`)
    if (new URL(request.url).pathname === '/fails') throw new Error('the signer broke')
    const made = new Request(request)
    made.headers.set('X-Signature', 'signed')
    return made
  }
  const { call } = calling([shop], { signers: { signed }, once: () => 'key-1' })
  await call('shop', 'pay', { amount: 5 })
  assert.deepEqual(seen, ['shop key-1 {"amount":5}', 'shop key-1 {"amount":5}'])
  assert.deepEqual(
    server.asked.map((one) => [one.headers['x-signature'], one.headers['idempotency-key']]),
    [
      ['signed', 'key-1'],
      ['signed', 'key-1'],
    ],
  )
  const before = server.asked.length
  assert.equal(await codeOf(call('shop', 'fails', {})), 'T0009')
  assert.equal(server.asked.length, before)
  assert.equal(seen.length, 3)
})

test('[24-1a] a redirect to another host carries no header of the sign-in, whatever its name', async (t) => {
  const other = await standIn(t, ok)
  const first = await standIn(t, (_, response) => {
    response.writeHead(302, { location: `${other.origin}/there` })
    response.end()
  })
  const of = (name: string, auth: object) =>
    service(name, { url: first.origin, auth: auth as never, calls: { one: get('/s', { input: {} }) } })
  const { call } = calling(
    [
      of('bearer', { bearer: secret('TOKEN') }),
      of('lined', { header: { name: 'X-Shop-Pass', value: secret('TOKEN') } }),
    ],
    { secrets: { TOKEN: 'the-token-value' } },
  )
  await call('bearer', 'one', {})
  await call('lined', 'one', {})
  assert.equal(first.asked[0].headers.authorization, 'Bearer the-token-value')
  assert.equal(first.asked[1].headers['x-shop-pass'], 'the-token-value')
  for (const one of other.asked) {
    assert.equal(one.headers.authorization, undefined)
    assert.equal(one.headers['x-shop-pass'], undefined)
  }
  assert.equal(other.asked.length, 2)
})

test('[24-1a] the input is held to the types of the call before anything is sent: a field that does not fit and one that is not declared are T0002', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', { url: server.origin, calls: { one: get('/s', { input: { n: number() } }) } })
  const { call } = calling([shop])
  assert.equal(await codeOf(call('shop', 'one', { n: 'two' })), 'T0002')
  assert.equal(await codeOf(call('shop', 'one', { n: 2, more: 1 })), 'T0002')
  assert.equal(server.asked.length, 0)
})

test('[24-1a] the row of the log of a call names the service, the call, the status and the time, and holds no address and no header', async (t) => {
  const server = await standIn(t, ok)
  const shop = service('shop', {
    url: server.origin,
    auth: { bearer: secret('TOKEN') },
    calls: { one: get('/s', { input: {} }) },
  })
  const made = calling([shop], { secrets: { TOKEN: 'the-token-value' } })
  await made.call('shop', 'one', {})
  assert.equal(made.logged.length, 1)
  const [row] = made.logged
  assert.deepEqual(Object.keys(row).sort(), ['call', 'ms', 'service', 'status'])
  assert.deepEqual([row.service, row.call, row.status], ['shop', 'one', 200])
  assert.doesNotMatch(JSON.stringify(made.logged), /the-token-value|127\.0\.0\.1/)
})
