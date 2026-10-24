import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const opened = async (t: test.TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'routed') })
  closing(t, () => app.close())
  return app
}

async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

/** What a request of a browser was answered: its status, its headers, and its body as text. */
async function asked(
  browser: TestBrowser,
  method: string,
  path: string,
  o: { headers?: Record<string, string>; body?: string } = {},
) {
  const answer = await browser.request(method, path, o)
  return { status: answer.status, headers: answer.headers, text: await answer.text() }
}

/** The code of the wire error that an answer holds, or nothing for an answer that is none. */
function codeIn(text: string): string | undefined {
  try {
    return Object(Object(JSON.parse(text)).error).code
  } catch {
    return undefined
  }
}

test('[21-12] onRequest answers a request itself, sends a visitor elsewhere, hands a request on for another address, and adds a header to the answer', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  // It answers itself: the door is never asked.
  const closed = await asked(visitor, 'GET', '/closed')
  assert.deepEqual([closed.status, closed.text, closed.headers.get('x-frame')], [503, 'closed for today', null])
  // It sends a visitor elsewhere.
  const moved = await asked(visitor, 'GET', '/old')
  assert.deepEqual([moved.status, new URL(String(moved.headers.get('location'))).pathname], [307, '/feed.xml'])
  // It hands a request on for another address: the answer is that of the other address, and no cache keeps it.
  const alias = await asked(visitor, 'GET', '/alias')
  assert.deepEqual([alias.status, alias.text, alias.headers.get('cache-control')], [200, '<rss/>', 'no-store'])
  // It adds a header to what the door answered: a route, a call, and a refusal alike.
  const feed = await asked(visitor, 'GET', '/feed.xml')
  assert.deepEqual([feed.status, feed.text, feed.headers.get('x-frame')], [200, '<rss/>', 'shop'])
  const call = await asked(visitor, 'POST', '/_t/call/noteWords', {
    headers: { 'content-type': 'application/json' },
    body: '{"input":{}}',
  })
  assert.deepEqual(
    [call.status, call.headers.get('x-frame'), JSON.parse(call.text)],
    [200, 'shop', { ok: true, value: [] }],
  )
  const none = await asked(visitor, 'POST', '/_t/call/noSuchFunction', {
    headers: { 'content-type': 'application/json' },
    body: '{"input":{}}',
  })
  assert.deepEqual([none.status, none.headers.get('x-frame'), codeIn(none.text)], [404, 'shop', 'T0001'])
  // It is handed what the engine knows of the request, and the request with the engine's own headers taken out.
  const about = JSON.parse((await asked(visitor, 'GET', '/about', { headers: { 'x-tent-from': '203.0.113.9' } })).text)
  assert.deepEqual(Object.keys(about).sort(), ['forged', 'from', 'origin'])
  assert.equal(about.forged, null)
  assert.match(about.origin, /^https?:\/\//)
})

test('[21-12] a request that onRequest hands on for a function the caller may not call is still refused by the rule of the function, and an error in it answers T0009', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  const refused = await asked(visitor, 'GET', '/alias-staff')
  assert.deepEqual([refused.status, codeIn(refused.text)], [401, 'T0006'])
  const omar = await signedIn(app, 'omar@example.com')
  assert.equal(codeIn((await asked(omar, 'GET', '/alias-staff')).text), 'T3101')
  // An error in the code of the builder is the general error, and the app goes on answering.
  const failed = await asked(visitor, 'GET', '/broken')
  assert.deepEqual([failed.status, codeIn(failed.text)], [500, 'T0009'])
  assert.equal((await asked(visitor, 'GET', '/feed.xml')).status, 200)
})

test('[21-12] a route answers its address with the response of the builder, is handed the values of its path, its caller and what the engine knows, and is not found under a method it does not state', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  const feed = await asked(visitor, 'GET', '/feed.xml')
  assert.deepEqual([feed.status, feed.headers.get('content-type'), feed.text], [200, 'application/xml', '<rss/>'])
  // A method that the route does not state is not found: no route answers it.
  assert.equal((await asked(visitor, 'POST', '/feed.xml', { body: 'x' })).status, 404)
  assert.equal((await asked(visitor, 'DELETE', '/docs/a')).status, 404)
  // A list of methods, and the rest of an address.
  assert.equal((await asked(visitor, 'GET', '/docs/guides/first%20steps')).text, 'GET guides/first steps')
  assert.equal((await asked(visitor, 'PUT', '/docs/a/b', { body: 'x' })).text, 'PUT a/b')
  // The values of the path, the user, and what the engine knows of the request.
  const maya = await signedIn(app, 'maya@example.com')
  const receipt = JSON.parse((await asked(maya, 'GET', '/orders/A%2F7/receipt')).text)
  const mayaId = String((await app.rows('users')).find((one) => one.email === 'maya@example.com')?.id)
  assert.deepEqual([receipt.id, receipt.user, receipt.method], ['A/7', mayaId, 'GET'])
  assert.equal(typeof receipt.from, 'string')
  assert.match(receipt.origin, /^https?:\/\//)
})

test("[32-7@7a] a route at /api/orders/:id answers, and an address under /_t/ is the engine's own whatever a route says", async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  const order = await asked(visitor, 'GET', '/api/orders/A7')
  assert.deepEqual([order.status, JSON.parse(order.text)], [200, { order: 'A7' }])
  assert.equal(codeIn((await asked(visitor, 'GET', '/api/orders')).text), 'T0001')
  assert.equal((await asked(visitor, 'GET', '/_t/health')).status, 200)
})

test('[21-12] a route passes steps 1 to 6 and 10 of the door: it refuses a caller that its access does not let in, and holds its body to its size and its work to its time', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  // Step 6: nobody is told to sign in, and a user without the role is refused. The refusal is the wire error.
  const nobody = await asked(visitor, 'GET', '/orders/7/receipt')
  assert.deepEqual([nobody.status, codeIn(nobody.text)], [401, 'T0006'])
  assert.match(String(nobody.headers.get('content-type')), /^application\/json/)
  const omar = await signedIn(app, 'omar@example.com')
  const maya = await signedIn(app, 'maya@example.com')
  assert.deepEqual(
    [(await asked(omar, 'GET', '/staff/report')).status, codeIn((await asked(omar, 'GET', '/staff/report')).text)],
    [403, 'T3101'],
  )
  assert.equal((await asked(maya, 'GET', '/staff/report')).text, 'the report of the staff')
  // A rule made with `allow` is run on the request and the values of its path, and refuses.
  assert.equal((await asked(visitor, 'GET', '/words/plum', { headers: { 'x-word': 'plum' } })).text, 'the word is plum')
  assert.equal(codeIn((await asked(visitor, 'GET', '/words/plum', { headers: { 'x-word': 'pear' } })).text), 'T0006')
  assert.equal(codeIn((await asked(omar, 'GET', '/words/plum')).text), 'T3101')
  // An error that `run` throws is the general error.
  const failed = await asked(visitor, 'GET', '/fails')
  assert.deepEqual([failed.status, codeIn(failed.text)], [500, 'T0009'])
  // Its work is held to its time, and its body to its size: `callSize` where the route states none.
  assert.equal(codeIn((await asked(visitor, 'GET', '/slow')).text), 'T0008')
  assert.equal((await asked(visitor, 'POST', '/small', { body: 'x'.repeat(1000) })).text, '1000')
  assert.equal(codeIn((await asked(visitor, 'POST', '/small', { body: 'x'.repeat(1100) })).text), 'T0003')
  assert.equal((await asked(visitor, 'POST', '/large', { body: 'x'.repeat(2_500_000) })).text, '2500000')
  assert.equal(codeIn((await asked(visitor, 'POST', '/hooks/paid', { body: 'x'.repeat(1_100_000) })).text), 'T0003')
  // Full access, where the route states `system`: it reads the users, whom no visitor may read, and the change
  // that it calls writes the row.
  const kept = await asked(visitor, 'POST', '/notes', { body: 'a note of a route' })
  assert.deepEqual([kept.status, JSON.parse(kept.text)], [201, { users: 2 }])
  assert.deepEqual((await visitor.call('noteWords', {})).value, ['a note of a route'])
})

test('[21-12] a post to a route from a page of another site is T0004, unless the route names that site in origins', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  const from = (site: string) => ({ headers: { origin: site }, body: 'order 7' })
  // A route that names no site takes its own pages, and a program, which sends no `Origin`.
  assert.equal((await asked(visitor, 'POST', '/hooks/own', { body: 'x' })).text, 'taken')
  const other = await asked(visitor, 'POST', '/hooks/own', from('https://evil.example'))
  assert.deepEqual([other.status, codeIn(other.text)], [403, 'T0004'])
  // The one site that the route names is taken, and no other.
  assert.equal((await asked(visitor, 'POST', '/hooks/paid', from('https://pay.example'))).text, 'paid: order 7')
  assert.equal(codeIn((await asked(visitor, 'POST', '/hooks/paid', from('https://evil.example'))).text), 'T0004')
  assert.equal(codeIn((await asked(visitor, 'POST', '/hooks/paid', from('null'))).text), 'T0004')
  // A site that a route names is taken by that route alone.
  assert.equal(codeIn((await asked(visitor, 'POST', '/hooks/own', from('https://pay.example'))).text), 'T0004')
  // `origins: anyone('why')` takes every site.
  assert.equal((await asked(visitor, 'POST', '/hooks/any', from('https://evil.example'))).text, 'taken')
})

test('[22-18] a route that answers a stream writes it to its end, and sessions.start in a route sets the cookie', async (t) => {
  const app = await opened(t)
  const visitor = app.browser()
  const lines = (await asked(visitor, 'GET', '/counted')).text.trim().split('\n')
  assert.deepEqual([lines.length, lines[0], lines[19]], [20, 'line 0', 'line 19'])
  // A session that a route starts hands the browser its cookie, and the next request is that user's.
  const entered = await visitor.request('POST', '/enter', { body: 'maya@example.com' })
  assert.equal(await entered.text(), 'in')
  assert.equal(
    entered.headers.getSetCookie().some((line) => line.startsWith('tent_session.shop=')),
    true,
  )
  assert.equal((await asked(visitor, 'GET', '/staff/report')).text, 'the report of the staff')
})
