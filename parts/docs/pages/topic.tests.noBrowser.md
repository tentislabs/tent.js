# A browser, with no browser

`app.as(caller)` hands its caller straight to the function. What only a request of a browser shows, a sign-in above all, is tested with `app.browser()`: a caller that keeps the cookies it is handed, and whose every request passes every step of the door, in the program of the test and with no network.

```ts
test('a sign-in makes the browser that user', async () => {
  const app = await testApp()
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email: 'maya@example.com' }), { ok: true, caller: 'changed' })
  assert.deepEqual(await browser.call('whoAmI'), { ok: true, value: maya.user.id })
  assert.equal((await app.browser().page('/account')).status, 302)
  await app.close()
})
```

| Member | Does |
|---|---|
| `browser.call(fn, input, { as })` | A call at `/_t/call/`, as a press of a page sends it. It answers the whole wire form, `{ ok, value }` or `{ ok, error }`, and never refuses its promise for a failure of the call: so a test sees `caller: 'changed'` after a call that started or ended a session |
| `browser.read(fn, input, { as })` | A read at `/_t/read/`, as a page asks a query or an action again |
| `browser.page(path)` | A request for a screen: `{ status, headers, html }` |
| `browser.upload(bytes, { name, kind, for, field })` | An upload at `/_t/files`. It answers the whole wire form |
| `browser.request(method, path, { headers, body })` | Any request: it answers the standard response, with its headers, a `Set-Cookie` among them |

`app.browser({ as: caller })` is a browser that holds the cookie of a session that `app.session` made for that user, from its first request. `app.browser({ origin, from, site })` states the scheme and the name it reaches the app by, `http://localhost` where none is given and `https://shop.test` for the cookies of https; the address its requests come from; and the site they say they come from, for a post from another site, which the door refuses with `code.T0004`.

A page states the user it was drawn for with each call, as `as`, and the door runs no call whose caller is another one: it answers `code.T3101` with `caller: 'changed'`. The browser of a test does what a page does: it states the user of its last `page`, and after an answer that says the caller changed it asks for its screen again and states the user of that. `{ as }` on a call states another user, as a page does that was drawn before a sign-out.
