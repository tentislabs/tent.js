import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level, until } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const origin = 'http://localhost'

/** Calls a function on a machine as a browser would, with a cookie, and answers the wire form, the cookies that were set, and the machine that answered. */
async function called(machine: TestApp, name: string, input: object, o: { cookie?: string; as?: string } = {}) {
  const answer = await machine.request(
    new Request(`${origin}/_t/${name === 'whoAmI' || name === 'devices' ? 'read' : 'call'}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
  )
  const wire: { ok: boolean; value?: unknown; error?: { code: string }; caller?: string } = Object(await answer.json())
  return { wire, set: answer.headers.getSetCookie(), status: answer.status }
}

test('[29-9] a session that is due to be moved on is moved by the writer, for a request that a reader got: the reader hands the request on, and the cookie is sent again with its answer', async (t) => {
  tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'callers') })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  // A session of fifty minutes is moved on once it was not used for five.
  const signed = await called(app, 'signIn', { email: 'maya@example.com', for: '50 minutes' })
  assert.equal(signed.wire.ok, true, JSON.stringify(signed.wire))
  const cookie = signed.set[0].split(';')[0]
  await level(app, near)
  const sessionsOf = async (): Promise<{ usedAt: string }[]> =>
    Object((await called(app, 'devices', {}, { cookie, as: maya })).wire.value)
  const [{ usedAt: first }] = await sessionsOf()

  // A session that is not due: the reader answers by itself, and nothing is written.
  app.clock.advance('2 minutes')
  const early = await called(near, 'whoAmI', {}, { cookie, as: maya })
  assert.deepEqual([early.wire, early.set], [{ ok: true, value: maya }, []])
  assert.equal((await sessionsOf())[0].usedAt, first)

  // The session is due: the reader moves nothing itself, the writer does, and the cookie is sent again.
  app.clock.advance('4 minutes')
  const before = app.at().n
  const due = await called(near, 'whoAmI', {}, { cookie, as: maya })
  assert.deepEqual(due.wire, { ok: true, value: maya })
  assert.equal(due.set.length, 1, 'the cookie of the session is sent again')
  assert.equal(due.set[0].split(';')[0], cookie)
  assert.ok(app.at().n > before, 'the writer wrote the session')
  await level(app, near)
  assert.notEqual((await sessionsOf())[0].usedAt, first)
  // Moved on, it is not due for the next request, which the reader answers by itself again.
  const after = app.at().n
  const next = await called(near, 'whoAmI', {}, { cookie, as: maya })
  assert.deepEqual([next.wire, next.set], [{ ok: true, value: maya }, []])
  assert.equal(app.at().n, after)
})

/** Asks a machine as a browser would, and answers the status, the headers and the body as text. */
async function asked(machine: TestApp, method: string, path: string, o: { cookie?: string; body?: string } = {}) {
  const answer = await machine.request(
    new Request(`${origin}${path}`, {
      method,
      headers: { ...(method === 'GET' ? {} : { origin }), ...(o.cookie ? { cookie: o.cookie } : {}) },
      ...(o.body === undefined ? {} : { body: o.body }),
    }),
    { from: '203.0.113.77' },
  )
  return { status: answer.status, headers: answer.headers, text: await answer.text() }
}

test('[29-3@7a] a route is answered by the writer for a request that a reader got, with the address of the caller and without the key of the reader, and onRequest is called once, on the machine that got the request', async (t) => {
  tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'routed') })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)

  // A route: the reader hands the request on, and the writer answers it. `onRequest` ran once, on the reader.
  const feed = await asked(near, 'GET', '/feed.xml')
  assert.deepEqual([feed.status, feed.text, feed.headers.get('x-seen')], [200, '<rss/>', 'once'])
  // The code of a route runs on the writer alone: a route that counts its runs counts those of both machines.
  assert.equal((await asked(near, 'GET', '/count')).text, '1')
  assert.equal((await asked(app, 'GET', '/count')).text, '2')
  assert.equal((await asked(near, 'GET', '/count')).text, '3')
  // `onRequest` answers by itself on the reader, and hands a request on under another address.
  assert.deepEqual(
    [(await asked(near, 'GET', '/closed')).status, (await asked(near, 'GET', '/closed')).text],
    [503, 'closed for today'],
  )
  const alias = await asked(near, 'GET', '/alias')
  assert.deepEqual([alias.text, alias.headers.get('x-seen')], ['<rss/>', null])

  // The code of the route on the writer is handed none of what the reader added to the request.
  const names: string[] = JSON.parse((await asked(near, 'GET', '/handed')).text)
  assert.deepEqual(
    names.filter((name) => name.startsWith('tent-') || name.startsWith('x-tent-')),
    [],
  )

  // A route that writes, through a reader: the writer wrote, and the reader holds the write when the answer left.
  const before = app.at().n
  const kept = await asked(near, 'POST', '/notes', { body: 'a note through a reader' })
  assert.equal(kept.status, 201, kept.text)
  assert.ok(app.at().n > before)
  const words = await near.request(
    new Request(`${origin}/_t/read/noteWords`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: '{"input":{}}',
    }),
  )
  assert.deepEqual(Object(await words.json()).value, ['a note through a reader'])

  // A signed-in caller: the session was started on the writer, and the route sees that user and their address.
  const signed = await called(app, 'signIn', { email: 'maya@example.com' })
  const cookie = signed.set[0].split(';')[0]
  await level(app, near)
  const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  const receipt = JSON.parse((await asked(near, 'GET', '/orders/7/receipt', { cookie })).text)
  assert.deepEqual([receipt.id, receipt.user, receipt.from], ['7', maya, '203.0.113.77'])
})

test("[29-9] a file that is made, read and downloaded through a reader is the writer's: the reader hands on what needs the bytes, and writes no row of a file itself", async (t) => {
  tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'filed') })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  const signed = await called(app, 'signIn', { email: 'maya@example.com' })
  const cookie = signed.set[0].split(';')[0]
  const maya = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  await level(app, near)

  // An action that makes a file, sent to the reader: the writer makes it, and the reader holds its row.
  const before = app.at().n
  const made = await called(near, 'putText', { words: 'made through a reader' }, { cookie, as: maya })
  assert.equal(made.wire.ok, true, JSON.stringify(made.wire))
  const id = String(made.wire.value)
  assert.ok(app.at().n > before, 'the writer wrote the row of the file')
  await level(app, near)
  assert.equal(near.at().n, app.at().n)
  // An action that reads the bytes, and a download, both asked of the reader, are answered with the bytes.
  const read = await called(near, 'getText', { id }, { cookie, as: maya })
  assert.deepEqual(read.wire, { ok: true, value: 'made through a reader' })
  const got = await asked(near, 'GET', `/_t/files/${id}`, { cookie })
  assert.deepEqual([got.status, got.text], [200, 'made through a reader'])
  // An upload that the reader got is the writer's too.
  const up = await near.request(
    new Request(`${origin}/_t/files?name=up.txt`, {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'text/plain', 'content-length': '8' },
      body: 'uploaded',
    }),
  )
  const told = Object(await up.json())
  assert.equal(told.ok, true, JSON.stringify(told))
  const file = Object(told.value)
  assert.deepEqual([file.name, file.size], ['up.txt', 8])
  assert.equal((await asked(app, 'GET', `/_t/files/${file.id}`, { cookie })).text, 'uploaded')
})

test('[29-9] the settings of the app reach its readers, and no secret does: a reader that joins is told them, a setting that is set on the writer is used by every reader once the command is answered, and a reader sets none', async (t) => {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'firstTime'), secrets: { PROXY_WORD: 'the-word-of-the-proxy' } })
  closing(t, () => app.close())
  const home = join(temp, String(readdirSync(temp).find((name) => name.startsWith('tent-test-'))))
  /** Sends a command of the settings to a machine, as a command of that computer does. */
  const command = async (machine: TestApp, folder: string, args: object) => {
    const { token } = JSON.parse(readFileSync(join(home, folder, 'engine.json'), 'utf8'))
    const answer = await machine.request(
      new Request(`${origin}/_t/admin/settings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ args }),
      }),
    )
    return { status: answer.status, body: Object(await answer.json()) }
  }
  /** The public settings that a page of a machine is handed. */
  const shown = async (machine: TestApp): Promise<string> =>
    /"settings":(\{[^}]*\})/.exec(await (await machine.request(new Request(`${origin}/`))).text())?.[1] ?? ''

  // A setting that was set before any reader joined: each reader is told it when it joins.
  const first = await command(app, 'data', { do: 'set', name: 'shopName', value: 'The first name', written: true })
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const near = await app.reader()
  const far = await app.reader({ far: true })
  await current(app, near, far)
  await until('each reader uses the settings it was told', async () =>
    [await shown(near), await shown(far)].every((one) => one === '{"shopName":"The first name"}'),
  )

  // A setting that is set while the readers are joined: when the command is answered, every reader uses it.
  const second = await command(app, 'data', { do: 'set', name: 'shopName', value: 'The second name', written: true })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  assert.deepEqual(
    [await shown(app), await shown(near), await shown(far)],
    Array(3).fill('{"shopName":"The second name"}'),
  )
  // Each reader wrote the settings into its own file, and holds no file of secrets: no secret is copied.
  for (const folder of ['reader-2', 'reader-3']) {
    const kept = JSON.parse(readFileSync(join(home, folder, 'settings.test'), 'utf8'))
    assert.deepEqual(kept.values, { shopName: 'The second name' }, folder)
    assert.deepEqual(
      readdirSync(join(home, folder)).filter((name) => name.startsWith('secrets')),
      [],
      folder,
    )
  }
  // A setting that is taken away on the writer is taken away on the readers.
  await command(app, 'data', { do: 'remove', name: 'shopName' })
  assert.deepEqual([await shown(near), await shown(far)], Array(2).fill('{"shopName":"The shop"}'))
  // The settings are the writer's: a reader sets none.
  const refused = await command(near, 'reader-2', {
    do: 'set',
    name: 'shopName',
    value: 'Set on a reader',
    written: true,
  })
  assert.equal(Object(refused.body.error).code, 'T0030', JSON.stringify(refused.body))
  assert.equal(await shown(near), '{"shopName":"The shop"}')
})

test('[29-9] a reader holds no secrets file and no key: a query that reads a sealed column, and a use of a secret that has no value there, are handed on by the reader and answered by the writer', async (t) => {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'vaulted'), secrets: { API_KEY: 'the-key-of-the-test' } })
  closing(t, () => app.close())
  const near = await app.reader()
  await current(app, near)
  const home = join(temp, String(readdirSync(temp).find((name) => name.startsWith('tent-test-'))))
  assert.deepEqual(
    readdirSync(join(home, 'reader-2')).filter((name) => name.startsWith('secret')),
    [],
    'the reader holds neither a secrets file nor a key',
  )
  const post = async (machine: TestApp, path: string, input: object) => {
    const answer = await machine.request(
      new Request(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ input }),
      }),
    )
    return Object(await answer.json())
  }
  assert.equal((await post(app, '/_t/call/keep', { title: 'a', note: 'what only the key opens' })).ok, true)
  await level(app, near)
  // The reader holds the row with its sealed text, and cannot open it: the read is the writer's.
  assert.deepEqual(await post(near, '/_t/read/kept', {}), {
    ok: true,
    value: [{ title: 'a', note: 'what only the key opens' }],
  })
  // A secret has no value on the reader: the action that opens it is the writer's too.
  assert.deepEqual(await post(near, '/_t/call/valueOf', { name: 'API_KEY' }), {
    ok: true,
    value: 'the-key-of-the-test',
  })
})
