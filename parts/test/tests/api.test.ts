import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { api, keyedApp, keyOf, sent } from './keyedApp.ts'

test('[24-10] a query is called by `GET` with each kind of field after the question mark, and by `POST`', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const asked = new URLSearchParams([
    ['words', 'two words'],
    ['count', '3.5'],
    ['done', 'true'],
    ['at', '2026-10-15T08:00:00.000Z'],
    ['on', '2026-10-15'],
    ['pick', 'b'],
    ['tags', 'red'],
    ['tags', 'blue'],
    ['more', '{"deep":[1,2]}'],
  ])
  const got = await api(app, 'GET', `echo?${asked}`, { key })
  assert.equal(got.status, 200, JSON.stringify(got.body))
  assert.deepEqual(got.body, {
    words: 'two words',
    count: 3.5,
    done: true,
    at: '2026-10-15T08:00:00.000Z',
    on: '2026-10-15',
    pick: 'b',
    tags: ['red', 'blue'],
    more: { deep: [1, 2] },
  })
  const posted = await api(app, 'POST', 'echo', { key, input: { words: 'posted', tags: ['one'] } })
  assert.deepEqual([posted.status, posted.body], [200, { words: 'posted', tags: ['one'] }])
  // A name given twice for a field that is no list is T0002.
  const twice = await api(app, 'GET', 'echo?words=a&words=b', { key })
  assert.deepEqual([twice.status, Object(twice.body).code], [400, 'T0002'])
})

test('[24-10] a change by `GET` is not found, a function that answers nothing is 204, and a function that is not offered is not found', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const byGet = await api(app, 'GET', 'addOrder?title=x', { key })
  assert.deepEqual([byGet.status, Object(byGet.body).code], [404, 'T0001'])
  const added = await api(app, 'POST', 'addOrder', { key, input: { title: 'one' } })
  assert.equal(added.status, 204, 'a change that answers nothing is 204')
  const nothing = await sent(app, 'POST', '/api/forget', {
    key,
    headers: { 'content-type': 'application/json' },
    body: '',
  })
  assert.equal(nothing.status, 204)
  assert.equal(await nothing.text(), '')
  const hidden = await api(app, 'GET', 'hidden', { key })
  const none = await api(app, 'GET', 'noSuchFunction', { key })
  assert.deepEqual([hidden.status, hidden.body], [none.status, none.body])
  assert.equal(hidden.status, 404)
  // Any other method is not found.
  assert.equal((await sent(app, 'PUT', '/api/echo', { key })).status, 404)
})

test('[32-7@8a] a `route` at `/api/orders/:id` answers', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['orderById'] })
  const answer = await sent(app, 'GET', '/api/orders/o-7', { key })
  assert.deepEqual([answer.status, await answer.json()], [200, { id: 'o-7' }])
})

test('[24-10] [16-2@8a] each code that a call to /api/ causes arrives in the problem form with its status, and a 401 names the bearer sign-in', async (t) => {
  const app = await keyedApp(t)
  const scoped = await keyOf(app, { scopes: ['myOrders'] })
  const all = await keyOf(app, { scopes: ['*'] })
  const cases: [string, Promise<Response>, number][] = [
    ['T0006', sent(app, 'GET', '/api/myOrders'), 401],
    ['T3101', sent(app, 'GET', '/api/totals', { key: all.key }), 403],
    ['T3101', sent(app, 'GET', '/api/echo', { key: scoped.key }), 403],
    ['T0001', sent(app, 'GET', '/api/nothingHere', { key: all.key }), 404],
    [
      'T0002',
      sent(app, 'POST', '/api/addOrder', {
        key: all.key,
        headers: { 'content-type': 'application/json' },
        body: '{"title":7}',
      }),
      400,
    ],
    [
      'T0003',
      sent(app, 'POST', '/api/addOrder', {
        key: all.key,
        headers: { 'content-type': 'application/json', 'content-length': String(2 * 1_048_576) },
        body: 'x'.repeat(2 * 1_048_576),
      }),
      413,
    ],
    ['T0004', sent(app, 'GET', '/api/myOrders', { key: all.key, headers: { origin: 'https://evil.example' } }), 403],
    ['T0006', sent(app, 'GET', '/api/myOrders', { key: `tent_01m4vne21rehxa0vhe4ztfk1qx_${'A'.repeat(43)}` }), 401],
  ]
  for (const [code, answering, status] of cases) {
    const answer = await answering
    assert.equal(answer.status, status, code)
    assert.match(String(answer.headers.get('content-type')), /^application\/problem\+json/, code)
    const body = Object(await answer.json())
    assert.equal(body.type, 'about:blank')
    assert.equal(body.code, code)
    assert.equal(body.status, status)
    assert.equal(typeof body.title, 'string')
    assert.equal(typeof body.message, 'string')
    if (status === 401) assert.match(String(answer.headers.get('www-authenticate')), /^Bearer/, code)
  }
})

test('[24-10] a read from a page of another site is T0004, and one of a listed site is answered with the site named, as is its OPTIONS; a site that is not listed is answered 403 with no site named', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const other = await api(app, 'GET', 'myOrders', { key, headers: { origin: 'https://evil.example' } })
  assert.deepEqual([other.status, Object(other.body).code], [403, 'T0004'])
  const listed = await api(app, 'GET', 'myOrders', { key, headers: { origin: 'https://partner.example' } })
  assert.equal(listed.status, 200)
  assert.equal(listed.headers.get('access-control-allow-origin'), 'https://partner.example')
  assert.match(String(listed.headers.get('vary')), /Origin/)
  for (const path of ['/api/myOrders', '/_t/call/myOrders', '/_t/read/myOrders', '/_t/files']) {
    const asked = await sent(app, 'OPTIONS', path, {
      headers: {
        origin: 'https://partner.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    })
    assert.ok(asked.status === 204 || asked.status === 200, `${path} ${asked.status}`)
    assert.equal(asked.headers.get('access-control-allow-origin'), 'https://partner.example', path)
    assert.match(String(asked.headers.get('access-control-allow-methods')), /GET/)
    assert.match(String(asked.headers.get('access-control-allow-methods')), /POST/)
    const headers = String(asked.headers.get('access-control-allow-headers')).toLowerCase()
    for (const one of ['authorization', 'content-type', 'tent-agreed', 'x-partner'])
      assert.match(headers, new RegExp(one))
    assert.equal(asked.headers.get('access-control-allow-credentials'), 'true')
    assert.equal(asked.headers.get('access-control-max-age'), '600')
    assert.match(String(asked.headers.get('access-control-expose-headers')).toLowerCase(), /retry-after/)
    assert.match(String(asked.headers.get('vary')), /Origin/)
  }
  // A form with no script is never taken from a listed site, whatever `api.origins` names.
  const form = await sent(app, 'POST', '/_t/form/addOrder', {
    headers: { origin: 'https://partner.example', 'content-type': 'application/x-www-form-urlencoded' },
    body: 't-at=%2Fwho&title=from+the+partner',
  })
  assert.equal(form.status, 403)
  assert.deepEqual(await app.rows('orders'), [])
  const unlisted = await sent(app, 'OPTIONS', '/api/myOrders', {
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
  })
  assert.equal(unlisted.status, 403)
  assert.equal(unlisted.headers.get('access-control-allow-origin'), null)
})

test('[24-10] a deprecated function answers with `Sunset`, and a refusal by a count says `Retry-After`', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'], perMinute: 2 })
  const old = await api(app, 'GET', 'oldTotals', { key })
  assert.equal(old.status, 200)
  assert.equal(old.headers.get('sunset'), 'Sun, 31 Jan 2027 00:00:00 GMT')
  await api(app, 'GET', 'myOrders', { key })
  const over = await api(app, 'GET', 'myOrders', { key })
  assert.equal(over.status, 429)
  const after = Number(over.headers.get('retry-after'))
  assert.ok(after >= 1 && after <= 60, String(after))
})

test('[24-10] a function that states `danger: ask` is T7120 with a text, runs once when the call comes back with it, does not run for another input, and runs as it is called for a key that states `asks: none`', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const asking = await api(app, 'POST', 'refundAll', { key, input: { reason: 'late' } })
  assert.equal(asking.status, 403)
  const body = Object(asking.body)
  assert.equal(body.code, 'T7120')
  const text = String(Object(body.fields).ask)
  assert.ok(text.length > 20)
  const agreed = { 'tent-agreed': text }
  const other = await api(app, 'POST', 'refundAll', { key, input: { reason: 'early' }, headers: agreed })
  assert.equal(Object(other.body).code, 'T7120', 'a yes fits one input')
  const ran = await api(app, 'POST', 'refundAll', { key, input: { reason: 'late' }, headers: agreed })
  assert.deepEqual([ran.status, ran.body], [200, 'refunded for late'])
  const again = await api(app, 'POST', 'refundAll', { key, input: { reason: 'late' }, headers: agreed })
  assert.equal(Object(again.body).code, 'T7120', 'a yes runs the function once')
  // The same holds at /_t/call/ for a request with no `Origin` of the app.
  const called = await sent(app, 'POST', '/_t/call/refundAll', {
    key,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { reason: 'late' } }),
  })
  assert.equal(Object(Object(await called.json()).error).code, 'T7120')
  const trusted = await keyOf(app, { scopes: ['*'], asks: 'none' })
  const free = await api(app, 'POST', 'refundAll', { key: trusted.key, input: { reason: 'free' } })
  assert.deepEqual([free.status, free.body], [200, 'refunded for free'])
})

test('[24-10] a flow that is offered to the API is an operation that waits and answers', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['weekly'] })
  const answer = await api(app, 'POST', 'weekly', { key, input: { week: 21 } })
  assert.deepEqual([answer.status, answer.body], [200, { week: 21, sum: 42 }])
})

test('[24-10] an agent that is offered to the API is an operation that waits and answers', async (t) => {
  const folder = copyOf(t, 'keyed')
  // The agent stands in a file of its own in the copy, so that the list of the operations of the shop stays.
  writeFileSync(
    join(folder, 'agents.ts'),
    [
      "import { agent, model, secret } from 'tentjs'",
      '',
      "export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })",
      '',
      "export const desk = agent('desk', { about: 'Answers at the desk', model: writer, instructions: 'You help.', tools: [], access: 'signedIn', offer: ['api'], limits: { steps: 4, perRun: { calls: 10 } } })",
      '',
    ].join('\n'),
  )
  const app = await testApp({ folder, secrets: { GITHUB_ID: 'id', GITHUB_SECRET: 'secret' } })
  closing(t, () => app.close())
  app.fake('writer', [{ text: 'Hello at the desk.' }])
  const { key } = await keyOf(app, { scopes: ['desk'] })
  const answer = await api(app, 'POST', 'desk', { key, input: { message: 'Hi.' } })
  assert.deepEqual([answer.status, answer.body], [200, { text: 'Hello at the desk.' }])
})

test('[24-11] the description of the API lists exactly the offered functions, each query as `GET` or `POST` by the rule; nobody is refused it, a key reads it, and `describeTo: anyone` opens it', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['myOrders'] })
  const refused = await sent(app, 'GET', '/api/openapi.json')
  assert.equal(refused.status, 401)
  const read = await sent(app, 'GET', '/api/openapi.json', { key })
  assert.equal(read.status, 200)
  const description = Object(await read.json())
  assert.equal(description.openapi, '3.1.0')
  assert.deepEqual(description.servers, [{ url: '/api' }])
  const operations: Record<string, string> = {}
  for (const [path, methods] of Object.entries<Record<string, { operationId: string }>>(description.paths))
    for (const [method, operation] of Object.entries(methods)) operations[operation.operationId] = `${method} ${path}`
  assert.deepEqual(operations, {
    addOrder: 'post /addOrder',
    echo: 'post /echo',
    forget: 'post /forget',
    holdFile: 'post /holdFile',
    keepFile: 'post /keepFile',
    myOrders: 'get /myOrders',
    oldTotals: 'get /oldTotals',
    outer: 'post /outer',
    refundAll: 'post /refundAll',
    totals: 'get /totals',
    weekly: 'post /weekly',
  })
  assert.equal(description.paths['/oldTotals'].get.deprecated, true)
  assert.equal(description.paths['/myOrders'].get.summary, 'The orders of the caller')
  assert.deepEqual(description.components.securitySchemes, { key: { type: 'http', scheme: 'bearer' } })
})

test('[24-11] `describeTo: anyone` opens the description and the docs page to a caller who is nobody', async (t) => {
  const folder = copyOf(t, 'keyed')
  const project = join(folder, 'tent.ts')
  writeFileSync(
    project,
    readFileSync(project, 'utf8').replace("title: 'Shop',", "title: 'Shop',\n  describeTo: 'anyone',"),
  )
  const open = await testApp({ folder, secrets: { GITHUB_ID: 'id', GITHUB_SECRET: 'secret' } })
  closing(t, () => open.close())
  const anyone = await open.request(new Request('http://localhost/api/openapi.json'))
  assert.equal(anyone.status, 200)
  assert.equal((await open.request(new Request('http://localhost/api/docs'))).status, 200)
})

test('[24-11] the docs page names every function, shows an `about` that holds a tag as text, holds no script, and two builds give the same bytes', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const page = await sent(app, 'GET', '/api/docs', { key })
  assert.equal(page.status, 200)
  assert.match(String(page.headers.get('content-security-policy')), /default-src 'none'/)
  const html = await page.text()
  for (const name of ['addOrder', 'echo', 'myOrders', 'totals', 'weekly', 'refundAll'])
    assert.match(html, new RegExp(name))
  assert.equal(/<script/i.test(html), false)
  assert.ok(html.includes('Does &lt;b&gt;nothing&lt;/b&gt;'), 'a tag in an `about` is text')
  // Two builds of one project write the same two files.
  const files = async (): Promise<Record<string, string>> => {
    const built = await buildProject(copyOf(t, 'keyed'), { for: 'dev' })
    const folder = join(built.bundleFolder, 'api')
    return Object.fromEntries(readdirSync(folder).map((name) => [name, readFileSync(join(folder, name), 'utf8')]))
  }
  const [first, second] = [await files(), await files()]
  assert.deepEqual(
    Object.keys(first)
      .sort()
      .map((name) => name.replace(/\.[0-9a-f]+\./, '.')),
    ['docs.html', 'openapi.json'],
  )
  assert.deepEqual(first, second)
})

test('[24-20] /api/openapi.json passes a standard validator and matches the functions offered', {
  todo: 'a validator of the standard is a package of the tests, and package.json names none yet',
}, () => {
  assert.fail('no validator of the standard is pinned')
})

test('[24-11] a function named `docs` that is offered to the API is T1009, and one that `api.names` gives another name builds', async (t) => {
  const folder = copyOf(t, 'keyed')
  const file = join(folder, 'functions.ts')
  const docs = `\nexport const docs = query('docs', { access: 'signedIn', offer: ['api'], input: {}, output: text(), run: () => 'docs' })\n`
  writeFileSync(file, readFileSync(file, 'utf8') + docs)
  const refused = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    refused.findings.filter((one) => one.code === 'T1009').map((one) => one.where?.definition),
    ['docs'],
  )
  const project = join(folder, 'tent.ts')
  const named = readFileSync(project, 'utf8').replace(
    "headers: ['X-Partner']",
    "headers: ['X-Partner'], names: { docs: 'documents' }",
  )
  writeFileSync(project, named)
  const built = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
})
