import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** One answer of the door, read as JSON. */
type Wire = { ok: boolean; value?: unknown; error?: { code: string }; caller?: string }

/** What a call of a browser told: the wire form, and the cookie lines that the answer set. */
interface Told {
  wire: Wire
  set: string[]
}

/** The `name=value` of the first cookie line of an answer, as a browser sends it back. */
const kept = (told: Told): string => (told.set[0] ?? '').split(';')[0]

/** Calls a function of the app as a browser would, with the cookies it is handed, and reads what came back. */
async function called(
  app: TestApp,
  name: string,
  input: object,
  o: { cookie?: string; as?: string; origin?: string; from?: string } = {},
): Promise<Told> {
  const origin = o.origin ?? 'http://localhost'
  const answer = await app.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
    o.from === undefined ? undefined : { from: o.from },
  )
  return { wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
}

/** The id of the user of the starter data that has an email. */
async function idOf(app: TestApp, email: string): Promise<string> {
  const row = (await app.rows('users')).find((one) => one.email === email)
  return String(row?.id)
}

/** Signs a user in, and answers the cookie of the session as a browser sends it back. */
async function signedIn(app: TestApp, email: string, more: object = {}): Promise<string> {
  const told = await called(app, 'signIn', { email, ...more })
  assert.equal(told.wire.ok, true, JSON.stringify(told.wire))
  return kept(told)
}

/** Who the door says a request with that cookie is, as the page of that user asks. */
async function who(app: TestApp, cookie: string | undefined, as?: string): Promise<unknown> {
  const told = await called(app, 'whoAmI', {}, { ...(cookie ? { cookie } : {}), ...(as ? { as } : {}) })
  return told.wire.ok ? told.wire.value : told.wire.error?.code
}

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'callers') })
  closing(t, () => app.close())
  return app
}

test('[22-1] a session that was ended in the database stops working on the next request', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const [phone, laptop] = [await signedIn(app, 'maya@example.com'), await signedIn(app, 'maya@example.com')]
  assert.equal(await who(app, phone, maya), maya)
  assert.equal(await who(app, laptop, maya), maya)
  // The laptop ends every session of the user: the row of the phone's session is gone from the data.
  const ended = await called(app, 'signOutEverywhere', {}, { cookie: laptop, as: maya })
  assert.equal(ended.wire.ok, true, JSON.stringify(ended.wire))
  assert.deepEqual(await app.as(maya).call('devices'), [])
  // The very next request of the phone is nobody's, with the cookie that worked a moment ago.
  assert.equal(await who(app, phone), 'nobody')
  assert.equal(await who(app, laptop), 'nobody')
})

test('[22-7] the cookie of a session has the marks of its kind: over https Secure and a name that starts __Host-, and over plain http neither', async (t) => {
  const app = await opened(t)
  const plain = await called(app, 'signIn', { email: 'maya@example.com' })
  assert.equal(plain.set.length, 1)
  assert.match(
    plain.set[0],
    /^tent_session\.shop=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/,
    plain.set[0],
  )
  const secure = await called(app, 'signIn', { email: 'maya@example.com' }, { origin: 'https://shop.test' })
  assert.match(
    secure.set[0],
    /^__Host-tent_session\.shop=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000$/,
    secure.set[0],
  )
  // Over https the bare name is never read: the session of the plain request names nobody there.
  const maya = await idOf(app, 'maya@example.com')
  const bare = await called(app, 'whoAmI', {}, { origin: 'https://shop.test', cookie: kept(plain) })
  assert.equal(bare.wire.value, 'nobody')
  const own = await called(app, 'whoAmI', {}, { origin: 'https://shop.test', cookie: kept(secure), as: maya })
  assert.equal(own.wire.value, maya)
})

test('[22-7] a cookie that was planted before a sign-in is not the session', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  // Another site, or a script, planted a value it knows under the name of the session cookie.
  const planted = `tent_session.shop=${'A'.repeat(43)}`
  const told = await called(app, 'signIn', { email: 'maya@example.com' }, { cookie: planted })
  assert.equal(told.wire.ok, true, JSON.stringify(told.wire))
  // The sign-in made a session of its own: the planted value was not taken over, and names nobody.
  assert.notEqual(kept(told), planted)
  assert.equal(await who(app, planted), 'nobody')
  assert.equal(await who(app, kept(told), maya), maya)
})

test('[22-7] a session that was not used for sessionTime is nobody, and one that is used meanwhile is moved on', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const [used, idle] = [await signedIn(app, 'maya@example.com'), await signedIn(app, 'maya@example.com')]
  // Used after 20 days, the session is moved on, and the cookie is sent again with its whole life.
  app.clock.advance('20 days')
  const moved = await called(app, 'whoAmI', {}, { cookie: used, as: maya })
  assert.equal(moved.wire.value, maya)
  assert.equal(moved.set.length, 1)
  assert.equal(kept(moved), used)
  assert.match(moved.set[0], /; Max-Age=2592000$/)
  // A second use within the day moves nothing, and sends no cookie.
  assert.deepEqual((await called(app, 'whoAmI', {}, { cookie: used, as: maya })).set, [])
  // Eleven days later the one that was used lives, and the one that was not used for 31 days is nobody.
  app.clock.advance('11 days')
  assert.equal(await who(app, used, maya), maya)
  assert.equal(await who(app, idle), 'nobody')
  // And 30 days after its last use the first one is nobody too.
  app.clock.advance('30 days')
  assert.equal(await who(app, used), 'nobody')
})

test('[22-7] the 21st session of a user ends the one that was used longest ago', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const first = await signedIn(app, 'maya@example.com')
  app.clock.advance('1 minute')
  const second = await signedIn(app, 'maya@example.com')
  // The first is used two days later, so the second is the one that was used longest ago.
  app.clock.advance('2 days')
  assert.equal(await who(app, first, maya), maya)
  const later: string[] = []
  for (let k = 0; k < 18; k++) {
    app.clock.advance('1 minute')
    later.push(await signedIn(app, 'maya@example.com'))
  }
  // Twenty sessions stand: they are counted with no request of theirs, since a request is a use.
  assert.equal(Object(await app.as(maya).call('devices')).length, 20)
  app.clock.advance('1 minute')
  const last = await signedIn(app, 'maya@example.com')
  assert.equal(Object(await app.as(maya).call('devices')).length, 20)
  assert.equal(await who(app, second), 'nobody')
  for (const cookie of [first, ...later, last]) assert.equal(await who(app, cookie, maya), maya)
  // Another user's sessions are counted apart.
  const omar = await signedIn(app, 'omar@example.com')
  assert.equal(await who(app, omar, await idOf(app, 'omar@example.com')), await idOf(app, 'omar@example.com'))
  assert.equal(await who(app, first, maya), maya)
})

test('[22-7] sessions.start under app.call is T0013: there is no browser to hand a cookie to', async (t) => {
  const app = await opened(t)
  await assert.rejects(app.as('nobody').call('signIn', { email: 'maya@example.com' }), { code: 'T0013' })
  await assert.rejects(app.as('system').call('signInWrite', { email: 'maya@example.com' }), { code: 'T0013' })
  assert.deepEqual(await app.as(await idOf(app, 'maya@example.com')).call('devices'), [])
})

test('[22-7] after a call that started or ended a session the answer says that the caller changed, and the next call of that browser is the user', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const told = await called(app, 'signIn', { email: 'maya@example.com' })
  assert.deepEqual(told.wire, { ok: true, caller: 'changed' })
  // A call that changed nothing of who is calling says nothing of it.
  const asked = await called(app, 'whoAmI', {}, { cookie: kept(told), as: maya })
  assert.deepEqual(asked.wire, { ok: true, value: maya })
  // A change that starts a session says so as an action does.
  const written = await called(app, 'signInWrite', { email: 'omar@example.com' })
  assert.deepEqual(written.wire, { ok: true, caller: 'changed' })
  // The end of a session says so too, and takes the cookie away.
  const out = await called(app, 'signOut', {}, { cookie: kept(told), as: maya })
  assert.deepEqual(out.wire, { ok: true, caller: 'changed' })
  assert.match(out.set[0], /^tent_session\.shop=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0$/)
  assert.equal(await who(app, kept(told)), 'nobody')
})

test('[21-8@7a] a session that is ended closes its live connection at once, with the one message that says the caller changed', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const cookie = await signedIn(app, 'maya@example.com')
  const other = await signedIn(app, 'maya@example.com')
  const open = (held: string): { heard: Record<string, unknown>[]; closed: () => boolean } => {
    const heard: Record<string, unknown>[] = []
    let closed = false
    const live = app.live(
      new Request(`http://localhost/_t/live?as=${maya}`, { headers: { cookie: held, origin: 'http://localhost' } }),
    )
    live.each(
      (message) => void heard.push(message),
      () => {
        closed = true
      },
    )
    live.send({ t: 'watch', id: 'w1', query: 'whoAmI', input: {} })
    return { heard, closed: () => closed }
  }
  const [mine, theirs] = [open(cookie), open(other)]
  for (let i = 0; i < 500 && !(mine.heard.length && theirs.heard.length); i++)
    await new Promise((done) => setTimeout(done, 5))
  assert.deepEqual([mine.heard[0]?.t, mine.heard[0]?.value], ['result', maya])
  assert.equal(mine.closed(), false)
  // The session ends: its connection is told and closed before the call is answered, and no other is.
  const out = await called(app, 'signOut', {}, { cookie, as: maya })
  assert.equal(out.wire.ok, true, JSON.stringify(out.wire))
  // What the engine sent crosses to the end of the page in a turn of its own.
  for (let i = 0; i < 500 && !mine.closed(); i++) await new Promise((done) => setTimeout(done, 5))
  assert.deepEqual(mine.heard.at(-1), { t: 'changed' })
  assert.equal(mine.closed(), true)
  assert.equal(theirs.closed(), false)
  assert.equal(
    theirs.heard.some((one) => one.t === 'changed'),
    false,
  )
})
