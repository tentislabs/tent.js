import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { App } from '../../engine/index.ts'
import type { Wired } from './sieges.ts'
import { asSystem, asUser, besieged, callOf, logOf, refusedWith, rowId, wholeLog, wholeOf, wire } from './sieges.ts'

/** Adds a row as the system, and answers its id. */
async function added(app: App, table: string, values: object): Promise<string> {
  const rows: unknown = await app.write([{ add: table, values }], { as: 'system' })
  return rowId(Array.isArray(rows) ? rows[0] : rows)
}

/** How many lines of the log say that a function of the app ran. */
const ran = (dataFolder: string): number =>
  logOf(dataFolder, 'lines').filter((row) => row.message === 'echo ran').length

const seen = (answer: Wired): unknown[] => [answer.status, answer.error.code]

test('[05-2.1] a request with a header x-tent-user, and with every other header that starts x-tent-, is the request of nobody', async (t) => {
  const siege = await besieged(t)
  const ada = await added(siege.app, 'users', { name: 'Ada', roles: ['staff'] })
  const forged = {
    'x-tent-user': ada,
    'X-Tent-User': ada,
    'x-tent-caller': 'system',
    'x-tent-as': `user:${ada}`,
    'x-tent-roles': 'staff',
    'x-tent-admin': siege.token,
    'x-tent-reader': 'k'.repeat(40),
    'x-tent-for': '203.0.113.9; https; localhost',
    'x-tent-': 'system',
    'x-tent-kind': 'system',
    'x-tent-session': ada,
  }
  for (const [name, value] of Object.entries(forged)) {
    const who = await wire(siege, { path: callOf('whoAmI'), headers: { [name]: value } })
    assert.deepEqual([who.status, who.body], [200, { ok: true, value: 'no user' }], name)
  }
  const every = await wire(siege, { path: callOf('whoAmI'), headers: forged })
  assert.deepEqual(every.body, { ok: true, value: 'no user' })
  // A rule holds them as it holds nobody, and the log names nobody for each.
  for (const name of ['forSigned', 'forStaff', 'forNobody'])
    assert.deepEqual(seen(await wire(siege, { path: callOf(name), headers: forged })), [401, 'T0006'], name)
  for (const row of logOf(siege.dataFolder, 'calls')) assert.deepEqual([row.callerKind, row.callerId], ['nobody', null])
  // The body names no caller either: a page drawn for a user, sent by nobody, is told that its caller changed.
  const named = await wire(siege, { path: callOf('whoAmI'), body: JSON.stringify({ input: {}, as: ada }) })
  assert.deepEqual([named.body.ok, named.error.code, named.body.caller], [false, 'T3101', 'changed'])
})

test('[05-2.2] a call from a page of another site is T0004, and the function is not run', async (t) => {
  const siege = await besieged(t, { open: { mode: 'test' } })
  const cookies = 'tent_session=stolen; tent_visitor=someone'
  for (const origin of [
    'https://evil.example',
    `http://evil.example:${siege.port}`,
    `https://localhost:${siege.port}`,
    `http://localhost:${siege.port + 1}`,
    `http://localhost.evil.example:${siege.port}`,
    `http://127.0.0.1:${siege.port}`,
    'http://localhost',
    `http://localhost:${siege.port}@evil.example`,
    `http://evil.example#http://localhost:${siege.port}`,
    'file://',
    '',
    `http://localhost:${siege.port}, https://evil.example`,
  ]) {
    const before = ran(siege.dataFolder)
    const answer = await wire(siege, {
      path: callOf('echo'),
      input: { text: 'from another site' },
      headers: { origin, cookie: cookies },
    })
    assert.deepEqual(seen(answer), [403, 'T0004'], origin)
    assert.equal(ran(siege.dataFolder), before, origin)
  }
  // A change from another site writes nothing.
  const wrote = await wire(siege, {
    path: callOf('addWord'),
    input: { text: 'planted' },
    headers: { origin: 'https://evil.example', cookie: cookies },
  })
  assert.deepEqual(seen(wrote), [403, 'T0004'])
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 0)
  // The page of the app itself is let in.
  const own = await wire(siege, {
    path: callOf('echo'),
    input: { text: 'own' },
    headers: { origin: siege.origin, cookie: cookies },
  })
  assert.equal(own.status, 200)
})

test('[05-2.3] a call sent as a form, with a body that only looks like JSON, is not found', async (t) => {
  const siege = await besieged(t)
  const missing = await wire(siege, { path: callOf('no-such-function') })
  const body = JSON.stringify({ input: { text: 'as a form' } })
  for (const type of [
    'text/plain',
    'text/plain; charset=utf-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'application/jsonp',
    'application/json-seq',
    'text/json',
    'application/x-json',
    'application/json, text/plain',
    'text/plain, application/json',
    'text/plain; application/json',
    '',
  ]) {
    const before = ran(siege.dataFolder)
    const answer = await wire(siege, { path: callOf('echo'), body, headers: { 'content-type': type } })
    assert.deepEqual(seen(answer), [404, 'T0001'], type)
    assert.equal(ran(siege.dataFolder), before, type)
    // It is the answer of a name that is no function, whole.
    assert.deepEqual(wholeOf(answer), wholeOf(missing), type)
  }
  const form = await wire(siege, {
    path: callOf('addWord'),
    body: `{"input":{"text":"planted"},"x":"=`,
    headers: { 'content-type': 'text/plain' },
  })
  assert.deepEqual(seen(form), [404, 'T0001'])
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 0)
})

test('[05-2.4@4] a call of a name that is no function is T0001, with the same answer for each', async (t) => {
  const siege = await besieged(t)
  const missing = await wire(siege, { path: callOf('no-such-function') })
  assert.deepEqual(seen(missing), [404, 'T0001'])
  for (const name of [
    'words',
    'users',
    'sweep',
    'siege',
    '_t_meta',
    '_t_sessions',
    '_t_rate',
    '_t_here',
    '_t_',
    'echo/..',
    '../echo',
    '..%2Fecho',
    'echo%2F..',
    'echo.run',
    'functions.echo',
    'echo.',
    '.echo',
    '..',
    'echo/',
    '/echo',
    'echo%00',
    'ECHO',
    'echo%20',
    '%65cho%',
    'constructor',
    '__proto__',
    'hasOwnProperty',
    'toString',
    '',
  ]) {
    const before = ran(siege.dataFolder)
    const answer = await wire(siege, { path: callOf(name), input: { text: 'x' } })
    assert.deepEqual(wholeOf(answer), wholeOf(missing), name)
    assert.equal(ran(siege.dataFolder), before, name)
  }
})

test('[05-2.5] a function whose rule the caller does not pass is T0006 for nobody and T3101 for a signed-in user, before any code of the app has run', async (t) => {
  const siege = await besieged(t, { open: { mode: 'test' } })
  const cy = await added(siege.app, 'users', { name: 'Cy', roles: [] })
  let failed = 0
  siege.engine.on('call.failed', () => void failed++)
  // As nobody, over the web: an input that does not fit is not even looked at.
  for (const name of ['forSigned', 'forStaff', 'forNobody']) {
    const answer = await wire(siege, { path: callOf(name), input: { no: 'such field' } })
    assert.deepEqual(seen(answer), [401, 'T0006'], name)
  }
  // As a signed-in user who has no such role.
  for (const name of ['forStaff', 'forNobody'])
    assert.equal(await refusedWith(siege.app.call(name, { no: 'such field' }, asUser(cy))), 'T3101', name)
  assert.equal(failed, 5)
  // Nothing of the app ran: the log holds the refusals, and no line of any code.
  assert.equal(logOf(siege.dataFolder, 'lines').length, 0)
  assert.deepEqual(
    logOf(siege.dataFolder, 'denied').map((row) => [row.name, row.callerKind]),
    [
      ['forSigned', 'nobody'],
      ['forStaff', 'nobody'],
      ['forNobody', 'nobody'],
      ['forStaff', 'user'],
      ['forNobody', 'user'],
    ],
  )
  // A role that the caller writes for themselves is no role: the roles are those of the row.
  assert.equal(await refusedWith(siege.app.call('forStaff', {}, asUser(cy, []))), 'T3101')
})

test('[05-2.6] an input that does not fit is T0002 or T0003: the code of the app never runs, and nothing of the engine changes', async (t) => {
  const siege = await besieged(t, { limits: { callSize: 4096, anyonePerMinute: 1000 } })
  const call = (body: string | Uint8Array<ArrayBuffer>) => wire(siege, { path: callOf('echo'), body })
  const nested = (depth: number) => `{"input":{"text":"x","deep":${'['.repeat(depth)}${']'.repeat(depth)}}}`
  const most = `{"input":{"text":"${'x'.repeat(4096 - 21)}"}}`
  assert.equal(Buffer.byteLength(most), 4096)
  const attacks: [string, string | Uint8Array<ArrayBuffer>, string][] = [
    ['a field that is not declared', '{"input":{"text":"x","admin":true}}', 'T0002'],
    ['a field that is not declared, beside the input', '{"input":{"text":"x"},"caller":{"kind":"system"}}', 'T0002'],
    ['a wrong type', '{"input":{"text":5}}', 'T0002'],
    ['a list where a record is declared', '{"input":["x"]}', 'T0002'],
    ['a value 65 deep', nested(63), 'T0002'],
    ['a key __proto__', '{"input":{"text":"x","__proto__":{"admin":true}}}', 'T0002'],
    ['a key __proto__ written with a sign', '{"input":{"text":"x","\\u005f_proto__":{"admin":true}}}', 'T0002'],
    ['a key __proto__ deeper', '{"input":{"text":"x","deep":{"a":[{"__proto__":{"x":1}}]}}}', 'T0002'],
    ['two keys of one name', '{"input":{"text":"x","text":"y"}}', 'T0002'],
    ['two keys of one name, one written with a sign', '{"input":{"text":"x","te\\u0078t":"y"}}', 'T0002'],
    ['two inputs', '{"input":{"text":"x"},"input":{"text":"y"}}', 'T0002'],
    ['a number too large to hold', '{"input":{"text":"x","n":1e999}}', 'T0002'],
    ['a number too large to hold, of many digits', `{"input":{"text":"x","n":${'9'.repeat(400)}}}`, 'T0002'],
    ['half of a character, written out', '{"input":{"text":"\\ud83d"}}', 'T0002'],
    [
      'half of a character, in bytes',
      new Uint8Array([...Buffer.from('{"input":{"text":"'), 0xf0, 0x9f, ...Buffer.from('"}}')]),
      'T0002',
    ],
    ['one byte over callSize', `${most} `, 'T0003'],
  ]
  const held = () => JSON.stringify(readdirSync(siege.dataFolder).sort())
  const files = held()
  for (const [what, body, code] of attacks) {
    const before = ran(siege.dataFolder)
    const answer = await call(body)
    assert.equal(answer.error.code, code, what)
    assert.equal(answer.status, code === 'T0003' ? 413 : 400, what)
    assert.equal(ran(siege.dataFolder), before, what)
  }
  // The bounds themselves are taken: 64 deep, and exactly callSize.
  assert.equal((await call(nested(62))).status, 200)
  assert.equal((await call(most)).status, 200)
  // Nothing of the engine changed: no thing that every record has was given a field, and the data folder holds what it held.
  assert.equal(Reflect.get({}, 'admin'), undefined)
  assert.equal(Reflect.get({}, 'x'), undefined)
  assert.equal(held(), files)
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 0)
  assert.equal((await call('{"input":{"text":"still answering"}}')).status, 200)
})

test('[05-2.7] the id of the row of another user given to a change is T2103, as for an id that does not exist', async (t) => {
  const siege = await besieged(t)
  const ada = await added(siege.app, 'users', { name: 'Ada', roles: [] })
  const bob = await added(siege.app, 'users', { name: 'Bob', roles: [] })
  const note = rowId(await siege.app.call('addNote', { title: 'of Ada', secret: 'hers alone' }, asUser(ada)))
  // An id in the form of an id that names no row: the id of the note with its last letters turned round.
  const nothing = `${note.slice(0, -4)}${[...note.slice(-4)].reverse().join('')}`
  assert.notEqual(nothing, note)
  // As nobody, over the web, on live data: the two answers are compared whole.
  for (const [name, more] of [
    ['renameNote', { title: 'taken' }],
    ['dropNote', {}],
  ] as const) {
    const theirs = await wire(siege, { path: callOf(name), input: { note, ...more } })
    const none = await wire(siege, { path: callOf(name), input: { note: nothing, ...more } })
    assert.deepEqual(seen(theirs), [404, 'T2103'], name)
    assert.deepEqual(wholeOf(theirs), wholeOf(none), name)
  }
  // As another signed-in user: the same code, and the same words but for the id that each call named.
  const told = async (id: string): Promise<unknown[]> => {
    try {
      await siege.app.call('renameNote', { note: id, title: 'taken' }, asUser(bob))
    } catch (error) {
      const failed: Record<string, unknown> = Object(error)
      return [failed.code, String(failed.message).replaceAll(id, '<id>'), failed.fields, failed.fix]
    }
    return ['answered']
  }
  assert.equal((await told(note))[0], 'T2103')
  assert.deepEqual(await told(note), await told(nothing))
  // The row is as it was, and its owner still changes it.
  const kept = await siege.app.read({ from: 'notes', one: 'get', id: note }, { as: 'system' })
  assert.deepEqual([Object(kept).title, Object(kept).secret], ['of Ada', 'hers alone'])
  await siege.app.call('renameNote', { note, title: 'still hers' }, asUser(ada))
})

test('[05-2.9] a version that never was, and one with dots and slashes in it, is T0007, and no file outside versions/ is read', async (t) => {
  const siege = await besieged(t)
  const versions = readdirSync(join(siege.dataFolder, 'versions'))
  for (const version of [
    'a-version-that-never-was',
    '../../engine.json',
    '..',
    '../logs.db',
    `${versions[0]}/../../engine.json`,
    `${versions[0]}/..`,
    `${versions[0]}/`,
    `./${versions[0]}`,
    'C:\\Windows\\win.ini',
    '/etc/passwd',
    '..\\..\\engine.json',
    '%2e%2e%2fengine.json',
    `${versions[0]}\u0000`,
    '',
  ]) {
    const answer = await wire(siege, {
      path: callOf('whoAmI'),
      body: JSON.stringify({ input: {}, version }),
    })
    assert.deepEqual(seen(answer), [409, 'T0007'], version)
    assert.equal(answer.error.running, versions[0], version)
    // Nothing of a file is in the answer: neither the token of the engine nor a path.
    assert.equal(answer.text.includes(siege.token), false, version)
    assert.equal(/engine\.json|versions|\\\\|[A-Z]:\\/.test(answer.text), false, version)
  }
  // A version that is no text names no version either.
  for (const version of ['{"a":1}', '["x"]', '1', 'true', 'null']) {
    const answer = await wire(siege, {
      path: callOf('whoAmI'),
      body: `{"input":{},"version":${version}}`,
    })
    assert.equal(version === 'null' ? [200, 409].includes(answer.status) : answer.status === 409, true, version)
  }
  assert.deepEqual(readdirSync(join(siege.dataFolder, 'versions')), versions)
  assert.equal(existsSync(join(siege.dataFolder, 'engine.json')), true)
})

test('[05-2.10] the 61st call of a minute from one address is T0005, a made-up X-Forwarded-For is ignored, and behind a named proxy each visitor has a count of their own', async (t) => {
  // From one address, over real connections: sixty calls are taken and the next is not.
  const plain = await besieged(t)
  for (let i = 0; i < 60; i++)
    assert.equal((await wire(plain, { path: callOf('whoAmI') })).status, 200, `call ${i + 1}`)
  assert.deepEqual(seen(await wire(plain, { path: callOf('whoAmI') })), [429, 'T0005'])
  // A header that the sender made up gives them no other address, in either family.
  const madeUp: Record<string, string>[] = [
    { 'x-forwarded-for': '203.0.113.77' },
    { forwarded: 'for=203.0.113.78' },
    { 'x-real-ip': '203.0.113.79', 'x-client-ip': '203.0.113.80', 'true-client-ip': '203.0.113.81' },
    { 'x-forwarded-for': '203.0.113.82', 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'https' },
  ]
  for (const headers of madeUp)
    assert.deepEqual(
      seen(await wire(plain, { path: callOf('whoAmI'), headers })),
      [429, 'T0005'],
      JSON.stringify(headers),
    )
  // Another function, and a name that is none, are held by the same count.
  assert.deepEqual(seen(await wire(plain, { path: callOf('wordCount') })), [429, 'T0005'])
  assert.deepEqual(seen(await wire(plain, { path: callOf('no-such-function') })), [429, 'T0005'])
  // When the minute has passed the address is taken again.
  plain.clock.advance(61_000)
  assert.equal((await wire(plain, { path: callOf('whoAmI') })).status, 200)

  // Behind a named proxy, which is this computer here: each visitor has their own count.
  const behind = await besieged(t, { engine: { proxy: { from: ['127.0.0.1'] } }, open: { address: '*' } })
  const from = (address: string, more: Record<string, string> = {}) =>
    wire(behind, { path: callOf('whoAmI'), headers: { 'x-forwarded-for': address, ...more } })
  // The second visitor also sends a header of the other family, of their own making, that names the first.
  const forged = { forwarded: 'for=198.51.100.1;proto=https;host=localhost' }
  for (let i = 0; i < 60; i++) {
    assert.equal((await from('198.51.100.1')).status, 200, `the first visitor, call ${i + 1}`)
    assert.equal((await from('198.51.100.2', forged)).status, 200, `the second visitor, call ${i + 1}`)
  }
  assert.deepEqual(seen(await from('198.51.100.1')), [429, 'T0005'])
  assert.deepEqual(seen(await from('198.51.100.2', forged)), [429, 'T0005'])
  // Nor does an address that a visitor writes in front of the one the proxy wrote move them to another count.
  assert.deepEqual(seen(await from('203.0.113.5, 198.51.100.2')), [429, 'T0005'])
  assert.deepEqual(seen(await from('unknown, 198.51.100.2')), [429, 'T0005'])
  // A third visitor is still answered.
  assert.equal((await from('198.51.100.3', { forwarded: 'for=198.51.100.1' })).status, 200)
})

test('[05-2.12] a request that names another host, and one that names this computer by a name of the attacker, is T0017', async (t) => {
  const siege = await besieged(t)
  const own = `localhost:${siege.port}`
  for (const host of [
    'evil.example',
    `evil.example:${siege.port}`,
    `localhost.evil.example:${siege.port}`,
    `rebind.evil.example:${siege.port}`,
    `127.0.0.1.nip.io:${siege.port}`,
    `127.0.0.2:${siege.port}`,
    `0.0.0.0:${siege.port}`,
    `2130706433:${siege.port}`,
    `0x7f.1:${siege.port}`,
    'localhost',
    `localhost:${siege.port + 1}`,
    `localhost.:${siege.port}`,
    `${own}.evil.example`,
    `evil.example@${own}`,
    `${own}@evil.example`,
    `${own}#evil.example`,
    `${own}, evil.example`,
  ]) {
    const before = ran(siege.dataFolder)
    const answer = await wire(siege, {
      path: callOf('echo'),
      host,
      input: { text: 'x' },
      headers: { origin: `http://${host}` },
    }).catch((error: unknown) => String(error))
    // A host that is no host at all is refused by the web side itself, with nothing but its status.
    if (typeof answer === 'string' || answer.status === 400) continue
    assert.deepEqual(seen(answer), [421, 'T0017'], host)
    assert.equal(ran(siege.dataFolder), before, host)
  }
  // The same for an address that needs no caller.
  const health = await wire(siege, { method: 'GET', path: '/_t/health', host: `evil.example:${siege.port}` })
  assert.deepEqual(seen(health), [421, 'T0017'])
  // And for the forwarded host of a sender that is no named proxy.
  const forwarded = await wire(siege, {
    method: 'GET',
    path: '/_t/health',
    host: 'evil.example',
    headers: { 'x-forwarded-host': own, forwarded: `host=${own}` },
  })
  assert.deepEqual(seen(forwarded), [421, 'T0017'])
  assert.equal((await wire(siege, { method: 'GET', path: '/_t/health' })).status, 200)
})

test('[05-2.13] a function that fails with a message that holds a secret text: on live data the caller is sent T0009 and its reference, and nothing of the message', async (t) => {
  const siege = await besieged(t)
  for (const how of ['code', 'data']) {
    const answer = await wire(siege, { path: callOf('breaks'), input: { how } })
    assert.deepEqual(seen(answer), [500, 'T0009'], how)
    assert.deepEqual(Object.keys(answer.error).sort(), ['code', 'message', 'name', 'ref', 'trace'], how)
    assert.equal(answer.error.message, 'Something went wrong.', how)
    assert.match(String(answer.error.ref), /^[0-9a-z]{8}$/, how)
    for (const piece of ['hunter2', 'vault', 'RangeError', 'functions.ts', 'nothing', 'words', siege.dataFolder])
      assert.equal(`${answer.text}${JSON.stringify(answer.headers)}`.includes(piece), false, `${how}: ${piece}`)
    // The reference finds the whole of it in the log.
    const kept = logOf(siege.dataFolder, 'errors').find((row) => row.ref === answer.error.ref)
    assert.ok(kept, how)
    if (how === 'code') assert.match(String(kept.message), /hunter2/)
  }
})

test('[05-2.14] a GET of the address of a call, and every other method, is not found', async (t) => {
  const siege = await besieged(t)
  await siege.app.call('addWord', { text: 'held' }, asSystem)
  const missing = await wire(siege, { path: callOf('no-such-function') })
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'PROPFIND', 'QUERY']) {
    for (const name of ['wordCount', 'addWord', 'echo']) {
      const answer = await wire(siege, {
        method,
        path: `${callOf(name)}?input=${encodeURIComponent('{"text":"by the address"}')}`,
        ...(method === 'GET' || method === 'HEAD' ? {} : { input: { text: 'by another method' } }),
      })
      // The runtime itself takes no TRACE: the web side answers it with nothing but a status.
      if (method === 'TRACE' && answer.status === 400) continue
      assert.equal(answer.status, 404, `${method} ${name}`)
      if (method !== 'HEAD') assert.deepEqual(wholeOf(answer), wholeOf(missing), `${method} ${name}`)
    }
  }
  // A method that is written over the true one in a header, or in the address, is not read.
  for (const name of ['x-http-method-override', 'x-method-override', 'x-http-method'])
    assert.equal(
      (await wire(siege, { method: 'GET', path: callOf('wordCount'), headers: { [name]: 'POST' } })).status,
      404,
    )
  assert.equal((await wire(siege, { method: 'GET', path: `${callOf('addWord')}?_method=POST` })).status, 404)
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 1)
})

test('[05-2.15] two calls at once that each try to write the same unique value: one is T2101, and the data holds one row', async (t) => {
  const siege = await besieged(t, { limits: { anyonePerMinute: 1000 } })
  for (let round = 0; round < 10; round++) {
    const text = `the same ${round}`
    const answers = await Promise.all(
      Array.from({ length: 8 }, () => wire(siege, { path: callOf('addWord'), input: { text } })),
    )
    const codes = answers.map((one) => (one.status === 200 ? 'added' : String(one.error.code))).sort()
    assert.deepEqual(codes, ['T2101', 'T2101', 'T2101', 'T2101', 'T2101', 'T2101', 'T2101', 'added'], text)
    for (const one of answers) if (one.status !== 200) assert.equal(one.status, 409)
    assert.deepEqual(
      await siege.app.read({ from: 'words', where: { col: 'text', is: text }, count: true }, { as: 'system' }),
      1,
    )
  }
})

test('[05-2.16] a call with the cookies of the visitor and Origin: null, as a page inside a locked frame sends it, is T0004', async (t) => {
  const siege = await besieged(t)
  for (const origin of ['null', 'NULL', 'Null', ' null', 'null ']) {
    const answer = await wire(siege, {
      path: callOf('addWord'),
      input: { text: 'from a locked frame' },
      headers: { origin, cookie: 'tent_session=of-the-visitor' },
    })
    assert.deepEqual(seen(answer), [403, 'T0004'], origin)
  }
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 0)
})

test('[05-2.18] an input marked secret that fails its type check: T0002 names the field and the check, and the value is in no answer and no log', async (t) => {
  for (const mode of ['live', 'test', 'development'] as const) {
    const siege = await besieged(t, { open: { mode } })
    const attempts: [unknown, string][] = [
      ['hunter2', 'min'],
      [7654321, 'type'],
      [['hunter2-in-a-list'], 'type'],
      [{ value: 'hunter2-in-a-record' }, 'type'],
    ]
    for (const [password, check] of attempts) {
      const answer = await wire(siege, { path: callOf('logIn'), input: { name: 'ada', password } })
      assert.deepEqual(seen(answer), [400, 'T0002'], `${mode}: ${JSON.stringify(password)}`)
      assert.deepEqual(answer.error.fields, { password: check }, mode)
      for (const piece of ['hunter2', '7654321'])
        assert.equal(answer.text.includes(piece), false, `${mode}: the answer holds ${piece}`)
    }
    // A secret that fits is not kept either, and nor is one that came with a field that does not fit.
    assert.equal(
      (await wire(siege, { path: callOf('logIn'), input: { name: 'ada', password: 'hunter2-long' } })).status,
      200,
    )
    const beside = await wire(siege, { path: callOf('logIn'), input: { name: 5, password: 'hunter2-beside' } })
    assert.deepEqual(seen(beside), [400, 'T0002'])
    assert.equal(beside.text.includes('hunter2'), false, mode)
    for (const piece of ['hunter2', '7654321'])
      assert.equal(wholeLog(siege.dataFolder).includes(piece), false, `${mode}: the log holds ${piece}`)
  }
})
