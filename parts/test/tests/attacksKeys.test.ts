import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { tempOf } from './projects.ts'
import { api, called, keyedApp, keyOf, sent } from './keyedApp.ts'
import { bytesUnder } from './storms.ts'
import { held } from '../../../rig/budgets.ts'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// The last of 43 characters of base64 carries two bits that 32 bytes do not use: a change there may decode the same.
const lastChanged = (key: string): string => {
  const at = alphabet.indexOf(key.slice(-1))
  return key.slice(0, -1) + alphabet[at ^ 1]
}

const firstChanged = (key: string): string => {
  const head = key.length - 43
  const at = alphabet.indexOf(key.charAt(head))
  return key.slice(0, head) + alphabet[(at + 1) % 64] + key.slice(head + 1)
}

/** The answer of the API to a request as nobody, whole, to compare with what a key is answered. */
const asNobody = async (app: TestApp, key?: string): Promise<string> => {
  const one = await api(app, 'GET', 'myOrders', key ? { key } : {})
  return JSON.stringify([one.status, one.headers.get('www-authenticate'), Object(one.body).code])
}

/** The messages a live connection is sent while a watch is asked, until one of them names a code or a value. */
async function watched(app: TestApp, key: string, query: string): Promise<Record<string, unknown>[]> {
  const end = app.live(new Request('http://localhost/_t/live', { headers: { authorization: `Bearer ${key}` } }))
  const got: Record<string, unknown>[] = []
  end.each((message) => void got.push(Object(message)))
  end.send({ t: 'watch', id: 'w', query, input: {} })
  const told = (): boolean => got.some((one) => one.t === 'result' || JSON.stringify(one).includes('"code"'))
  for (let i = 0; i < 300 && !told(); i++) await new Promise((done) => setTimeout(done, 10))
  end.close()
  return got
}

test('[05-11.15] a guessed key, a removed key, an ended key, an id of no key and a key that differs in its last character are nobody, each in the same time', async (t) => {
  const app = await keyedApp(t)
  const nobody = await asNobody(app)
  const { key } = await keyOf(app, { scopes: ['*'] })
  assert.equal((await api(app, 'GET', 'myOrders', { key })).status, 200)
  const removed = await keyOf(app, { scopes: ['*'] })
  await app.as('system').call('removeKey', { id: removed.id })
  const ended = await keyOf(app, { scopes: ['*'], for: '1 hour' })
  app.clock.advance('2 hours')
  const tried = {
    guessed: `tent_${key.split('_')[1]}_${'Q'.repeat(43)}`,
    removed: removed.key,
    ended: ended.key,
    'an id of no key': `tent_01m4vne21rehxa0vhe4ztfk1qx_${key.slice(-43)}`,
    'the last character changed': lastChanged(key),
    'the first character changed': firstChanged(key),
  }
  for (const [what, one] of Object.entries(tried)) assert.equal(await asNobody(app, one), nobody, `${what} is nobody`)
  const timed = async (one: string): Promise<number> => {
    const began = performance.now()
    for (let n = 0; n < 40; n++) await api(app, 'GET', 'myOrders', { key: one })
    return performance.now() - began
  }
  await timed(tried.guessed)
  // The cases are taken in turn five times and each is held by its quickest: other work only ever adds time.
  const times = [Infinity, Infinity, Infinity]
  for (let round = 0; round < 5; round++) {
    times[0] = Math.min(times[0], await timed(tried.guessed))
    times[1] = Math.min(times[1], await timed(tried['an id of no key']))
    times[2] = Math.min(times[2], await timed(tried.removed))
  }
  held('keys.sameTime', (Math.max(...times) / Math.min(...times) - 1) * 100, 'percent')
})

test('[05-11.16] a key with the scope of one function is T3101 at /api/, at /_t/call/ and as a watch; its own function that calls another inside runs', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['outer'] })
  assert.equal(Object((await api(app, 'GET', 'myOrders', { key })).body).code, 'T3101')
  assert.equal(Object((await called(app, 'myOrders', {}, key)).error).code, 'T3101')
  const got = await watched(app, key, 'myOrders')
  assert.ok(JSON.stringify(got).includes('T3101'), `the watch is refused with T3101: ${JSON.stringify(got)}`)
  assert.equal(
    got.some((one) => one.t === 'result'),
    false,
  )
  assert.equal((await api(app, 'POST', 'outer', { key, input: {} })).body, 'outer and inner')
})

test('[05-11.17] a key made for a user loses a role at the next call once the user lost it, and is nobody once the user is removed', async (t) => {
  const app = await keyedApp(t)
  const maya = await app.user({ name: 'Maya', roles: ['staff'] })
  const { key } = await keyOf(app, { scopes: ['*'], user: maya.user?.id })
  assert.equal((await api(app, 'GET', 'totals', { key })).status, 200)
  await app.write([{ change: 'users', id: String(maya.user?.id), values: { roles: [] } }], { as: 'system' })
  assert.equal(Object((await api(app, 'GET', 'totals', { key })).body).code, 'T3101')
  await app.write([{ remove: 'users', id: String(maya.user?.id) }], { as: 'system' })
  assert.equal(await asNobody(app, key), await asNobody(app))
})

test('[05-11.18] a copy of the data file holds the fingerprints of keys and no key, and a key read from it calls nothing', async (t) => {
  const temp = tempOf(t)
  const app = await keyedApp(t)
  const made = [await keyOf(app, { scopes: ['*'] }), await keyOf(app, { scopes: ['*'], roles: ['staff'] })]
  await app.close()
  for (const { key } of made) {
    const random = Buffer.from(key.slice(-43))
    const asBytes = Buffer.from(key.slice(-43), 'base64url')
    for (const one of bytesUnder(temp)) {
      assert.equal(one.bytes.includes(random), false, `${one.file} holds no key as text`)
      assert.equal(one.bytes.includes(asBytes), false, `${one.file} holds no key as bytes`)
    }
  }
})

test('[05-11.20] a function that is not offered, asked for at /api/, is answered as a name that is no function', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  for (const method of ['GET', 'POST']) {
    const hidden = await api(app, method, 'hidden', { key, ...(method === 'POST' ? { input: {} } : {}) })
    const none = await api(app, method, 'noSuchThing', { key, ...(method === 'POST' ? { input: {} } : {}) })
    assert.equal(hidden.status, 404)
    assert.deepEqual(hidden.body, none.body)
    assert.deepEqual([...hidden.headers].sort(), [...none.headers].sort())
  }
})

test('[05-11.25] a key with the scope of one function: at a route T3101, at a screen nobody, at an upload for another function T3101, at a download of a row it may read T3101', async (t) => {
  const app = await keyedApp(t)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const filed = await keyOf(app, { scopes: ['files', 'holdFile'], user: maya.user?.id })
  const up = await sent(app, 'POST', '/_t/files?name=a.txt', {
    key: filed.key,
    headers: { 'content-type': 'text/plain', 'content-length': '5' },
    body: 'hello',
  })
  const fileId = String(Object(await up.json()).value.id)
  await api(app, 'POST', 'holdFile', { key: filed.key, input: { title: 'held', doc: fileId } })
  const { key } = await keyOf(app, { scopes: ['myOrders'], user: maya.user?.id })
  const route = await sent(app, 'GET', '/report', { key })
  assert.equal(route.status, 403)
  assert.match(await route.text(), /T3101/)
  assert.match(await (await sent(app, 'GET', '/who', { key })).text(), /Drawn for a visitor/)
  const forAnother = await sent(app, 'POST', '/_t/files?name=a.txt&for=keepFile&field=doc', {
    key,
    headers: { 'content-type': 'text/plain', 'content-length': '5' },
    body: 'hello',
  })
  assert.equal(forAnother.status, 403)
  assert.match(await forAnother.text(), /T3101/)
  const download = await sent(app, 'GET', `/_t/files/${fileId}`, { key })
  assert.equal(download.status, 403)
  assert.match(await download.text(), /T3101/)
})

test("[05-11.26] `/_t/live` opened with a made-up key, a visitor's cookie and no `Origin` is T0004", async (t) => {
  const app = await keyedApp(t)
  const visitor = await sent(app, 'GET', '/who')
  const cookie = visitor.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')
  const { key } = await keyOf(app, { scopes: ['*'] })
  const headers = (one: string): Record<string, string> => ({
    authorization: `Bearer ${one}`,
    cookie: cookie || 'tent_visitor.shop=x',
  })
  for (const one of [`tent_01m4vne21rehxa0vhe4ztfk1qx_${'A'.repeat(43)}`, key])
    assert.throws(() => app.live(new Request('http://localhost/_t/live', { headers: headers(one) })), { code: 'T0004' })
})

test('[05-11.29] a key written into the address of a request is not read: nobody', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const nobody = await asNobody(app)
  for (const query of [`key=${key}`, `access_token=${key}`, `authorization=Bearer%20${key}`, `api_key=${key}`]) {
    const one = await sent(app, 'GET', `/api/myOrders?${query}`)
    assert.notEqual(one.status, 200, query)
    const body = Object(await one.json())
    assert.ok(body.code === 'T0006' || body.code === 'T0002', `${query}: ${JSON.stringify(body)}`)
  }
  assert.equal((await called(app, 'myOrders', {}, undefined)).ok, false)
  assert.equal(await asNobody(app), nobody)
})

test('[05-11.41] a key that was made for a user is nobody at the return of a connect, at `/_t/screen` and at `/_t/form/`', async (t) => {
  const app = await keyedApp(t)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const { key } = await keyOf(app, { scopes: ['*'], user: maya.user?.id })
  const back = await sent(app, 'GET', '/_t/connect/github?code=c&state=s', { key })
  // Nobody at the return is sent once to the sign-in, or answered `connect=failed`: never handled as maya.
  const where = back.headers.get('location') ?? ''
  assert.equal(back.status, 302)
  assert.ok(!where.includes('connect=done'), where)
  const screen = await sent(app, 'GET', '/_t/screen?path=%2Fwho', { key })
  assert.doesNotMatch(await screen.text(), new RegExp(String(maya.user?.id)))
  const form = await sent(app, 'POST', '/_t/form/addOrder', {
    key,
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost' },
    body: 'title=by+a+key',
  })
  await form.text()
  assert.deepEqual(await app.rows('orders'), [], 'the form wrote nothing as maya')
})

test('[05-11.21] `/api/openapi.json` as nobody is T0006, and it holds no rule, no code and no function that is not offered', async (t) => {
  const app = await keyedApp(t)
  const asNone = await sent(app, 'GET', '/api/openapi.json')
  assert.equal(asNone.status, 401)
  assert.equal(Object(await asNone.json()).code, 'T0006')
  const { key } = await keyOf(app, { scopes: ['myOrders'] })
  const read = await sent(app, 'GET', '/api/openapi.json', { key })
  assert.equal(read.status, 200)
  const text = await read.text()
  for (const not of ['hidden', 'inner', 'makeKey', 'listKeys', 'sneakKey', 'signedIn', 'db.system', '=>'])
    assert.equal(text.includes(not), false, `the description holds no ${not}`)
  const docs = await sent(app, 'GET', '/api/docs', { key })
  const page = await docs.text()
  for (const not of ['hidden', 'makeKey', 'signedIn', 'db.system'])
    assert.equal(page.includes(not), false, `the docs page holds no ${not}`)
})
