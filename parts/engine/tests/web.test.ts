import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { sqliteStore } from '../../data/index.ts'
import type { OnRequest } from '../onRequest.ts'
import {
  addUser,
  bundled,
  engineOf,
  logRows,
  nobody,
  portOf,
  running,
  send,
  system,
  testClock,
  workFolder,
} from './apps.ts'

/** Answers how many counts of the rate limits a data folder holds, read beside the engine that has it open. */
function rateRows(dataFolder: string): number {
  const store = sqliteStore()
  store.open(dataFolder, { readOnly: true })
  try {
    return Number(store.read({ from: '_t_rate', count: true }, system).value)
  } finally {
    store.close()
  }
}

/** The rows of the log that tell one call apart from another, without its moment and the time it took. */
const told = (dataFolder: string, name: string) =>
  logRows(dataFolder, 'calls')
    .filter((row) => row.name === name)
    .map((row) => [row.app, row.name, row.kind, row.callerKind, row.callerId, row.ok, row.code])

test('[21-13] app.call and a web call of the same function give the same answer and the same log line', async (t) => {
  const { app, origin, dataFolder } = await running(t)
  const input = { text: 'the same', n: 7, deep: { list: [1, 'two', null, { three: true }] } }

  // A call that works: the value is the same, where the wire carries it as JSON.
  const direct = await app.call('echo', input, { as: nobody })
  const web = await send(app, `${origin}/_t/call/echo`, { input })
  assert.equal(web.status, 200)
  assert.deepEqual(web.body, { ok: true, value: JSON.parse(JSON.stringify(direct)) })
  assert.deepEqual(told(dataFolder, 'echo'), [
    ['desk', 'echo', 'query', 'nobody', null, 1, null],
    ['desk', 'echo', 'query', 'nobody', null, 1, null],
  ])
  // A moment travels as text in the standard form.
  const at = await app.call('moment', {}, { as: nobody })
  const sent = await send(app, `${origin}/_t/call/moment`)
  assert.ok(at instanceof Date)
  assert.match(String(sent.body.value), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)

  // A call that the rule refuses, one that the input fails, and one that fails by its own word.
  for (const [name, given, code, status] of [
    ['countNotes', {}, 'T0006', 401],
    ['echo', { text: 5 }, 'T0002', 400],
    ['openFail', { title: 'x' }, 'not-today', 400],
  ] as const) {
    const before = told(dataFolder, name).length
    await assert.rejects(app.call(name, given, { as: nobody }), { code })
    const answer = await send(app, `${origin}/_t/call/${name}`, { input: given })
    assert.deepEqual([answer.status, answer.body.ok, answer.error.code], [status, false, code], name)
    const [first, second] = told(dataFolder, name).slice(before)
    assert.deepEqual(first, second, name)
    assert.deepEqual(first?.slice(5), [0, code], name)
  }
})

test('[21-1] each step of the door has a test that tries to skip it', async (t) => {
  const { app, origin, dataFolder } = await running(t, {
    change: (description) => {
      const { access: _, ...rest } = description.functions.publicTags
      description.functions.publicTags = rest
    },
  })
  await addUser(app, 'Ada', ['staff'], 5000)
  const ran = () => logRows(dataFolder, 'lines').filter((row) => row.message === 'echo ran').length

  // Step 1: a header that starts `x-tent-` is never read, whatever it claims.
  const forged = {
    'x-tent-user': 'ada',
    'X-Tent-Caller': 'system',
    'x-tent-admin': 'yes',
    'x-tent-roles': 'staff',
    'x-tent-as': JSON.stringify(system),
  }
  const who = await send(app, `${origin}/_t/call/whoAmI`, { headers: forged })
  assert.deepEqual(who.body, { ok: true, value: 'no user' })
  assert.deepEqual([(await send(app, `${origin}/_t/call/countNotes`, { headers: forged })).error.code], ['T0006'])
  // Nor does a field of the body name a caller: a page drawn for a user, sent by nobody, is told that it changed.
  const asked = await send(app, `${origin}/_t/call/whoAmI`, { body: JSON.stringify({ input: {}, as: 'system' }) })
  assert.deepEqual([asked.body.ok, asked.error.code, asked.body.caller], [false, 'T3101', 'changed'])
  const named = await send(app, `${origin}/_t/call/whoAmI`, { body: JSON.stringify({ input: {}, caller: system }) })
  assert.deepEqual([named.status, named.error.code], [400, 'T0002'])

  // Step 2: a call from a page of another site is refused before the function runs.
  const before = ran()
  const other = await send(app, `${origin}/_t/call/echo`, {
    input: { text: 'x' },
    headers: { origin: 'https://evil.example' },
  })
  assert.deepEqual([other.status, other.error.code], [403, 'T0004'])
  assert.equal(ran(), before)

  // Step 5: nothing but a function is reached by a name.
  for (const name of ['nothing', 'notes', 'desk', '_t_meta', 'echo/..', 'echo.run', '..%2Fecho', '']) {
    const answer = await send(app, `${origin}/_t/call/${name}`)
    assert.deepEqual([answer.status, answer.error.code], [404, 'T0001'], name)
  }
  // Step 6: a function with no rule is open to nobody, and a rule holds for a caller who is nobody.
  assert.equal((await send(app, `${origin}/_t/call/publicTags`)).error.code, 'T0006')
  assert.equal((await send(app, `${origin}/_t/call/staffTags`)).error.code, 'T0006')
  // Step 7: the input is held to its types before the function runs.
  const wrong = await send(app, `${origin}/_t/call/echo`, { input: { text: 5, more: true } })
  assert.deepEqual(
    [wrong.status, wrong.error.code, wrong.error.fields],
    [400, 'T0002', { text: 'type', more: 'unknown' }],
  )
  assert.equal(ran(), before)
  // Step 9: a `private` column does not leave, through a stated output or through a row that has no type.
  const people = await send(app, `${origin}/_t/call/openPeople`)
  assert.deepEqual(people.body.value, [{ name: 'Ada' }])
  const users = await send(app, `${origin}/_t/call/openUsers`)
  assert.equal(JSON.stringify(users.body).includes('5000'), false)
  assert.deepEqual(Object.keys(Object(Object(users.body.value)[0])).sort(), [
    'createdAt',
    'id',
    'name',
    'roles',
    'updatedAt',
  ])
  // Step 10: a call that was refused is in the log like one that worked.
  assert.deepEqual(told(dataFolder, 'staffTags'), [['desk', 'staffTags', 'query', 'nobody', null, 0, 'T0006']])
  assert.deepEqual(told(dataFolder, 'nothing'), [['desk', 'nothing', null, 'nobody', null, 0, 'T0001']])
})

test('[21-14] [16-2] each code that has a status arrives with it, an own fail with 400, and any other error as T0009 with a ref that finds it in the log', async (t) => {
  const { clock, advance } = testClock()
  const spinning = [
    { for: 'i', of: { fn: 'range', args: [0, 1_000_000] }, do: [{ do: { name: ['i'] } }] },
    { return: 1 },
  ]
  const { app, origin, dataFolder, bundle } = await running(t, {
    engine: { makers: { clock: () => clock } },
    bodies: { openSpin: { run: spinning } },
    change: (description) =>
      Object.assign(description.project, {
        limits: { functionDepth: 6, queryTime: 60, callSize: 4096, anyonePerMinute: 30 },
      }),
  })
  const call = (name: string, o: Parameters<typeof send>[2] = {}) => send(app, `${origin}/_t/call/${name}`, o)
  const seen = async (work: ReturnType<typeof call>) => {
    const answer = await work
    return [answer.status, answer.error.code, answer.error.name]
  }

  // The codes of the door.
  assert.deepEqual(await seen(call('nothing')), [404, 'T0001', 'not-found'])
  assert.deepEqual(await seen(call('echo', { method: 'GET' })), [404, 'T0001', 'not-found'])
  assert.deepEqual(await seen(call('echo', { method: 'PUT' })), [404, 'T0001', 'not-found'])
  assert.deepEqual(await seen(call('echo', { headers: { 'content-type': 'text/plain' } })), [404, 'T0001', 'not-found'])
  assert.deepEqual(
    await seen(
      call('echo', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'input=%7B%7D' }),
    ),
    [404, 'T0001', 'not-found'],
  )
  assert.deepEqual(await seen(call('echo', { input: {} })), [400, 'T0002', 'bad-input'])
  assert.deepEqual(await seen(call('echo', { body: '{ "input": ' })), [400, 'T0002', 'bad-input'])
  assert.deepEqual(await seen(call('echo', { input: { text: 'x'.repeat(5000) } })), [413, 'T0003', 'too-large'])
  assert.deepEqual(await seen(call('echo', { headers: { 'content-encoding': 'gzip' } })), [413, 'T0003', 'too-large'])
  assert.deepEqual(await seen(call('echo', { headers: { origin: 'https://other.example' } })), [
    403,
    'T0004',
    'wrong-origin',
  ])
  assert.deepEqual(await seen(call('echo', { headers: { origin: 'null' } })), [403, 'T0004', 'wrong-origin'])
  assert.deepEqual(await seen(call('countNotes')), [401, 'T0006', 'not-signed-in'])
  assert.deepEqual(await seen(call('whoAmI', { version: 'a-version-that-never-was' })), [409, 'T0007', 'version-gone'])
  assert.deepEqual(await seen(call('whoAmI', { version: '../../etc/passwd' })), [409, 'T0007', 'version-gone'])
  assert.deepEqual(await seen(call('openSpin')), [500, 'T0008', 'took-too-long'])
  assert.deepEqual(await seen(send(app, 'http://elsewhere.example/_t/call/whoAmI')), [421, 'T0017', 'wrong-name'])
  // A call that names the running version is served by it, and T0007 names the running one.
  assert.deepEqual((await call('whoAmI', { version: bundle.versionId })).body, { ok: true, value: 'no user' })
  assert.equal((await call('whoAmI', { version: 'gone' })).error.running, bundle.versionId)
  // The request's own origin, and no origin at all, pass.
  assert.equal((await call('whoAmI', { headers: { origin } })).status, 200)

  // The codes of the data, with the status that the door gives them.
  advance(60_000)
  const word = Object((await call('addWord', { input: { text: 'first' } })).body.value)
  assert.deepEqual(await seen(call('addWord', { input: { text: 'first' } })), [409, 'T2101', 'not-unique'])
  const use = await call('useWord', { input: { word: word.id } })
  assert.equal(use.status, 200)
  assert.deepEqual(await seen(call('dropWord', { input: { word: word.id } })), [409, 'T2102', 'link-in-use'])
  assert.deepEqual(await seen(call('renameWord', { input: { word: 'no-such-row', text: 'x' } })), [
    404,
    'T2103',
    'row-not-found',
  ])
  assert.deepEqual(await seen(call('useWord', { input: { word: 'no-such-row' } })), [400, 'T2104', 'link-missing'])
  assert.deepEqual(await seen(call('tagOpenly', { input: { name: 'x' } })), [403, 'T3101', 'access-denied'])

  // An own fail arrives with the builder's code and words, and 400.
  const own = await call('openFail', { input: { title: 'late' } })
  assert.equal(own.status, 400)
  assert.deepEqual(own.error, {
    code: 'not-today',
    name: 'not-today',
    message: 'No note named late is taken today.',
    fields: { title: 'taken' },
  })

  // Anything else is T0009 with a ref, which finds the error in the log: a code that has no status, and an error
  // of the code of the app.
  for (const [name, code, words] of [
    ['openRaw', 'T0013', /full access/],
    ['openBreak', 'T0009', /hunter2/],
  ] as const) {
    const answer = await call(name)
    assert.deepEqual([answer.status, answer.error.code, answer.error.name], [500, 'T0009', 'internal'], name)
    assert.match(String(answer.error.ref), /^[0-9a-z]{8}$/, name)
    const row = logRows(dataFolder, 'calls').findLast((one) => one.name === name)
    assert.deepEqual([row?.code, row?.ref], [code, answer.error.ref], name)
    const kept = logRows(dataFolder, 'errors').find((one) => one.ref === answer.error.ref)
    assert.match(String(kept?.message), words, name)
  }

  // T0005: one call more in a minute than a caller who is nobody may make from one address.
  advance(60_000)
  for (let i = 0; i < 30; i++) assert.equal((await call('whoAmI', { from: '203.0.113.5' })).status, 200, `call ${i}`)
  assert.deepEqual(await seen(call('whoAmI', { from: '203.0.113.5' })), [429, 'T0005', 'rate-limited'])
  assert.deepEqual(await seen(call('nothing', { from: '203.0.113.5' })), [429, 'T0005', 'rate-limited'])
  // Another address has a count of its own, and so has an address of the newer kind in another network.
  assert.equal((await call('whoAmI', { from: '203.0.113.6' })).status, 200)
  for (let i = 0; i < 30; i++) assert.equal((await call('whoAmI', { from: '2001:db8:1:2::5' })).status, 200)
  assert.equal((await call('whoAmI', { from: '2001:db8:1:2:ffff::9' })).status, 429)
  assert.equal((await call('whoAmI', { from: '2001:db8:1:3::5' })).status, 200)
  // When the minute has passed the address is taken again, and the counts of the ended minute are gone.
  advance(61_000)
  assert.equal((await call('whoAmI', { from: '203.0.113.5' })).status, 200)
  advance(61_000)
  assert.equal(rateRows(dataFolder), 0)
})

test('[21-16] in the mode live an error answer holds no fix and only the general sentence of its code, and in test it holds the full message', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  const answers: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const mode of ['live', 'test', 'development'] as const) {
    const dataFolder = join(work, mode)
    const app = await engine.open(bundle.folder, { dataFolder, mode })
    const origin = `http://localhost:${portOf(dataFolder)}`
    answers[mode] = {
      rule: (await send(app, `${origin}/_t/call/countNotes`)).error,
      input: (await send(app, `${origin}/_t/call/echo`, { input: { text: 5 } })).error,
      broke: (await send(app, `${origin}/_t/call/openBreak`)).error,
      raw: (await send(app, `${origin}/_t/call/openRaw`)).error,
      own: (await send(app, `${origin}/_t/call/openFail`, { input: { title: 'late' } })).error,
      missing: (await send(app, `${origin}/_t/call/nothing`)).error,
    }
  }
  const { live, test: onTest, development } = answers

  // On live data: the code, its name, and the general sentence of the code. No fix, no place, nothing of the app.
  assert.deepEqual(live.rule, { code: 'T0006', name: 'not-signed-in', message: 'You need to sign in.' })
  assert.deepEqual(live.input, {
    code: 'T0002',
    name: 'bad-input',
    message: 'What was sent does not fit.',
    fields: { text: 'type' },
  })
  assert.deepEqual(live.missing, { code: 'T0001', name: 'not-found', message: 'This was not found.' })
  assert.deepEqual(Object.keys(live.broke).sort(), ['code', 'message', 'name', 'ref', 'trace'])
  assert.equal(live.broke.message, 'Something went wrong.')
  assert.equal(live.raw.message, 'Something went wrong.')
  assert.equal(JSON.stringify(live).includes('hunter2'), false)
  assert.equal(JSON.stringify(live).includes('fix'), false)
  // An own fail is sent as the builder wrote it, in every mode.
  for (const answer of [live.own, onTest.own, development.own])
    assert.deepEqual(answer, {
      code: 'not-today',
      name: 'not-today',
      message: 'No note named late is taken today.',
      fields: { title: 'taken' },
    })

  // On test data: the full message, and the fix where the error has one.
  for (const held of [onTest, development]) {
    assert.match(String(held.rule.message), /countNotes needs a signed-in caller/)
    assert.equal(typeof held.rule.fix, 'string')
    assert.match(String(held.input.message), /text/)
    assert.equal(typeof held.input.fix, 'string')
    assert.match(String(held.broke.message), /hunter2/)
    assert.match(String(held.raw.message), /full access/)
    assert.equal(typeof held.raw.fix, 'string')
    assert.deepEqual([held.broke.code, held.raw.code], ['T0009', 'T0009'])
  }
})

/** Sends one request over a real connection, with the host it names written by the test, and answers the status and the body. */
function overTheWire(
  port: number,
  host: string,
  path: string,
  o: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, unknown> }> {
  return new Promise((done, failed) => {
    const sent = httpRequest(
      { host: '127.0.0.1', port, path, method: o.method ?? 'GET', headers: { host, ...o.headers }, agent: false },
      (answer) => {
        let text = ''
        answer.setEncoding('utf8')
        answer.on('data', (part) => {
          text += part
        })
        answer.on('end', () =>
          done({ status: answer.statusCode ?? 0, body: Object(JSON.parse(text)), headers: answer.headers }),
        )
      },
    )
    sent.setTimeout(10_000, () => sent.destroy(new Error('the engine did not answer within ten seconds')))
    sent.on('error', failed)
    sent.end(o.body)
  })
}

test('[21-18] a request that names a host the app was not given is refused with T0017, and with no address only the names of this computer are answered', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const engine = engineOf(t)
  const open = (name: string, address?: string | string[]) =>
    engine.open(bundle.folder, {
      dataFolder: join(work, name),
      mode: 'test',
      ...(address === undefined ? {} : { address }),
    })
  const plain = await open('plain')
  const port = portOf(join(work, 'plain'))
  const health = async (app: typeof plain, address: string) => {
    const answer = await send(app, `${address}/_t/health`, { method: 'GET' })
    return answer.status === 200 ? answer.body : [answer.status, answer.error.code]
  }
  const ready = { ok: true, value: { app: 'desk', version: bundle.versionId } }

  // With no address: this computer by its three names, on the port of the engine, and no other.
  for (const name of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, `LOCALHOST:${port}`])
    assert.deepEqual(await health(plain, `http://${name}`), ready, name)
  for (const name of [
    'localhost',
    `localhost:${port + 1}`,
    `evil.example:${port}`,
    `localhost.evil.example:${port}`,
    `127.0.0.2:${port}`,
    'shop.example',
  ])
    assert.deepEqual(await health(plain, `http://${name}`), [421, 'T0017'], name)
  // It is refused before anything else is looked at: the same answer for a call, whatever it asks for.
  const call = await send(plain, `http://evil.example:${port}/_t/call/nothing`, {
    headers: { origin: 'https://evil.example' },
  })
  assert.deepEqual([call.status, call.error.code], [421, 'T0017'])

  // With names of its own an app answers on those, each with its port where it states one, and not as this computer.
  const shop = await open('shop', ['shop.example', 'www.shop.example:8443'])
  for (const name of ['shop.example', 'www.shop.example:8443', 'SHOP.example'])
    assert.deepEqual(await health(shop, `https://${name}`), ready, name)
  for (const name of [`localhost:${port}`, 'www.shop.example', 'shop.example:8443', 'shop.example.evil.example'])
    assert.deepEqual(await health(shop, `http://${name}`), [421, 'T0017'], name)
  // `'*'` answers every name.
  const every = await open('every', '*')
  for (const name of ['anything.example', `localhost:${port}`, '10.1.2.3:99'])
    assert.deepEqual(await health(every, `http://${name}`), ready, name)

  // Over a real connection the name tells the apps of one engine apart.
  await every.close()
  await shop.call('addWord', { text: 'of the shop' }, { as: system })
  const post = { method: 'POST', body: '{"input":{}}', headers: { 'content-type': 'application/json' } }
  const own = await overTheWire(port, `localhost:${port}`, '/_t/call/words', post)
  assert.deepEqual([own.status, Object(own.body.error).code], [404, 'T0001'])
  assert.deepEqual((await overTheWire(port, `localhost:${port}`, '/_t/health')).body, ready)
  assert.equal((await overTheWire(port, 'shop.example', '/_t/health')).status, 200)
  const strange = await overTheWire(port, 'nobody.example', '/_t/health')
  assert.deepEqual([strange.status, Object(strange.body.error).code], [421, 'T0017'])
  const calling = await overTheWire(port, 'nobody.example', '/_t/call/wordList', post)
  assert.deepEqual([calling.status, Object(calling.body.error).code], [421, 'T0017'])
  const listed = await overTheWire(port, 'shop.example', '/_t/call/wordList', post)
  assert.deepEqual([listed.status, listed.body], [200, { ok: true, value: ['of the shop'] }])
  assert.deepEqual((await overTheWire(port, `127.0.0.1:${port}`, '/_t/call/wordList', post)).body, {
    ok: true,
    value: [],
  })
  // Every answer of the engine says that its type is not to be guessed.
  assert.equal(listed.headers['x-content-type-options'], 'nosniff')
  assert.match(String(listed.headers['content-type']), /^application\/json/)
})

test('[21-21a] behind a named proxy the address, the scheme and the host of a request are what the named family of headers states', async (t) => {
  const { clock, advance } = testClock()
  const limits = { functionDepth: 6, anyonePerMinute: 3 }
  const proxied = await running(t, {
    engine: { makers: { clock: () => clock }, proxy: { from: ['10.0.0.0/8', '192.168.1.5'] } },
    change: (description) => Object.assign(description.project, { limits }),
  })
  const full = async (r: typeof proxied, o: Parameters<typeof send>[2]) =>
    (await send(r.app, `${r.origin}/_t/call/whoAmI`, o)).status
  // Three calls are taken from one address in a minute, and the fourth is not: so a count tells whose a request is.
  const fills = async (r: typeof proxied, o: Parameters<typeof send>[2]) => {
    const seen: number[] = []
    for (let i = 0; i < 4; i++) seen.push(await full(r, o))
    return seen
  }
  const over = [200, 200, 200, 429]

  // From a named proxy the address is the last one of its family that is no named proxy.
  const visitor = { 'x-forwarded-for': '198.51.100.9, 203.0.113.7, 10.9.9.9' }
  assert.deepEqual(await fills(proxied, { from: '10.1.2.3', headers: visitor }), over)
  // The same visitor through the other named proxy has the same count, and another visitor a count of their own.
  assert.equal(await full(proxied, { from: '192.168.1.5', headers: { 'x-forwarded-for': '203.0.113.7' } }), 429)
  assert.equal(await full(proxied, { from: '10.1.2.3', headers: { 'x-forwarded-for': '203.0.113.8' } }), 200)
  // An address written inside one of the newer kind is that address, and a port after an entry is dropped.
  assert.equal(await full(proxied, { from: '10.1.2.3', headers: { 'x-forwarded-for': '::ffff:203.0.113.7' } }), 429)
  assert.equal(await full(proxied, { from: '10.1.2.3', headers: { 'x-forwarded-for': '203.0.113.7:4711' } }), 429)
  // An entry that is no address ends the walk: the request counts as coming from the proxy it came through.
  advance(61_000)
  const made = { 'x-forwarded-for': '203.0.113.7, unknown, 10.9.9.9' }
  assert.deepEqual(await fills(proxied, { from: '10.1.2.3', headers: made }), over)
  assert.equal(await full(proxied, { from: '10.1.2.3', headers: { 'x-forwarded-for': '203.0.113.7' } }), 200)
  // The other family is not read: a request of the proxy that carries it alone counts for the proxy.
  advance(61_000)
  assert.deepEqual(await fills(proxied, { from: '10.1.2.3', headers: { forwarded: 'for=203.0.113.20' } }), over)
  assert.equal(await full(proxied, { from: '10.1.2.3', headers: { forwarded: 'for=203.0.113.21' } }), 429)
  // From any other address neither is read: a visitor cannot write an address of their own.
  advance(61_000)
  assert.deepEqual(await fills(proxied, { from: '198.51.100.1', headers: { 'x-forwarded-for': '203.0.113.30' } }), over)
  assert.equal(await full(proxied, { from: '198.51.100.1', headers: { 'x-forwarded-for': '203.0.113.31' } }), 429)
  assert.equal(await full(proxied, { from: '198.51.100.2', headers: { 'x-forwarded-for': '203.0.113.30' } }), 200)

  // The scheme of a request through a named proxy is https, whatever the header of the visitor says.
  const { origin, port } = proxied
  const secure = `https://localhost:${port}`
  let next = 40
  const sentFrom = (site: string, more: Record<string, string> = {}, from = '10.1.2.3') =>
    full(proxied, { from, headers: { origin: site, 'x-forwarded-for': `203.0.113.${next++}`, ...more } })
  assert.equal(await sentFrom(secure), 200)
  assert.equal(await sentFrom(origin), 403)
  assert.equal(await sentFrom(origin, { 'x-forwarded-proto': 'http' }), 403)
  // From any other address the scheme is the one the request came by.
  advance(61_000)
  assert.equal(await sentFrom(origin, {}, '198.51.100.3'), 200)
  assert.equal(await sentFrom(secure, { 'x-forwarded-proto': 'https' }, '198.51.100.3'), 403)
  // The forwarded host is not read: the host is the own of the request.
  assert.equal(await sentFrom(secure, { 'x-forwarded-host': 'shop.example' }), 200)

  // With `header: 'forwarded'` the standard header is the family, and the other one is not read.
  const standard = await running(t, {
    engine: {
      makers: { clock: () => clock },
      proxy: { from: ['10.0.0.0/8'], header: 'forwarded', scheme: 'header', host: true },
    },
    change: (description) => Object.assign(description.project, { limits }),
    open: { address: ['shop.example'] },
  })
  const asShop = (headers: Record<string, string>, from = '10.1.2.3') =>
    send(standard.app, `http://localhost:${standard.port}/_t/call/whoAmI`, { from, headers })
  const line = (n: number, more = '') =>
    `for=198.51.100.9, for="203.0.113.${n}:4711";proto=https;host=shop.example${more}, for=10.9.9.9`
  const first = await asShop({ forwarded: line(50), origin: 'https://shop.example' })
  assert.equal(first.status, 200)
  assert.deepEqual(
    [(await asShop({ forwarded: line(50) })).status, (await asShop({ forwarded: line(50) })).status],
    [200, 200],
  )
  assert.equal((await asShop({ forwarded: line(50) })).status, 429)
  assert.equal((await asShop({ forwarded: line(51), 'x-forwarded-for': '203.0.113.50' })).status, 200)
  // The scheme is the word of the proxy, which stands with the address that was taken; without the line it is http.
  assert.equal((await asShop({ forwarded: line(52), origin: 'http://shop.example' })).status, 403)
  assert.equal(
    (await asShop({ forwarded: 'for=203.0.113.53;host=shop.example', origin: 'http://shop.example' })).status,
    200,
  )
  assert.equal(
    (await asShop({ forwarded: 'for=203.0.113.54;host=shop.example', origin: 'https://shop.example' })).status,
    403,
  )
  // The forwarded host is read with `host: true`, from a named proxy alone.
  assert.equal((await asShop({ forwarded: 'for=203.0.113.55;host=other.example' })).error.code, 'T0017')
  assert.equal((await asShop({ forwarded: 'for=203.0.113.56' })).error.code, 'T0017')
  assert.equal((await asShop({ forwarded: line(57) }, '198.51.100.4')).error.code, 'T0017')

  // A query that groups by a `private` column, in a description written by hand, is refused to a limited caller,
  // and answers the system without that field.
  const grouped = await running(t, {
    change: (description) => {
      description.functions.byPay.plan = {
        from: 'users',
        group: { by: ['salary'], values: { n: { count: true }, total: { sum: 'salary' } } },
      }
    },
  })
  const ada = await addUser(grouped.app, 'Ada', [], 5000)
  await addUser(grouped.app, 'Bob', [], 5000)
  await addUser(grouped.app, 'Cy', [], 4000)
  await assert.rejects(grouped.app.call('byPay', {}, { as: ada }), { code: 'T0013' })
  for (const caller of [system]) {
    const groups = await grouped.app.call('byPay', {}, { as: caller })
    assert.ok(Array.isArray(groups) && groups.length === 2)
    assert.deepEqual(
      groups.map((one) => Object.keys(one)),
      [['n'], ['n']],
    )
    assert.deepEqual(groups.map((one) => one.n).sort(), [1, 2])
  }
})

test('[21-21a] a hundred and one connections through a named proxy are all taken, and the 101st from an address that is none is not', async (t) => {
  /** Opens connections one after another, each sending nothing, and answers how many the engine kept open. */
  const held = async (port: number, count: number): Promise<number> => {
    const sockets = []
    let kept = 0
    for (let i = 0; i < count; i++) {
      const socket = connect({ host: '127.0.0.1', port })
      sockets.push(socket)
      const stays = await new Promise<boolean>((done) => {
        socket.once('error', () => done(false))
        socket.once('connect', () => {
          // A connection that the engine does not take is closed at once, and one that it takes stays open.
          const timer = setTimeout(() => done(true), 50)
          socket.once('close', () => {
            clearTimeout(timer)
            done(false)
          })
        })
      })
      if (stays) kept++
    }
    for (const socket of sockets) socket.destroy()
    return kept
  }
  const web = { openPerAddress: 100, closeAfter: '1 minute' }
  const behind = await running(t, { engine: { web, proxy: { from: ['127.0.0.1'] } } })
  assert.equal(await held(behind.port, 101), 101)
  const direct = await running(t, { engine: { web } })
  assert.equal(await held(direct.port, 101), 100)
  // The app answers on: the connections that were closed count no longer. The engine counts a connection until it
  // sees it closed, which is a moment after this side closed it, and a longer one on some systems.
  let status = 0
  let tries = 0
  for (; tries < 100 && status !== 200; tries++) {
    if (tries) await new Promise((done) => setTimeout(done, 50))
    status = await overTheWire(direct.port, `localhost:${direct.port}`, '/_t/health').then(
      (answered) => answered.status,
      () => 0,
    )
  }
  assert.equal(status, 200, `the engine answered again after ${tries} tries`)
})

test('[21-2] malformed and oversized JSON never reaches the code of the app', async (t) => {
  const { app, origin, dataFolder } = await running(t, {
    change: (description) =>
      Object.assign(description.project, {
        limits: { functionDepth: 6, callSize: 20_000, anyonePerMinute: 1_000_000 },
      }),
  })
  const call = (body: string | Uint8Array<ArrayBuffer>) => send(app, `${origin}/_t/call/echo`, { body })
  const ran = () => logRows(dataFolder, 'lines').length
  const refusedAs = async (body: string | Uint8Array<ArrayBuffer>, code: string, what: string) => {
    const before = ran()
    const answer = await call(body)
    assert.equal(answer.error.code, code, what)
    assert.equal(ran(), before, what)
  }

  // What the web side itself holds a body to.
  const nested = (depth: number) => `{"input":{"text":"x","deep":${'['.repeat(depth)}${']'.repeat(depth)}}}`
  assert.equal((await call(nested(62))).status, 200)
  await refusedAs(nested(63), 'T0002', 'a value that nests 65 deep')
  await refusedAs(nested(5000), 'T0002', 'a value that nests five thousand deep')
  await refusedAs('{"input":{"text":"x","__proto__":{"n":1}}}', 'T0002', 'a key named __proto__')
  await refusedAs('{"input":{"text":"x","deep":{"__proto__":1}}}', 'T0002', 'a key named __proto__, deeper')
  await refusedAs('{"input":{"text":"x","text":"y"}}', 'T0002', 'two keys of one name')
  await refusedAs('{"input":{"text":"x"},"input":{"text":"y"}}', 'T0002', 'two keys of one name at the top')
  await refusedAs('{"input":{"text":"x","n":1e999}}', 'T0002', 'a number that is not finite once it is read')
  await refusedAs('{"input":{"text":"x","n":-1e999}}', 'T0002', 'a number below every number')
  await refusedAs('{"input":{"text":"\\ud83d"}}', 'T0002', 'half of a character, written out')
  await refusedAs(
    new Uint8Array([...Buffer.from('{"input":{"text":"'), 0xf0, 0x9f, ...Buffer.from('"}}')]),
    'T0002',
    'half of a character, in bytes',
  )
  await refusedAs('{"input":{"text":"x"}} {"input":{}}', 'T0002', 'two values')
  await refusedAs('', 'T0002', 'no body at all')
  await refusedAs('[]', 'T0002', 'a body that is no record')
  await refusedAs('{"input":[]}', 'T0002', 'an input that is no record')
  await refusedAs(`{"input":{"text":"${'x'.repeat(20_000)}"}}`, 'T0003', 'one byte over the size')
  const most = `{"input":{"text":"${'x'.repeat(20_000 - 21)}"}}`
  assert.equal(Buffer.byteLength(most), 20_000)
  assert.equal((await call(most)).status, 200)
  assert.equal((await call(`${most} `)).error.code, 'T0003')

  // Broken JSON made from a fixed seed: each is refused, or is whole and reaches the function as it was sent.
  let seed = 20261013
  const draw = (below: number): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return (seed >>> 8) % below
  }
  const whole = [
    '{"input":{"text":"plain"}}',
    '{"input":{"text":"with a number","n":-12.5e2}}',
    '{"input":{"text":"deep","deep":{"a":[1,2,{"b":null,"c":[true,false,"\\u00e9\\n"]}],"d":{"e":{"f":"g"}}}}}',
    '{"input":{"text":"\\ud83d\\ude00 and é","deep":[[[[["x"]]]]],"n":0}}',
  ]
  const pieces = [
    '{',
    '}',
    '[',
    ']',
    '"',
    ',',
    ':',
    '\\',
    '\\u',
    'null',
    'tru',
    '1e999',
    '-',
    '0x1F',
    "'",
    '\u0000',
    '"__proto__":',
    '"text":"again",',
    '\\ud800',
    '/*',
    ' ',
  ]
  let refused = 0
  let reached = 0
  for (let round = 0; round < 600; round++) {
    let text = whole[draw(whole.length)]
    for (let cut = 1 + draw(3); cut > 0; cut--) {
      const at = draw(text.length + 1)
      const how = draw(4)
      if (how === 0) text = text.slice(0, at)
      else if (how === 1) text = text.slice(0, at) + pieces[draw(pieces.length)] + text.slice(at)
      else if (how === 2) text = text.slice(0, at) + text.slice(at + 1 + draw(4))
      else text = text.slice(0, at) + text.slice(at).replace(/[{}[\]":,]/, pieces[draw(pieces.length)])
    }
    const before = ran()
    const answer = await call(text)
    if (answer.status === 200) {
      // What reached the function is what a strict reader of JSON reads of the same text, and nothing else.
      reached++
      const sent: Record<string, unknown> = JSON.parse(text).input
      // `null` in a field of an input means that it was not given.
      const given = Object.fromEntries(Object.entries(sent).filter(([, value]) => value !== null))
      assert.deepEqual(answer.body.value, given, text)
      assert.equal(ran(), before + 1, text)
    } else {
      refused++
      assert.ok(['T0002', 'T0003'].includes(String(answer.error.code)), `${text} was answered ${answer.error.code}`)
      assert.equal(answer.status === 400 || answer.status === 413, true, text)
      assert.equal(ran(), before, text)
    }
  }
  assert.ok(refused > 400, `${refused} refused, ${reached} reached`)
  // The engine answers on after all of it.
  assert.equal((await call(whole[0])).status, 200)
})

test('[05-2.11] a request whose body has arrived whole is not closed while its answer takes longer than bodyCloseAfter', async (t) => {
  const web = { bodyCloseAfter: '1 second', closeAfter: '1 second' }
  const slow: OnRequest = async (request, next) => {
    if (new URL(request.url).pathname !== '/slow') return next(request)
    const asked = await request.text()
    await new Promise((done) => setTimeout(done, 2500))
    return new Response(`answered ${asked}`)
  }
  const { port } = await running(t, { engine: { web, onRequest: slow } })
  const answer = await fetch(`http://localhost:${port}/slow`, { method: 'POST', body: 'the export' })
  assert.deepEqual([answer.status, await answer.text()], [200, 'answered the export'])
})

test('[05-2.11] a long answer that takes longer than bodyCloseAfter to begin is read whole by a reader that pauses for less than it', async (t) => {
  const web = { bodyCloseAfter: '2 seconds', closeAfter: '1 second' }
  // More than the buffers of a connection of this computer hold, so the answer waits for its reader now and then.
  const size = 16 * 1024 * 1024
  const piece = 1024 * 1024
  const long: OnRequest = async (request, next) => {
    if (new URL(request.url).pathname !== '/export') return next(request)
    await new Promise((done) => setTimeout(done, 3000))
    let given = 0
    const pieces = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (given === size) return controller.close()
        given += piece
        controller.enqueue(new Uint8Array(piece))
      },
    })
    return new Response(pieces, { headers: { 'content-length': String(size) } })
  }
  const { port } = await running(t, { engine: { web, onRequest: long } })
  const read = await new Promise<number>((done, failed) => {
    const asked = httpRequest({ host: '127.0.0.1', port, path: '/export' }, (answer) => {
      let bytes = 0
      let pauses = 0
      answer.on('data', (part: Buffer) => {
        bytes += part.length
        // The reader stops a few times along the way, each time for less than bodyCloseAfter.
        if (pauses < 5 && bytes > (pauses + 1) * 2 * piece) {
          pauses += 1
          answer.pause()
          setTimeout(() => answer.resume(), 500)
        }
      })
      answer.on('end', () => done(bytes))
      answer.on('error', failed)
    })
    asked.on('error', failed)
    asked.end()
  })
  assert.equal(read, size)
})
