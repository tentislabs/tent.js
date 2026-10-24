import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { TestBrowser } from '../index.ts'
import { callerIdOf, mcpApp } from './mcpApp.ts'
import { served } from './served.ts'
import {
  authorizeAt,
  chatApp,
  decided,
  decideFormOf,
  proof,
  returned,
  sessionBrowser,
  signedFor,
  signedWith,
  tokenAsked,
} from './signedFor.ts'

const redirect = 'https://chat.example/callback'

/** The app of sign-in for programs, with one person in it. */
async function signedApp(t: Parameters<typeof mcpApp>[0], edits: Parameters<typeof mcpApp>[1] = []) {
  const app = await mcpApp(t, edits, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  return { app, ada }
}

/** Asks for a page of sign-in in a browser, and holds that it is the `error` screen, which sends nobody anywhere. */
async function refusedAt(browser: Pick<TestBrowser, 'request'>, path: string, what: string): Promise<string> {
  const answer = await browser.request('GET', path)
  assert.equal(answer.headers.get('location'), null, `${what}: nobody is sent anywhere`)
  assert.notEqual(answer.status, 200, `${what}: the person is not asked`)
  assert.notEqual(answer.status, 303, what)
  return answer.text()
}

test('[05-13.5] a client document inside this computer network is T0022, one of 10 MB is cut at 64 kB, and a thousand made-up names of a stranger fetch nothing', async (t) => {
  const { app, ada } = await signedApp(t)
  const browser = app.browser({ as: ada })
  // A document that holds a fair client, followed by 10 MB of spaces: read whole it would be taken.
  const big = await chatApp(t, {
    body: (id) =>
      `${JSON.stringify({ client_id: id, client_name: 'Big', redirect_uris: [redirect] })}${' '.repeat(10 * 1024 * 1024)}`,
  })
  await refusedAt(browser, authorizeAt({ client: big.id, redirect, proof: proof() }), 'a document of 10 MB')
  const chat = await chatApp(t)
  const stranger = app.browser()
  for (let n = 0; n < 1000; n++) {
    const away = await stranger.request(
      'GET',
      authorizeAt({ client: `${chat.remote.origin}/made-up-${n}.json`, redirect, proof: proof() }),
    )
    assert.equal(away.status, 302, 'a stranger is sent to sign in')
  }
  assert.equal(chat.remote.heard.length, 0, 'nothing is fetched before a person is signed in')
  const inside = await refusedAt(
    browser,
    authorizeAt({ client: 'https://10.1.2.3/client.json', redirect, proof: proof() }),
    'a document inside the network',
  )
  assert.match(inside, /T0022/)
})

test('[05-13.9] a page of another site that posts a yes to /_t/oauth/decide in the visitor name is T0004, and without the engine text nothing is granted', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const page = await browser.request('GET', authorizeAt({ client: chat.id, redirect, proof: proof() }))
  const { text } = decideFormOf(await page.text())
  assert.ok(text)
  const forged = await browser.request('POST', '/_t/oauth/decide', {
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' },
    body: new URLSearchParams({ t: text, answer: 'allow' }).toString(),
  })
  assert.equal(forged.status, 403)
  assert.match(await forged.text(), /T0004/)
  assert.equal(returned(forged).code, '')
  const bare = await browser.request('POST', '/_t/oauth/decide', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ answer: 'allow' }).toString(),
  })
  assert.equal(returned(bare).code, '', 'without the text nothing is granted')
  assert.equal(bare.headers.get('location'), null)
  // The text is still good for the person's own press: the forged one spent nothing.
  assert.ok(returned(await decided(browser, text)).code)
})

test('[05-13.10] the page that asks for a yes may be shown in a frame by no site', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const page = await app.browser({ as: ada }).request('GET', authorizeAt({ client: chat.id, redirect, proof: proof() }))
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.match(String(page.headers.get('content-security-policy')), /frame-ancestors 'none'/)
})

test('[05-13.16] a key and a token sent to /_t/oauth/authorize and to /_t/oauth/decide in a person name are nobody', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const { key } = await app.key({ user: callerIdOf(ada), scopes: ['*'] })
  const { access } = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read write' })
  const asking = authorizeAt({ client: chat.id, redirect, proof: proof(), scope: 'read write' })
  for (const [what, one] of [
    ['a key', key],
    ['a token', access],
  ]) {
    const asked = await app.request(
      new Request(`http://localhost${asking}`, { headers: { authorization: `Bearer ${one}` } }),
    )
    assert.equal(asked.status, 302, `${what} is sent to sign in`)
    assert.equal(new URL(String(asked.headers.get('location')), 'http://localhost').pathname, '/sign-in', what)
  }
  const page = await app.browser({ as: ada }).request('GET', asking)
  const { text } = decideFormOf(await page.text())
  for (const [what, one] of [
    ['a key', key],
    ['a token', access],
  ]) {
    const posted = await app.request(
      new Request('http://localhost/_t/oauth/decide', {
        method: 'POST',
        headers: { authorization: `Bearer ${one}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ t: text, answer: 'allow' }).toString(),
      }),
    )
    assert.equal(returned(posted).code, '', `${what} grants nothing`)
    assert.equal(posted.headers.get('location'), null, what)
  }
})

test('[05-13.19] a return address that is a script or a scheme of a program, and one of this computer over another path, are refused, also where the document lists them', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t, {
    redirects: [redirect, 'http://127.0.0.1/callback', 'javascript:alert(1)', 'chat-app:/done'],
  })
  const browser = app.browser({ as: ada })
  for (const back of [
    'javascript:alert(1)',
    'chat-app:/done',
    'http://127.0.0.1:41234/other',
    'http://localhost:41234/callback',
  ])
    await refusedAt(browser, authorizeAt({ client: chat.id, redirect: back, proof: proof() }), back)
})

test('[05-13.31] a made-up client document named by a signed-in person a thousand times is T0005 from the 11th of a minute', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const codes: string[] = []
  for (let n = 0; n < 12; n++) {
    const html = await refusedAt(
      browser,
      authorizeAt({ client: `${chat.remote.origin}/made-up-${n}.json`, redirect, proof: proof() }),
      `made-up ${n}`,
    )
    codes.push(/T0005/.test(html) ? 'T0005' : 'other')
  }
  assert.deepEqual(codes.slice(0, 10), Array(10).fill('other'))
  assert.deepEqual(codes.slice(10), ['T0005', 'T0005'])
})

test('[05-13.32] a renewal token sent as the token of a request is nobody, an access token at the token address is refused, and a renewal under another client name is refused', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const other = await chatApp(t, { name: 'Other' })
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read' })
  assert.equal((await app.mcp({ as: { token: signed.refresh } }).request('tools/list', {})).status, 401)
  const asAccess = await tokenAsked(app, {
    grant_type: 'refresh_token',
    refresh_token: signed.access,
    client_id: chat.id,
  })
  assert.equal(asAccess.status, 400)
  assert.equal(asAccess.body.access_token, undefined)
  const asOther = await tokenAsked(app, {
    grant_type: 'refresh_token',
    refresh_token: signed.refresh,
    client_id: other.id,
  })
  assert.equal(asOther.status, 400)
  assert.equal(asOther.body.access_token, undefined)
  // Neither refusal ended the grant: its client still renews it.
  const own = await tokenAsked(app, { grant_type: 'refresh_token', refresh_token: signed.refresh, client_id: chat.id })
  assert.equal(own.status, 200)
})

test('[05-13.37] the text r changed by one letter, used after its hour, and used by another signed-in person is the error screen with T0002, and no return', async (t) => {
  const { app } = await signedApp(t)
  const bob = await app.user({ email: 'bob@example.com' })
  const chat = await chatApp(t)
  const away = await app.browser().request('GET', authorizeAt({ client: chat.id, redirect, proof: proof() }))
  const back = String(new URL(String(away.headers.get('location')), 'http://localhost').searchParams.get('back'))
  const sealed = String(new URL(back, 'http://localhost').searchParams.get('r'))
  const ada = app.browser()
  await ada.call('signIn', { email: 'ada@example.com' })
  assert.equal((await ada.request('GET', back)).status, 200, 'the person who signed in is asked')
  const changed = `${sealed.slice(0, 10)}${sealed[10] === 'A' ? 'B' : 'A'}${sealed.slice(11)}`
  assert.match(await refusedAt(ada, `/_t/oauth/authorize?r=${changed}`, 'one letter changed'), /T0002/)
  assert.match(await refusedAt(app.browser({ as: bob }), back, 'another signed-in person'), /T0002/)
  app.clock.advance('61 minutes')
  assert.match(await refusedAt(ada, back, 'after its hour'), /T0002/)
})

test('[05-13.42] a stated client `for: app` sent back to an address it does not list is refused', async (t) => {
  const { app, ada } = await signedApp(t)
  const browser = app.browser({ as: ada })
  for (const back of ['https://reports.example/other', 'https://evil.example/back', 'reports:/elsewhere'])
    await refusedAt(
      browser,
      authorizeAt({ client: 'reports-app', redirect: back, proof: proof(), resource: 'http://localhost' }),
      back,
    )
})

test('[25-6] a client the builder states with a return of a program own kind is asked every time, as a client for the app is', async (t) => {
  const { app, ada } = await signedApp(t, [
    {
      from: "for: 'app',\n      },",
      to: "for: 'app',\n      },\n      { id: 'desk-app', name: 'Desk', redirects: ['desk:/done'] },",
    },
  ])
  const browser = app.browser({ as: ada })
  await signedFor(app, ada, { client: 'desk-app', redirect: 'desk:/done', scope: 'read' })
  const again = await browser.request(
    'GET',
    authorizeAt({ client: 'desk-app', redirect: 'desk:/done', proof: proof(), scope: 'read' }),
  )
  assert.equal(again.status, 200, 'the person is asked again, and not sent back with a code')
  assert.ok(decideFormOf(await again.text()).text)
})

test("[05-13.15] [20-7@9b] a person's removal removes the rows of their grants, and not only the person they name", async (t) => {
  const at = await served('mcpSigned')
  const made = await at.app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: 'system' })
  const ada = String(Object(Array.isArray(made) ? made[0] : made).id)
  const chat = await chatApp(t, { name: 'Chat' })
  const via = {
    request: (request: Request, o?: { from?: string }) =>
      at.app.request(new Request(request.url.replace('http://localhost', at.address), request), o),
  }
  await signedWith(via, sessionBrowser(at.app, ada, at.address), { client: chat.id, redirect, scope: 'read' })
  const grants = (): number => {
    const data = new DatabaseSync(join(at.dataFolder, 'data.db'), { readOnly: true })
    const rows = data.prepare('SELECT id FROM _t_oauth').all()
    data.close()
    return rows.length
  }
  assert.equal(grants(), 1)
  const { token } = JSON.parse(readFileSync(join(at.dataFolder, 'engine.json'), 'utf8'))
  const removed = await at.app.request(
    new Request(`${at.address}/_t/admin/data`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ args: { what: 'user', do: 'remove', id: ada, yes: true } }),
    }),
  )
  assert.equal(removed.status, 200)
  assert.equal(grants(), 0, 'the rows of the grants of a removed person are gone')
})
