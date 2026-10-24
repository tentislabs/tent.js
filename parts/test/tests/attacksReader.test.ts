import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { TestApp, TestReader } from '../index.ts'
import { testApp } from '../index.ts'
import { current, level } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

const origin = 'http://localhost'

/** The pages under attack on three machines: a writer, a near reader and a far reader, joined and current. */
async function machines(t: TestContext): Promise<{ app: TestApp; near: TestReader; far: TestReader }> {
  tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'gate') })
  closing(t, () => app.close())
  const near = await app.reader()
  const far = await app.reader({ far: true })
  await current(app, near, far)
  return { app, near, far }
}

/** What an attack says of one request to one machine. A `body` makes it a `POST` of JSON. */
interface Asking {
  cookie?: string
  // The user that the page of a signed-in browser names, which its call or read states as `as`.
  as?: string
  body?: unknown
  headers?: Record<string, string>
  from?: string
}

/** A request of the web to one machine, with no network: from this computer where the attack names no other address. */
async function ask(
  machine: TestApp,
  path: string,
  o: Asking = {},
): Promise<{ status: number; text: string; headers: Headers }> {
  const request = new Request(origin + path, {
    method: o.body === undefined ? 'GET' : 'POST',
    headers: {
      ...(o.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(o.cookie ? { cookie: o.cookie } : {}),
      ...o.headers,
    },
    ...(o.body === undefined
      ? {}
      : { body: JSON.stringify(o.as === undefined ? o.body : { ...Object(o.body), as: o.as }) }),
  })
  const answer = await machine.request(request, o.from === undefined ? {} : { from: o.from })
  return { status: answer.status, text: await answer.text(), headers: answer.headers }
}

/**
 * Has the writer make a session for a user, and waits until the readers hold it, as they hold every session by their
 * copy. Answers the cookie of the session.
 */
async function signed(app: TestApp, readers: TestReader[], id: string): Promise<string> {
  const cookie = app.session(id)
  await level(app, ...readers)
  return cookie
}

/** An answer as two machines are compared: its status, where it sends on, and its body, without what names the moment or the request. */
// The nonce of a page is made at random for each document (43, section 3, point 5): it tells nothing of the screen.
const told = (answer: { status: number; text: string; headers: Headers }): unknown[] => {
  const nonce = /'nonce-([\w-]+)'/.exec(answer.headers.get('content-security-policy') ?? '')?.[1]
  const plain = (text: string): string => (nonce === undefined ? text : text.replaceAll(nonce, '<nonce>'))
  return [
    answer.status,
    answer.headers.get('location'),
    plain(answer.headers.get('content-security-policy') ?? ''),
    plain(answer.text.replace(/"ref":"[a-z0-9]{8}"/g, '"ref":"<ref>"')),
  ]
}

test('[05-4.7] a screen, a read and a file of the bundle on a reader: what the writer refuses a caller, each reader refuses the same', async (t) => {
  const { app, near, far } = await machines(t)
  await app.write([{ add: 'notes', values: { title: 'for the staff', hidden: 'HIDDEN-VALUE-OF-A-ROW' } }], {
    as: 'system',
  })
  const bob = String((await app.user({ name: 'Bob', roles: [] })).user?.id)
  const ada = String((await app.user({ name: 'Ada', roles: ['staff'] })).user?.id)
  await level(app, near, far)
  const server = Object(app.description.server)
  const asks: [string, Asking][] = [
    ['/staff', {}],
    ['/staff/7', {}],
    ['/staff?tab=paid', {}],
    ['/mixed', {}],
    ['/account', {}],
    ['/stuff', {}],
    ['/', {}],
    ['/_t/b/../description.json', {}],
    ['/_t/b/description.json', {}],
    [`/_t/b/${server.screens}`, {}],
    ['/_t/b/browser/screens.nothing.0123456789ab.js', {}],
    ['/_t/read/staffNotes', { body: { input: {} } }],
    ['/_t/read/forStaff', { body: { input: {} } }],
    ['/_t/read/addNote', { body: { input: { title: 'read as a change' } } }],
    ['/_t/read/notes', { body: { input: {} } }],
    ['/_t/read/allNotes', { body: { input: { more: 1 } } }],
    ['/_t/read/allNotes', { body: { input: {}, version: '../../data' } }],
    ['/_t/read/allNotes', { body: { input: {} }, headers: { origin: 'https://evil.example' } }],
    ['/_t/call/forStaff', { body: { input: {} } }],
    [
      '/_t/call/addNote',
      { body: { input: { title: 'from another site' } }, headers: { origin: 'https://evil.example' } },
    ],
  ]
  const cookies = { nobody: '', bob: await signed(app, [near, far], bob) }
  const staff = await signed(app, [near, far], ada)
  for (const reader of [near, far]) {
    for (const who of ['nobody', 'bob'] as const)
      for (const [path, o] of asks) {
        const [here, there] = [
          await ask(reader, path, { ...o, cookie: cookies[who], ...(who === 'bob' ? { as: bob } : {}) }),
          await ask(app, path, { ...o, cookie: cookies[who], ...(who === 'bob' ? { as: bob } : {}) }),
        ]
        assert.deepEqual(told(here), told(there), `${who} ${path} ${JSON.stringify(o)}`)
        assert.ok(!here.text.includes('HIDDEN-VALUE-OF-A-ROW'), `${who} ${path}: a private column`)
      }
    // The refusals are refusals: what the comparison holds is no pair of open doors.
    assert.equal((await ask(reader, '/staff', { cookie: cookies.bob })).status, 404)
    assert.equal((await ask(reader, '/staff')).status, 302)
    assert.match(
      (await ask(reader, '/_t/read/staffNotes', { body: { input: {} }, cookie: cookies.bob, as: bob })).text,
      /T3101/,
    )
    assert.match((await ask(reader, '/_t/read/staffNotes', { body: { input: {} } })).text, /T0006/)
    // What a reader adds to a request it hands on, sent by a visitor, makes nobody a user on the reader.
    const forged: Record<string, string>[] = [{ 'x-tent-as': `user:${ada}` }, { 'tent-caller': `user:${ada}` }]
    for (const headers of forged)
      for (const path of ['/staff', '/account', '/writes/change']) {
        const answer = await ask(reader, path, { headers })
        assert.ok(answer.status !== 200 && !answer.text.includes('for the staff'), `${path} ${JSON.stringify(headers)}`)
      }
    // A session that the writer made is the same user on each reader, which holds it by its copy.
    assert.equal((await ask(reader, '/staff', { cookie: staff })).status, 200)
    assert.equal((await ask(app, '/staff', { cookie: staff })).status, 200)
    // A screen and a read whose action writes, asked of the reader: handed on or not, nothing is written anywhere.
    const before = (await app.rows('notes')).length
    for (const cookie of ['', staff]) {
      const as = cookie ? { as: ada } : {}
      assert.equal(
        (await ask(reader, '/writes/change', { cookie, headers: { referer: 'https://evil.example/' } })).status,
        500,
      )
      assert.equal((await ask(reader, '/writes/system', { cookie })).status, 500)
      assert.match((await ask(reader, '/_t/read/writesByChange', { body: { input: {} }, cookie, ...as })).text, /T0009/)
      assert.match((await ask(reader, '/_t/read/writesAsSystem', { body: { input: {} }, cookie, ...as })).text, /T0009/)
    }
    await level(app, near, far)
    assert.equal((await app.rows('notes')).length, before)
    assert.equal((await reader.rows('notes')).length, before)
  }
})

test('[05-4.7] a user who loses a role on the writer is kept from the screen on a reader, once the reader holds the write', async (t) => {
  const { app, near, far } = await machines(t)
  const ada = String((await app.user({ name: 'Ada', roles: ['staff'] })).user?.id)
  await level(app, near, far)
  const cookies = new Map<TestApp, string>()
  const cookie = await signed(app, [near, far], ada)
  for (const reader of [near, far]) {
    cookies.set(reader, cookie)
    assert.equal((await ask(reader, '/staff', { cookie: cookies.get(reader) ?? '' })).status, 200)
  }
  await app.write([{ change: 'users', id: ada, values: { roles: [] } }], { as: 'system' })
  await level(app, near, far)
  for (const reader of [near, far]) {
    const cookie = cookies.get(reader) ?? ''
    assert.equal((await ask(reader, '/staff', { cookie })).status, 404)
    assert.match((await ask(reader, '/_t/read/staffNotes', { body: { input: {} }, cookie, as: ada })).text, /T3101/)
  }
  // A user whose row is gone is nobody on a reader too.
  await app.write([{ remove: 'users', id: ada }], { as: 'system' })
  await level(app, near, far)
  for (const reader of [near, far])
    assert.equal((await ask(reader, '/staff', { cookie: cookies.get(reader) ?? '' })).status, 302)
})
