import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import {
  APP_FOLDER,
  buildApp,
  ensurePackages,
  type RunningApp,
  rowsOf,
  startApp,
  tempFolder,
  tent,
  textOf,
} from '../samples/app-1/walk/app.ts'

const STAFF_EMAIL = 'sam@shop.example'
// The password that the seed gives every person, on data of development and of test.
const PASSWORD = 'a long secret'

// The screens of the thin line, each with the address it is asked at.
const SCREENS = ['/orders', '/orders/new', '/orders/:id', '/customers', '/customers/new']

/** The rows of the first table of a document: each row of its body, from its tag on. */
const itemsOf = (html: string): string[] =>
  (html.split('<tbody')[1]?.split('</tbody>')[0] ?? '').split(/<tr[ >]/).slice(1)

test('[04-1.1] [04-1.4] in every run: sample app 1 checks with no finding, staff who sign in through its own sign-in screen are let into /orders, whose first HTML holds the eight open orders with Ada Lovelace and $19.99 first, an open order holds Mark paid, and every screen of the thin line draws', async () => {
  await ensurePackages()
  // A check that finds an error answers not ok, and `tent` throws with what it found: T3009 of `markPaid` among it.
  const checked = await tent(APP_FOLDER, ['check'])
  assert.equal(Reflect.get(Object(Reflect.get(Object(checked), 'definitions')), 'markPaid'), 'plain')
  const temp = await tempFolder()
  let app: RunningApp | undefined
  try {
    const running = await startApp(
      APP_FOLDER,
      await buildApp(APP_FOLDER, join(temp.path, 'bundle')),
      join(temp.path, 'data'),
    )
    app = running
    // A visitor of /orders is sent to the sign-in screen, whose form sends the call that signs a person in.
    const visitor = await fetch(`${running.address}/orders`, { redirect: 'manual' })
    assert.equal(visitor.status, 302)
    const signInAt = new URL(visitor.headers.get('location') ?? '', running.address)
    assert.equal(signInAt.pathname, '/sign-in')
    assert.match(await (await fetch(signInAt)).text(), /<form[ >][\s\S]*name="password"/)
    const signed = await fetch(`${running.address}/_t/call/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: running.address },
      body: JSON.stringify({ input: { email: STAFF_EMAIL, password: PASSWORD } }),
    })
    assert.deepEqual(await signed.json(), { ok: true, value: { staff: true }, caller: 'changed' })
    const cookie = (signed.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const open = (await rowsOf(running, 'orders')).find((row) => Object(row).status === 'open')
    const pages = new Map<string, string>()
    for (const path of SCREENS) {
      const asked = path.replace(':id', textOf(open, 'id'))
      const answer = await fetch(running.address + asked, { headers: { cookie }, redirect: 'manual' })
      assert.equal(answer.status, 200, asked)
      const html = await answer.text()
      assert.match(html, /<div id="tent">[\s\S]*<main[ >][\s\S]*<h1[ >]/, `${asked} is drawn`)
      pages.set(path, html)
    }
    const rows = itemsOf(pages.get('/orders') ?? '')
    assert.equal(rows.length, 8)
    assert.match(rows[0] ?? '', />Ada Lovelace</)
    assert.match(rows[0] ?? '', />\$19\.99</)
    assert.match(pages.get('/orders/:id') ?? '', /<button type="submit"[^>]*>(<svg[\s\S]*?<\/svg>)?Mark paid<\/button>/)
  } finally {
    await app?.stop()
    await temp.remove()
  }
})
