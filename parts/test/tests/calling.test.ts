import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { besieged, wire } from './sieges.ts'

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
  o: { cookie?: string; as?: string; headers?: Record<string, string> } = {},
): Promise<Told> {
  const origin = 'http://localhost'
  const answer = await app.request(
    new Request(`${origin}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers },
      body: JSON.stringify({ input, ...(o.as === undefined ? {} : { as: o.as }) }),
    }),
  )
  return { wire: Object(await answer.json()), set: answer.headers.getSetCookie() }
}

async function idOf(app: TestApp, email: string): Promise<string> {
  return String((await app.rows('users')).find((one) => one.email === email)?.id)
}

/** A user of the starter data, as a caller. */
const seeded = async (app: TestApp, email: string) => ({
  kind: 'user' as const,
  user: { id: await idOf(app, email), roles: [] },
})

/** Who the door says a request with that cookie is, as the page of that user asks. */
async function who(app: TestApp, cookie: string | undefined, as?: string): Promise<unknown> {
  const told = await called(app, 'whoAmI', {}, { ...(cookie ? { cookie } : {}), ...(as ? { as } : {}) })
  return told.wire.ok ? told.wire.value : told.wire.error?.code
}

const opened = async (t: TestContext, project = 'callers', secrets: Record<string, string> = {}): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, project), secrets })
  closing(t, () => app.close())
  return app
}

test('[22-18] a session cookie and a second one of the same name make the caller nobody; sessions.list shows the sessions of a user, and sessions.end(id) ends one', async (t) => {
  const app = await opened(t)
  const maya = await seeded(app, 'maya@example.com')
  const id = String(maya.user?.id)
  const first = kept(await called(app, 'signIn', { email: 'maya@example.com' }))
  const second = kept(await called(app, 'signIn', { email: 'maya@example.com' }))
  assert.equal(await who(app, first, id), id)
  // Two cookies of the one name: which of them a browser means cannot be told, so neither names a caller.
  assert.equal(await who(app, `${first}; ${second}`), 'nobody')
  assert.equal(await who(app, `${first}; ${first.split('=')[0]}=planted`), 'nobody')

  // `sessions.list` shows both sessions of the user, and marks the one of the request.
  const listed = await called(app, 'devices', {}, { cookie: first, as: id })
  const devices: { id: string; current: boolean }[] = Object(listed.wire.value)
  assert.deepEqual(
    devices.map((one) => one.current),
    [true, false],
  )
  // `sessions.end(id)` ends that one session, and leaves the other.
  const other = devices.find((one) => !one.current)
  assert.equal((await called(app, 'signOutOne', { id: other?.id }, { cookie: first, as: id })).wire.ok, true)
  assert.equal(await who(app, second), 'nobody')
  assert.equal(await who(app, first, id), id)
})

test('[22-18] sessions.start with browserOnly sets a cookie with no life of its own, and in a change that is undone no session stays', async (t) => {
  const app = await opened(t)
  const maya = await seeded(app, 'maya@example.com')
  const id = String(maya.user?.id)
  const lasting = await called(app, 'signIn', { email: 'maya@example.com' })
  assert.match(lasting.set[0], /; Max-Age=\d+/)
  const ending = await called(app, 'signIn', { email: 'maya@example.com', browserOnly: true })
  assert.doesNotMatch(ending.set[0], /Max-Age|Expires/i)
  assert.equal(await who(app, kept(ending), id), id)

  // A change that starts a session and is undone: no cookie leaves, and the user has no session more than before.
  const before = Object((await called(app, 'devices', {}, { cookie: kept(lasting), as: id })).wire.value).length
  const undone = await called(app, 'signInWrite', { email: 'maya@example.com', undo: true })
  assert.deepEqual([undone.wire.ok, undone.wire.error?.code, undone.set], [false, 'undone', []])
  const after = Object((await called(app, 'devices', {}, { cookie: kept(lasting), as: id })).wire.value).length
  assert.equal(after, before)
})

test('[22-18] a second page of the browser, after another user signed in, is told that its caller changed at its next call, and sessions.start replaces the session that the test made for that browser', async (t) => {
  const app = await opened(t)
  const maya = await seeded(app, 'maya@example.com')
  const omar = await seeded(app, 'omar@example.com')
  const [mayaId, omarId] = [String(maya.user?.id), String(omar.user?.id)]
  // One browser, two pages: the first was drawn for Maya. Then Omar signs in on the second.
  const mayas = kept(await called(app, 'signIn', { email: 'maya@example.com' }))
  assert.equal(await who(app, mayas, mayaId), mayaId)
  const omars = kept(await called(app, 'signIn', { email: 'omar@example.com' }, { cookie: mayas, as: mayaId }))
  // The first page still names Maya: its next call is not carried out, and it is told that its caller changed.
  const stale = await called(app, 'whoAmI', {}, { cookie: omars, as: mayaId })
  assert.deepEqual([stale.wire.ok, stale.wire.caller, stale.wire.value], [false, 'changed', undefined])
  assert.equal(await who(app, omars, omarId), omarId)

  // A browser of a session that the test made for Maya: a sign-in as Omar ends that session, so the browser is Omar
  // from then on, and the session of Maya is gone.
  const browser = app.browser({ as: maya })
  assert.deepEqual(await browser.call('whoAmI', {}), { ok: true, value: mayaId })
  const sessionsOf = async (): Promise<number> => Object(await app.as(maya).call('devices', {})).length
  const before = await sessionsOf()
  assert.equal((await browser.call('signIn', { email: 'omar@example.com' })).caller, 'changed')
  assert.deepEqual(await browser.call('whoAmI', {}), { ok: true, value: omarId })
  assert.equal(await sessionsOf(), before - 1)
})

test('[22-18] a session that was started with for: 30 minutes and is used every five minutes lasts past the half hour, and ends half an hour after its last use', async (t) => {
  const app = await opened(t)
  const maya = await seeded(app, 'maya@example.com')
  const id = String(maya.user?.id)
  const cookie = kept(await called(app, 'signIn', { email: 'maya@example.com', for: '30 minutes' }))
  for (let minutes = 5; minutes <= 45; minutes += 5) {
    app.clock.advance('5 minutes')
    assert.equal(await who(app, cookie, id), id, `after ${minutes} minutes`)
  }
  app.clock.advance('31 minutes')
  assert.equal(await who(app, cookie), 'nobody')
})

test('[22-18] identify opens a secret, and gives a first-time person their row through call', async (t) => {
  const app = await opened(t, 'firstTime', { PROXY_WORD: 'the-word-of-the-proxy' })
  assert.deepEqual(await app.rows('users'), [])
  const proxied = { 'x-proxy-word': 'the-word-of-the-proxy', 'x-company-user': 'ada@example.com' }
  // The first request of a person: `identify` has a change that nobody may call give them their row. The page
  // that asked was drawn for a visitor, so it is told that its caller changed.
  const first = await called(app, 'whoAmI', {}, { headers: proxied })
  const ada = await idOf(app, 'ada@example.com')
  assert.match(ada, /^[0-9a-hjkmnp-tv-z]{26}$/)
  assert.equal(first.wire.caller, 'changed')
  // The next request, of a page that was drawn for that person, finds the row: no second one is made.
  const asAda = { headers: proxied, as: ada }
  assert.deepEqual((await called(app, 'whoAmI', {}, asAda)).wire, { ok: true, value: ada })
  assert.equal((await app.rows('users')).length, 1)
  // A request with another word than the secret holds is nobody, and so is one with none.
  const wrong = { ...proxied, 'x-proxy-word': 'a-guess' }
  assert.deepEqual((await called(app, 'whoAmI', {}, { headers: wrong })).wire, { ok: true, value: 'nobody' })
  assert.deepEqual((await called(app, 'whoAmI', {})).wire, { ok: true, value: 'nobody' })
  // The change itself is open to nobody from outside.
  assert.equal((await called(app, 'welcome', { email: 'eve@example.com' })).wire.error?.code, 'T0006')
})

test('[22-18] a public setting that is set reaches page.settings, and one that is not public does not', async (t) => {
  const project = copyOf(t, 'firstTime')
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const siege = await besieged(t, { bundle: made.bundleFolder, open: { mode: 'test', address: '*' } })
  const page = async (): Promise<string> => (await wire(siege, { method: 'GET', path: '/' })).text
  // Where nothing is set, the page holds the default of the public setting.
  assert.match(await page(), /"settings":\{"shopName":"The shop"\}/)
  const set = await wire(siege, {
    path: '/_t/admin/settings',
    headers: { authorization: `Bearer ${siege.token}` },
    body: JSON.stringify({ args: { do: 'set', name: 'shopName', value: 'The corner shop', written: true } }),
  })
  assert.equal(set.status, 200, set.text)
  // The next page that is drawn holds what was set, and nothing of a setting that is not public.
  const html = await page()
  assert.match(html, /"settings":\{"shopName":"The corner shop"\}/)
  assert.equal(html.includes('for the owner alone'), false)
})

test('[22-18] a password that is stored after passwordMemory was raised names the new number, and one stored before is old', async (t) => {
  const folder = copyOf(t, 'guarded')
  const file = join(folder, 'tent.ts')
  const written = readFileSync(file, 'utf8')
  const app = await testApp({ folder })
  closing(t, () => app.close())
  // The same project with more memory for a password: 32 MB in place of 19.
  const raised = copyOf(t, 'guarded')
  assert.ok(written.includes('limits: { '), 'the project states its limits')
  writeFileSync(join(raised, 'tent.ts'), written.replace('limits: { ', "limits: { passwordMemory: '32 MB', "))
  const next = await testApp({ folder: raised })
  closing(t, () => next.close())
  await next.as('system').call('signUp', { email: 'ada@example.com', password: 'correct horse battery' })
  const stored = String((await next.rows('users')).find((one) => one.email === 'ada@example.com')?.password)
  assert.match(stored, /^\$argon2id\$v=19\$m=32768,t=2,p=1\$/)
  assert.equal(await next.as('system').call('isOld', { stored }), false)
  // What the app stored with the number before still checks, and is old now.
  await app.as('system').call('signUp', { email: 'bob@example.com', password: 'correct horse battery' })
  const old = String((await app.rows('users')).find((one) => one.email === 'bob@example.com')?.password)
  assert.match(old, /\$m=19456,/)
  assert.equal(await next.as('system').call('checks', { password: 'correct horse battery', stored: old }), true)
  assert.equal(await next.as('system').call('isOld', { stored: old }), true)
})
