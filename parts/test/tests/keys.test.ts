import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import test from 'node:test'
import { closing, tempOf } from './projects.ts'
import { api, called, keyedApp, keyOf, sent } from './keyedApp.ts'
import { bytesUnder } from './storms.ts'
import { notDropped } from './started.ts'

test('[24-9] a key is shown once, in its form, and the data holds the fingerprint of its random part alone', async (t) => {
  const temp = tempOf(t)
  const app = await keyedApp(t)
  const { id, key } = await keyOf(app, { scopes: ['myOrders'] })
  assert.match(key, /^tent_[0-9a-z]{26}_[A-Za-z0-9_-]{43}$/)
  assert.equal(key.split('_')[1], id)
  const listed = Object(await app.as('system').call('listKeys', {}))
  assert.equal(JSON.stringify(listed).includes(key.slice(-43)), false, 'a list shows no key')
  const secretPart = key.slice(-43)
  for (const one of bytesUnder(temp))
    assert.equal(one.bytes.includes(Buffer.from(secretPart)), false, 'no file of the data holds the key')
})

test('[24-9] a function outside the scopes of a key is T3101 at /api/ and at /_t/call/, and so is a route; a key of one function calls it also where it calls another inside', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['outer'] })
  assert.equal((await api(app, 'POST', 'outer', { key, input: {} })).body, 'outer and inner')
  assert.equal((await called(app, 'outer', {}, key)).ok, true)
  assert.equal(Object((await api(app, 'GET', 'myOrders', { key })).body).code, 'T3101')
  assert.equal(Object((await called(app, 'myOrders', {}, key)).error).code, 'T3101')
  const route = await sent(app, 'GET', '/report', { key })
  assert.equal(route.status, 403)
  const scoped = await keyOf(app, { scopes: ['report'] })
  assert.equal(await (await sent(app, 'GET', '/report', { key: scoped.key })).text(), 'the report')
})

test("[24-9] a key with a role passes a rule of that role; a key made for a user reads that user's rows and loses a role when the user does", async (t) => {
  const app = await keyedApp(t)
  const staffKey = await keyOf(app, { scopes: ['*'], roles: ['staff'] })
  const staffTotals = await api(app, 'GET', 'totals', { key: staffKey.key })
  assert.equal(staffTotals.status, 200, JSON.stringify(staffTotals.body))
  const maya = await app.user({ name: 'Maya', roles: ['staff'] })
  await app.as(maya).call('addOrder', { title: 'of maya' })
  const mayaKey = await keyOf(app, { scopes: ['*'], user: maya.user?.id })
  assert.deepEqual((await api(app, 'GET', 'myOrders', { key: mayaKey.key })).body, [{ title: 'of maya' }])
  assert.equal((await api(app, 'GET', 'totals', { key: mayaKey.key })).status, 200)
  await app.write([{ change: 'users', id: String(maya.user?.id), values: { roles: [] } }], { as: 'system' })
  assert.equal((await api(app, 'GET', 'totals', { key: mayaKey.key })).status, 403)
})

test('[24-9] a removed and an ended key is nobody; `keys.list` and `keys.remove` work; the 121st call of a minute under `perMinute: 120` is T0005', async (t) => {
  const app = await keyedApp(t)
  const { id, key } = await keyOf(app, { scopes: ['*'], perMinute: 120 })
  for (let n = 0; n < 120; n++) assert.equal((await api(app, 'GET', 'myOrders', { key })).status, 200, `call ${n + 1}`)
  const over = await api(app, 'GET', 'myOrders', { key })
  assert.equal(over.status, 429)
  assert.equal(Object(over.body).code, 'T0005')
  assert.ok(Number(over.headers.get('retry-after')) > 0)
  const listed: { id: string; name: string; perMinute: number }[] = Object(await app.as('system').call('listKeys', {}))
  assert.deepEqual(
    listed.map((one) => [one.id, one.perMinute]),
    [[id, 120]],
  )
  await app.as('system').call('removeKey', { id })
  assert.equal(Object((await api(app, 'GET', 'myOrders', { key })).body).code, 'T0006')
  const ending = await keyOf(app, { scopes: ['*'], for: '1 hour' })
  assert.equal((await api(app, 'GET', 'myOrders', { key: ending.key })).status, 200)
  app.clock.advance('2 hours')
  assert.equal(Object((await api(app, 'GET', 'myOrders', { key: ending.key })).body).code, 'T0006')
})

test('[24-9] `keys.add` in a function that states no `system` is T0013; a request for a screen with a key is answered as for nobody; `connections.start` under a key made for a user answers an address', async (t) => {
  const app = await keyedApp(t)
  await assert.rejects(app.as('nobody').call('sneakKey', {}), { code: 'T0013' })
  const maya = await app.user({ name: 'Maya', roles: [] })
  const { key } = await keyOf(app, { scopes: ['*'], user: maya.user?.id })
  const page = await sent(app, 'GET', '/who', { key })
  assert.match(await page.text(), /Drawn for a visitor/)
  const screened = await keyOf(app, { scopes: ['screens'], user: maya.user?.id })
  assert.match(await (await sent(app, 'GET', '/who', { key: screened.key })).text(), /Drawn for /)
  const started = await called(app, 'startConnect', {}, key)
  assert.equal(started.ok, true, JSON.stringify(started))
  assert.match(String(started.value), /^https:\/\/github\.com\/login\/oauth\/authorize\?/)
})

test("[24-9] `/_t/live` opened by a key with no `Origin` is taken, and with a made-up key beside a visitor's cookie it is T0004", async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const end = app.live(new Request('http://localhost/_t/live', { headers: { authorization: `Bearer ${key}` } }))
  closing(t, () => end.close())
  const got: Record<string, unknown>[] = []
  end.each((message) => void got.push(Object(message)))
  end.send({ t: 'watch', id: 'w', query: 'myOrders', input: {} })
  const result = (): boolean => got.some((one) => one.t === 'result')
  for (let i = 0; i < 300 && !result(); i++) await new Promise((done) => setTimeout(done, 10))
  assert.deepEqual(
    got.filter((one) => one.t === 'result').map((one) => one.value),
    [[]],
  )
  const visitor = await sent(app, 'GET', '/who')
  const cookie = visitor.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')
  assert.throws(
    () =>
      app.live(
        new Request('http://localhost/_t/live', {
          headers: {
            authorization: `Bearer tent_01m4vne21rehxa0vhe4ztfk1qx_${'A'.repeat(43)}`,
            cookie: cookie || 'tent_visitor.shop=x',
          },
        }),
      ),
    { code: 'T0004' },
  )
})

test('[24-9] an id of no key takes the time of a wrong key: its check hashes and compares as for a wrong key', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  // A last character keeps its two lowest bits empty, so the wrong key has the form of a key and is compared.
  const wrong = `${key.slice(0, -1)}${key.endsWith('A') ? 'E' : 'A'}`
  const none = `tent_01m4vne21rehxa0vhe4ztfk1qx_${key.slice(-43)}`
  // The time of a request hides the time of one hash: what each check does is counted instead, call by call.
  const hashes = t.mock.method(crypto, 'createHash')
  const compares = t.mock.method(crypto, 'timingSafeEqual')
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })
  const work = async (one: string): Promise<number[]> => {
    const before = [hashes.mock.callCount(), compares.mock.callCount()]
    const answer = await api(app, 'GET', 'myOrders', { key: one })
    return [answer.status, hashes.mock.callCount() - before[0], compares.mock.callCount() - before[1]]
  }
  await work(wrong)
  const [ofWrong, ofNone] = [await work(wrong), await work(none)]
  assert.ok(ofWrong[2] > 0, 'a wrong key is compared')
  assert.deepEqual(ofNone, ofWrong)
})

test('[24-9] `lastUsedAt` of a key is written at its use, once a minute at most', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  const used = async (): Promise<unknown> => Object(await app.as('system').call('listKeys', {}))[0]?.lastUsedAt
  assert.equal(await used(), undefined)
  await api(app, 'GET', 'myOrders', { key })
  const first = await used()
  assert.ok(first !== undefined, 'the first use is written')
  app.clock.advance('10 seconds')
  await api(app, 'GET', 'myOrders', { key })
  assert.deepEqual(await used(), first, 'a use within the minute writes nothing')
  app.clock.advance('1 minute')
  await api(app, 'GET', 'myOrders', { key })
  assert.notDeepEqual(await used(), first)
})

test('[05-8.10@8a] a run that outlives its starter: the key is removed, and the run fails with T3101 when it is next taken up', async (t) => {
  const app = await keyedApp(t)
  const { id } = await keyOf(app, { scopes: ['*'] })
  const { run } = notDropped(
    await app.start('outlives', undefined, { as: { kind: 'key', key: { id, scopes: ['*'], roles: [] } } }),
  )
  for (let i = 0; i < 500 && app.runs.read(run)?.state !== 'waiting'; i++)
    await new Promise((done) => setTimeout(done, 10))
  assert.equal(app.runs.read(run)?.state, 'waiting')
  await app.as('system').call('removeKey', { id })
  app.clock.advance('61 minutes')
  for (let i = 0; i < 500 && app.runs.read(run)?.state !== 'failed'; i++)
    await new Promise((done) => setTimeout(done, 10))
  assert.equal(app.runs.read(run)?.error?.code, 'T3101')
  assert.deepEqual(await app.rows('orders'), [], 'no step of the run was carried out after its key was gone')
})

test("[24-9] [24-12] without the scope `files` a key uploads for a function of its scopes and downloads the file a call answered it; with it, it uploads where `uploads` lets signed-in callers in, downloads its own loose file and a file that a row it may read holds, and is refused another's", async (t) => {
  const app = await keyedApp(t)
  const upload = (key: string, query = '') =>
    sent(app, 'POST', `/_t/files?name=a.txt${query}`, {
      key,
      headers: { 'content-type': 'text/plain', 'content-length': '5' },
      body: 'hello',
    })
  const plain = await keyOf(app, { scopes: ['keepFile'] })
  assert.equal((await upload(plain.key)).status, 403)
  const forIt = await upload(plain.key, '&for=keepFile&field=doc')
  assert.equal(forIt.status, 200)
  const fileId = String(Object(await forIt.json()).value.id)
  const kept = await api(app, 'POST', 'keepFile', { key: plain.key, input: { doc: fileId } })
  assert.equal(kept.body, fileId)
  assert.equal((await sent(app, 'GET', `/_t/files/${fileId}`, { key: plain.key })).status, 200)
  const maya = await app.user({ name: 'Maya', roles: [] })
  const files = await keyOf(app, { scopes: ['files', 'holdFile'], user: maya.user?.id })
  const own = await upload(files.key)
  assert.equal(own.status, 200)
  const ownId = String(Object(await own.json()).value.id)
  assert.equal(await (await sent(app, 'GET', `/_t/files/${ownId}`, { key: files.key })).text(), 'hello')
  await api(app, 'POST', 'holdFile', { key: files.key, input: { title: 'held', doc: ownId } })
  assert.equal((await sent(app, 'GET', `/_t/files/${ownId}`, { key: files.key })).status, 200)
  // A file of another caller is refused, as one that is not there.
  assert.equal((await sent(app, 'GET', `/_t/files/${fileId}`, { key: files.key })).status, 404)
})
