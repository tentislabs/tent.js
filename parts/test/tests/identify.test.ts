import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

/** One answer of the door, read as JSON. */
type Wire = { ok: boolean; value?: unknown; error?: { code: string }; caller?: string }

const origin = 'http://localhost'

/** Calls a function of the app with the headers of a request, and reads what came back with its status. */
async function called(
  app: TestApp,
  name: string,
  headers: Record<string, string> = {},
  o: { as?: string; from?: string } = {},
): Promise<{ status: number; wire: Wire; set: string[] }> {
  const answer = await app.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...headers },
      body: JSON.stringify({ input: {}, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
    o.from === undefined ? undefined : { from: o.from },
  )
  return { status: answer.status, wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
}

async function idOf(app: TestApp, email: string): Promise<string> {
  return String((await app.rows('users')).find((one) => one.email === email)?.id)
}

/** How often `identify` of the project was asked so far, read with no request of the web. */
const asked = async (app: TestApp): Promise<number> => Number(await app.as('system').call('asked'))

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'identified') })
  closing(t, () => app.close())
  return app
}

test('[22-8] identify names the caller: one that waits and reads db is asked where nothing else named one, an id that is no row of users is nobody, and an error in it is T0009', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const omar = await idOf(app, 'omar@example.com')
  // The login of the company names a person: the request is that user's, with the roles of the row.
  const named = await called(app, 'whoAmI', { 'company-user': 'maya@example.com' }, { as: maya })
  assert.deepEqual([named.status, named.wire], [200, { ok: true, value: maya }])
  assert.equal(await asked(app), 1)
  const staff = await called(app, 'whoAmI', { 'company-user': 'omar@example.com' }, { as: omar })
  assert.deepEqual(staff.wire, { ok: true, value: omar })
  // It names nobody: a request with no line of the login, one that names no user, and an id that no row has.
  const nobodies: Record<string, string>[] = [{}, { 'company-user': 'nobody@example.com' }, { 'company-user': 'ghost' }]
  for (const headers of nobodies)
    assert.deepEqual((await called(app, 'whoAmI', headers)).wire, { ok: true, value: 'nobody' })
  // An error in it fails that request with T0009, and the next one is answered.
  const broken = await called(app, 'whoAmI', { 'company-user': 'broken' })
  assert.deepEqual([broken.status, broken.wire.ok, broken.wire.error?.code], [500, false, 'T0009'])
  assert.equal((await called(app, 'whoAmI', { 'company-user': 'maya@example.com' }, { as: maya })).wire.value, maya)
  assert.equal(await asked(app), 7)
})

test('[22-8] a session is asked before identify: a request that carries one is that user, and identify is not called for it', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const omar = await idOf(app, 'omar@example.com')
  const signIn = await app.request(
    new Request(`${origin}/_t/call/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: { email: 'omar@example.com' } }),
    }),
  )
  const cookie = signIn.headers.getSetCookie()[0].split(';')[0]
  const before = await asked(app)
  // The login of the company says maya, and the session says omar: the session is asked first.
  const told = await called(app, 'whoAmI', { cookie, 'company-user': 'maya@example.com' }, { as: omar })
  assert.deepEqual(told.wire, { ok: true, value: omar })
  assert.equal(await asked(app), before)
  // With no session the same request is maya's.
  assert.equal((await called(app, 'whoAmI', { 'company-user': 'maya@example.com' }, { as: maya })).wire.value, maya)
  assert.equal(await asked(app), before + 1)
})

test('[22-8] a live connection of a caller that identify named is closed after identifyKept, so that it is asked anew', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const heard: Record<string, unknown>[] = []
  let closed = false
  // The watches that the page made after each sign of life: those that were answered, and how many were asked.
  const answered = new Set<string>()
  let asked = 0
  const live = app.live(
    new Request(`${origin}/_t/live?as=${maya}`, { headers: { origin, 'company-user': 'maya@example.com' } }),
  )
  live.each(
    (message) => {
      heard.push(message)
      // The page answers each sign of life, as a page that is there does: a silent one is closed for that alone.
      // Then it watches once more, whose result comes back only after the engine took the answer, which went first.
      if (message.t === 'alive') {
        live.send({ t: 'alive' })
        live.send({ t: 'watch', id: `after${asked++}`, query: 'whoAmI', input: {} })
      }
      if (message.t === 'result' && String(message.id).startsWith('after')) {
        answered.add(String(message.id))
        live.send({ t: 'unwatch', id: String(message.id) })
      }
    },
    () => {
      closed = true
    },
  )
  live.send({ t: 'watch', id: 'w1', query: 'whoAmI', input: {} })
  // What the engine and the page send crosses to the other end in a turn of its own.
  const turn = (): Promise<void> => new Promise((done) => setTimeout(done, 5))
  for (let i = 0; i < 2000 && !heard.length; i++) await turn()
  assert.deepEqual([heard[0]?.t, heard[0]?.value], ['result', maya])
  // Half a minute before the quarter of an hour it stands, with every sign of life answered on the way. The clock
  // moves on only once the engine took the answer to the sign of its last move.
  for (let k = 0; k < 29; k++) {
    const before = answered.size
    app.clock.advance('30 seconds')
    for (let i = 0; i < 2000 && answered.size === before && !closed; i++) await turn()
  }
  assert.equal(closed, false)
  // At the end of the quarter of an hour it is closed, though it answered every sign of life.
  app.clock.advance('30 seconds')
  for (let i = 0; i < 2000 && !closed; i++) await turn()
  assert.equal(closed, true)
  assert.equal(heard.filter((one) => one.t === 'alive').length >= 28, true)
})

test('[22-8] the 601st request of a minute from one address that would reach identify is T0005 before it is called, with a made-up session cookie too, while a signed-in caller behind that address is still answered', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const omar = await idOf(app, 'omar@example.com')
  const from = '203.0.113.9'
  // A caller signed in before the flood, and then asks from behind that address.
  const signIn = await app.request(
    new Request(`${origin}/_t/call/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ input: { email: 'omar@example.com' } }),
    }),
  )
  const cookie = signIn.headers.getSetCookie()[0].split(';')[0]
  // The count is kept for the minute that runs: the test begins at the start of one, so that all of it lies in it.
  app.clock.advance(`${60_000 - (Date.now() % 60_000) + 100} ms`)
  const before = await asked(app)
  // Six hundred requests of one address reach identify, each answered.
  for (let k = 0; k < 600; k++) {
    const told = await called(app, 'whoAmI', { 'company-user': 'maya@example.com' }, { as: maya, from })
    assert.equal(told.wire.value, maya, `request ${k + 1}`)
  }
  assert.equal(await asked(app), before + 600)
  // One more is refused before the code of the builder is called: with the line of the login, with none, and with a
  // session cookie that somebody made up.
  const madeUp = `tent_session.shop=${'B'.repeat(43)}`
  const refused: Record<string, string>[] = [{ 'company-user': 'maya@example.com' }, {}, { cookie: madeUp }]
  for (const headers of refused) {
    const told = await called(app, 'whoAmI', headers, { from })
    assert.deepEqual([told.status, told.wire.error?.code], [429, 'T0005'], JSON.stringify(headers))
  }
  assert.equal(await asked(app), before + 600)
  // The caller with a session behind that address is not counted with them, and another address is not held.
  assert.deepEqual((await called(app, 'whoAmI', { cookie }, { as: omar, from })).wire, { ok: true, value: omar })
  const elsewhere = await called(
    app,
    'whoAmI',
    { 'company-user': 'maya@example.com' },
    { as: maya, from: '203.0.113.10' },
  )
  assert.equal(elsewhere.wire.value, maya)
  // When the minute has ended the address is asked again.
  app.clock.advance('1 minute')
  assert.equal(
    (await called(app, 'whoAmI', { 'company-user': 'maya@example.com' }, { as: maya, from })).wire.value,
    maya,
  )
})
