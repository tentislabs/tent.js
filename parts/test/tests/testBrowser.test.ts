import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

async function idOf(app: TestApp, email: string): Promise<string> {
  return String((await app.rows('users')).find((one) => one.email === email)?.id)
}

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'callers') })
  closing(t, () => app.close())
  return app
}

test('[17-5] with app.browser() a sign-in action written by a builder sets its cookie and the next call of that browser is the user, and a second browser is nobody', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const [browser, second] = [app.browser(), app.browser()]
  // Before the sign-in the browser is nobody, and a screen that needs a sign-in sends it there.
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: 'nobody' })
  assert.equal((await browser.page('/account')).status, 302)
  // The sign-in answers the whole wire form, so a test sees that the caller changed.
  assert.deepEqual(await browser.call('signIn', { email: 'maya@example.com' }), { ok: true, caller: 'changed' })
  // The browser kept the cookie: its next call, its next read and its next page are the user's.
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: maya })
  assert.deepEqual(await browser.read('whoAmI'), { ok: true, value: maya })
  const page = await browser.page('/account')
  assert.equal(page.status, 200)
  assert.ok(page.html.includes(maya), page.html.slice(0, 400))
  // A second browser of the same test holds no cookie of the first.
  assert.deepEqual(await second.call('whoAmI'), { ok: true, value: 'nobody' })
  assert.equal((await second.page('/account')).status, 302)
  // The browser states the user of its last page as `as`: a call that states another is told that its caller changed.
  const stale = await browser.call('whoAmI', {}, { as: 'somebody-else' })
  assert.deepEqual([stale.ok, stale.error?.code, stale.caller], [false, 'T3101', 'changed'])
  // After the sign-out it is nobody again.
  assert.deepEqual(await browser.call('signOut'), { ok: true, caller: 'changed' })
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: 'nobody' })
})

test('[17-5] app.browser({ as }) is a browser that holds the cookie of a session that app.session made for that user, and request answers the standard response through every step of the door', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const browser = app.browser({ as: maya })
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: maya })
  assert.equal((await browser.page('/account')).status, 200)
  // A request is the standard response, and passes the door: a post that says it comes from another site is refused.
  const answer = await browser.request('POST', '/_t/call/whoAmI', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: {}, as: maya }),
  })
  assert.ok(answer instanceof Response)
  assert.deepEqual(await answer.json(), { ok: true, value: maya })
  const elsewhere = app.browser({ site: 'https://evil.example' })
  const refused = await elsewhere.call('whoAmI')
  assert.deepEqual([refused.ok, refused.error?.code], [false, 'T0004'])
  // A browser that reaches the app over https is handed the cookie of https, and is the user by it.
  const secure = app.browser({ origin: 'https://shop.test' })
  const signIn = await secure.request('POST', '/_t/call/signIn', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { email: 'maya@example.com' } }),
  })
  assert.match(signIn.headers.getSetCookie()[0], /^__Host-tent_session\.shop=.*; Secure; /)
  assert.deepEqual(await secure.call('whoAmI', {}, { as: maya }), { ok: true, value: maya })
  // A browser of a user over https holds the session under the name of https, and is that user by it.
  assert.deepEqual(await app.browser({ as: maya, origin: 'https://shop.test' }).call('whoAmI'), {
    ok: true,
    value: maya,
  })
  // Its session is one of the user's as any other: the browser lists it as its own.
  const listed = await browser.read('devices')
  assert.equal(Array.isArray(listed.value) && listed.value.some((one) => Object(one).current === true), true)
})

test('[17-5] app.session answers a cookie with which a browser is that user, as app.browser({ as }) is, and an id that names no row of users is T2103', async (t) => {
  const app = await opened(t)
  const maya = await idOf(app, 'maya@example.com')
  const cookie = app.session(maya)
  assert.match(cookie, /^tent_session\.shop=[A-Za-z0-9_-]{43}$/)
  const answer = await app.request(
    new Request('http://localhost/_t/call/whoAmI', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
      body: JSON.stringify({ input: {}, as: maya }),
    }),
  )
  assert.deepEqual(await answer.json(), { ok: true, value: maya })
  assert.equal((await app.browser({ as: maya }).page('/account')).status, 200)
  assert.throws(() => app.session('nobody-of-that-id'), { code: 'T2103' })
  // The test app has no pass: no address of the app makes a browser a user.
  assert.equal(Reflect.has(app, 'pass'), false)
})
