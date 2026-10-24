import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { callerIdOf, mcpApp } from './mcpApp.ts'
import { authorizeAt, chatApp, decided, decideFormOf, proof, returned, signedFor, tokenAsked } from './signedFor.ts'

/** The app of sign-in for programs, with one person in it. */
async function signedApp(t: Parameters<typeof mcpApp>[0], edits: Parameters<typeof mcpApp>[1] = []) {
  const app = await mcpApp(t, edits, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  return { app, ada }
}

/** Reads one address of the app as JSON. */
async function read(app: TestApp, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await app.request(new Request(`http://localhost${path}`))
  return { status: answer.status, body: answer.status === 200 ? Object(await answer.json()) : {} }
}

/** A request of `/mcp` with a token, as a chat app sends it: answers its status. */
async function mcpWith(app: TestApp, token: string): Promise<number> {
  return (await app.mcp({ as: { token } }).request('tools/list', {})).status
}

test('[25-6] [32-7@9b] the two describing documents hold each value of the table, and the 401 of /mcp points at the first', async (t) => {
  const { app } = await signedApp(t)
  for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const { status, body } = await read(app, path)
    assert.equal(status, 200, path)
    assert.deepEqual(body, {
      resource: 'http://localhost/mcp',
      authorization_servers: ['http://localhost'],
      scopes_supported: ['read', 'write', 'billing'],
      bearer_methods_supported: ['header'],
    })
  }
  const { body } = await read(app, '/.well-known/oauth-authorization-server')
  assert.deepEqual(body, {
    issuer: 'http://localhost',
    authorization_endpoint: 'http://localhost/_t/oauth/authorize',
    token_endpoint: 'http://localhost/_t/oauth/token',
    revocation_endpoint: 'http://localhost/_t/oauth/end',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    scopes_supported: ['read', 'write', 'billing'],
    authorization_response_iss_parameter_supported: true,
  })
  // Without `anyone(...)` among the clients, no client registers itself.
  assert.equal((await read(app, '/_t/oauth/register')).status, 404)
})

test('[25-6] [32-7@9b] a person who is not signed in is sent to signInPath and comes back, nothing is fetched before, and a key is nobody there', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const made = proof()
  const asking = authorizeAt({ client: chat.id, redirect: 'https://chat.example/callback', proof: made })
  const browser = app.browser()
  const away = await browser.request('GET', asking)
  assert.equal(away.status, 302)
  const to = new URL(String(away.headers.get('location')), 'http://localhost')
  assert.equal(to.pathname, '/sign-in')
  const back = String(to.searchParams.get('back'))
  assert.match(back, /^\/_t\/oauth\/authorize\?r=[^/]+$/)
  assert.equal(chat.remote.heard.length, 0, 'the document of a client is fetched once a person is signed in')
  const { key } = await app.key({ user: callerIdOf(ada), scopes: ['*'] })
  const keyed = await app.request(
    new Request(`http://localhost${asking}`, { headers: { authorization: `Bearer ${key}` } }),
  )
  assert.equal(keyed.status, 302, 'a key is nobody there')
  assert.equal(new URL(String(keyed.headers.get('location')), 'http://localhost').pathname, '/sign-in')
  await browser.call('signIn', { email: 'ada@example.com' })
  const page = await browser.request('GET', back)
  assert.equal(page.status, 200)
  assert.ok(decideFormOf(await page.text()).text, 'the page asks the person')
  assert.equal(chat.remote.heard.length, 1)
  // The text of the request opens a second time within its hour, as a sign-up that waits for a mail needs.
  assert.equal((await browser.request('GET', back)).status, 200)
  app.clock.advance('61 minutes')
  const late = await browser.request('GET', back)
  assert.equal(late.status, 400, 'a text past its hour is the error screen, and no return')
  assert.match(await late.text(), /T0002/)
})

test('[25-6] a request with no proof, a return address the document does not list, and a document that names another address are refused; one on this computer fits with another port', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const refused = async (path: string): Promise<void> => {
    const answer = await browser.request('GET', path)
    assert.equal(answer.status, 400, path)
    assert.equal(answer.headers.get('location'), null, 'nobody is sent anywhere')
    assert.match(await answer.text(), /T0002/)
  }
  await refused(authorizeAt({ client: chat.id, redirect: 'https://chat.example/callback' }))
  await refused(
    authorizeAt({ client: chat.id, redirect: 'https://chat.example/callback', proof: proof(), method: 'plain' }),
  )
  await refused(authorizeAt({ client: chat.id, redirect: 'https://chat.example/callbacks', proof: proof() }))
  await refused(authorizeAt({ client: chat.id, redirect: 'https://evil.example/callback', proof: proof() }))
  const here = await browser.request(
    'GET',
    authorizeAt({ client: chat.id, redirect: 'http://127.0.0.1:41234/callback', proof: proof() }),
  )
  assert.equal(here.status, 200, 'a program on this computer listens on a port it picks')
  const other = await chatApp(t, { own: () => 'https://another.example/client.json' })
  await refused(authorizeAt({ client: other.id, redirect: 'https://chat.example/callback', proof: proof() }))
})

test('[25-6] [05-13.11] the page names the client as text and the host of its document, holds no script, and may not be framed', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const page = await browser.request(
    'GET',
    authorizeAt({ client: chat.id, redirect: 'https://chat.example/callback', proof: proof(), scope: 'read write' }),
  )
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /Chat &lt;b&gt;app&lt;\/b&gt; wants to act for you in Shop/)
  assert.ok(html.includes(new URL(chat.id).host), 'the host of its document')
  assert.match(html, /Read and change your data/)
  assert.doesNotMatch(html, /<script/i)
  const policy = String(page.headers.get('content-security-policy'))
  assert.match(policy, /frame-ancestors 'none'/)
  assert.match(policy, /form-action 'self' https:\/\/chat\.example/)
})

test('[25-6] [05-13.7] [05-13.21] a code works once and not after a minute, its second use ends the grant, and a wrong proof is refused', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const made = proof()
  const redirect = 'https://chat.example/callback'
  const code = async (): Promise<string> => {
    const page = await browser.request('GET', authorizeAt({ client: chat.id, redirect, proof: made }))
    const { text } = decideFormOf(await page.text())
    const back = returned(await decided(browser, text))
    assert.equal(back.state, 'the state of the client')
    assert.equal(back.iss, 'http://localhost')
    return back.code
  }
  const change = (one: string, more: Record<string, string> = {}) =>
    tokenAsked(app, {
      grant_type: 'authorization_code',
      code: one,
      redirect_uri: redirect,
      client_id: chat.id,
      code_verifier: made.verifier,
      ...more,
    })
  const first = await code()
  assert.equal((await change(first, { code_verifier: proof().verifier })).status, 400, 'a wrong proof')
  const second = await code()
  const tokens = await change(second)
  assert.equal(tokens.status, 200, JSON.stringify(tokens.body))
  assert.equal(tokens.body.token_type, 'Bearer')
  assert.equal(tokens.body.expires_in, 3600)
  const access = String(tokens.body.access_token)
  assert.match(access, /^tent_[0-9a-z]+_[A-Za-z0-9_-]{43}$/)
  assert.equal(await mcpWith(app, access), 200)
  const again = await change(second)
  assert.equal(again.status, 400)
  assert.equal(again.body.error, 'invalid_grant')
  assert.equal(await mcpWith(app, access), 401, 'the second use of a code ends the grant of its first')
  const third = await code()
  assert.equal((await change(third, { redirect_uri: 'http://127.0.0.1/callback' })).status, 400)
  assert.equal((await change(third, { client_id: `${chat.id}?another` })).status, 400)
  const fourth = await code()
  app.clock.advance('61 seconds')
  assert.equal((await change(fourth)).status, 400, 'a code after its minute')
})

test('[25-6] [05-13.8] an access token ends after tokenTime, a renewal gives a new pair, and the old renewal token used again after two minutes ends the grant', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const redirect = 'https://chat.example/callback'
  const signed = await signedFor(app, ada, { client: chat.id, redirect })
  assert.equal(await mcpWith(app, signed.access), 200)
  app.clock.advance('61 minutes')
  assert.equal(await mcpWith(app, signed.access), 401, 'an access token ends after its hour')
  const renew = (refresh: string, client = chat.id) =>
    tokenAsked(app, { grant_type: 'refresh_token', refresh_token: refresh, client_id: client })
  const renewed = await renew(signed.refresh)
  assert.equal(renewed.status, 200, JSON.stringify(renewed.body))
  const access = String(renewed.body.access_token)
  assert.notEqual(renewed.body.refresh_token, signed.refresh)
  assert.equal(await mcpWith(app, access), 200)
  assert.equal((await renew(String(renewed.body.refresh_token), 'https://other.example/client.json')).status, 400)
  app.clock.advance('2 minutes')
  assert.equal((await renew(signed.refresh)).status, 400)
  assert.equal(await mcpWith(app, access), 401, 'the whole grant is ended')
  assert.deepEqual(await app.as(ada).call('myGrants', {}), [])
})

test('[25-6] [05-13.33] a renewal token used again within ten seconds is given a pair once and noted, and grants.list shows it', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const signed = await signedFor(app, ada, { client: chat.id, redirect: 'https://chat.example/callback' })
  const renew = () =>
    tokenAsked(app, { grant_type: 'refresh_token', refresh_token: signed.refresh, client_id: chat.id })
  const first = await renew()
  const second = await renew()
  assert.equal(first.status, 200)
  assert.equal(second.status, 200, 'a client whose answer was lost sends it twice')
  const [grant] = Object(await app.as(ada).call('myGrants', {}))
  assert.ok(grant.reusedAt, 'the row notes it')
  // The second pair took the place of the first: whoever holds the first ends the grant at its next renewal.
  assert.equal(await mcpWith(app, String(second.body.access_token)), 200)
  const third = await tokenAsked(app, {
    grant_type: 'refresh_token',
    refresh_token: String(first.body.refresh_token),
    client_id: chat.id,
  })
  assert.equal(third.status, 400)
  assert.equal(await mcpWith(app, String(second.body.access_token)), 401)
})

test('[25-6] grants.list shows a grant, grants.end ends it, and grants.list of another user without full access is T0013', async (t) => {
  const { app, ada } = await signedApp(t)
  const bob = await app.user({ email: 'bob@example.com' })
  const chat = await chatApp(t, { name: 'Chat' })
  const signed = await signedFor(app, ada, { client: chat.id, redirect: 'https://chat.example/callback' })
  const [grant] = Object(await app.as(ada).call('myGrants', {}))
  assert.deepEqual(Object.keys(grant).sort(), ['client', 'createdAt', 'for', 'id', 'name', 'scopes', 'usedAt'])
  assert.deepEqual([grant.client, grant.name, grant.for, grant.scopes], [chat.id, 'Chat', 'mcp', ['read']])
  await assert.rejects(app.as(bob).call('grantsOf', { user: callerIdOf(ada) }), { code: 'T0013' })
  assert.equal((Object(await app.as('nobody').call('everyGrantOf', { user: callerIdOf(ada) })) as unknown[]).length, 1)
  // Another person's grant is no grant of theirs to end.
  await app.as(bob).call('endGrant', { id: String(grant.id) })
  assert.equal(await mcpWith(app, signed.access), 200)
  await app.as(ada).call('endGrant', { id: String(grant.id) })
  assert.equal(await mcpWith(app, signed.access), 401)
  // Signing out ends no grant.
  const other = await signedFor(app, ada, { client: chat.id, redirect: 'https://chat.example/callback' })
  await other.browser.call('signOut', {})
  assert.equal(await mcpWith(app, other.access), 200)
})

test('[25-6] [05-13.18] a second sign-in of the same client asks nothing when it is sent back to an https address, and asks again when it is sent back to this computer', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  for (const redirect of ['https://chat.example/callback', 'http://127.0.0.1:5000/callback']) {
    const asking = () => browser.request('GET', authorizeAt({ client: chat.id, redirect, proof: proof() }))
    // The first sign-in is asked about, allowed, and its code changed for tokens: the grant is made.
    await signedFor(app, ada, { client: chat.id, redirect })
    const second = await asking()
    if (redirect.startsWith('https:')) {
      assert.equal(second.status, 303, 'the same grant is not asked about again')
      assert.ok(returned(second).code)
    } else assert.equal(second.status, 200, 'a program on this computer cannot be told from another')
  }
})

test('[25-6] [05-13.20] [05-13.28] the text of the page does nothing for another person or a second time, a GET of decide is 405, and a refusal returns no code', async (t) => {
  const { app, ada } = await signedApp(t)
  const bob = await app.user({ email: 'bob@example.com' })
  const chat = await chatApp(t)
  const asAda = app.browser({ as: ada })
  const page = await asAda.request(
    'GET',
    authorizeAt({ client: chat.id, redirect: 'https://chat.example/callback', proof: proof() }),
  )
  const { text } = decideFormOf(await page.text())
  const looked = await asAda.request('GET', `/_t/oauth/decide?t=${encodeURIComponent(text)}&answer=allow`)
  assert.equal(looked.status, 405)
  const byBob = await decided(app.browser({ as: bob }), text)
  assert.equal(returned(byBob).code, '', 'another person gains nothing')
  const refusal = returned(await decided(asAda, text, 'refuse'))
  assert.deepEqual([refusal.code, refusal.error], ['', 'access_denied'])
  const twice = await decided(asAda, text)
  assert.equal(returned(twice).code, '', 'the text works once')
  app.clock.advance('11 minutes')
  assert.deepEqual(await app.as(ada).call('myGrants', {}), [])
})

test('[25-6] [05-13.29] [05-13.30] with anyone(...) among the clients a client registers itself and signs in, nothing is written for it, a changed id is refused, and the 11th of a minute is T0005', async (t) => {
  const { app, ada } = await signedApp(t, [
    {
      from: "for: 'app',\n      },\n    ],",
      to: "for: 'app',\n      },\n      anyone('programs register themselves'),\n    ],",
    },
    { from: "import { project } from 'tentjs'", to: "import { anyone, project } from 'tentjs'" },
  ])
  const { body: described } = await read(app, '/.well-known/oauth-authorization-server')
  assert.equal(described.registration_endpoint, 'http://localhost/_t/oauth/register')
  const register = (from = '203.0.113.9') =>
    app.request(
      new Request('http://localhost/_t/oauth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: 'Famous Chat', redirect_uris: ['https://famous.example/back'] }),
      }),
      { from },
    )
  const rows = async () => (await app.rows('users')).length
  const before = await rows()
  const made = await register()
  assert.equal(made.status, 201)
  const client = Object(await made.json())
  assert.equal(client.client_name, 'Famous Chat')
  const id = String(client.client_id)
  assert.equal(await rows(), before)
  const browser = app.browser({ as: ada })
  const page = await browser.request(
    'GET',
    authorizeAt({ client: id, redirect: 'https://famous.example/back', proof: proof() }),
  )
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /famous\.example/)
  assert.match(html, /This program named itself\./)
  const changed = `${id.slice(0, -1)}${id.endsWith('a') ? 'b' : 'a'}`
  const refused = await browser.request(
    'GET',
    authorizeAt({ client: changed, redirect: 'https://famous.example/back', proof: proof() }),
  )
  assert.equal(refused.status, 400)
  const signed = await signedFor(app, ada, { client: id, redirect: 'https://famous.example/back' })
  assert.equal(await mcpWith(app, signed.access), 200)
  for (let n = 2; n <= 10; n++) assert.equal((await register('198.51.100.7')).status, 201)
  assert.equal((await register('198.51.100.7')).status, 201)
  const eleventh = await register('198.51.100.7')
  assert.equal(eleventh.status, 429)
  assert.equal(Object(await eleventh.json()).error?.code, 'T0005')
})

test("[25-6] a client that the builder states with `for: 'app'` is given a token for the app, and a client of a document that asks for the app is given /mcp", async (t) => {
  const { app, ada } = await signedApp(t)
  const signed = await signedFor(app, ada, {
    client: 'reports-app',
    redirect: 'https://reports.example/back',
    resource: 'http://localhost',
    scope: 'read write',
  })
  const called = await app.request(
    new Request('http://localhost/_t/call/addOrder', {
      method: 'POST',
      headers: { authorization: `Bearer ${signed.access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { title: 'by the reports app' } }),
    }),
  )
  assert.equal(called.status, 200, await called.clone().text())
  assert.equal(await mcpWith(app, signed.access), 401, 'a token for the app is nobody at /mcp')
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  const page = await browser.request(
    'GET',
    authorizeAt({
      client: chat.id,
      redirect: 'https://chat.example/callback',
      proof: proof(),
      resource: 'http://localhost',
    }),
  )
  assert.doesNotMatch(await page.clone().text(), /This program will act as you in the whole app/)
  const chatSigned = await signedFor(app, ada, {
    client: chat.id,
    redirect: 'https://chat.example/callback',
    resource: 'http://localhost',
  })
  assert.equal(await mcpWith(app, chatSigned.access), 200, 'it was given /mcp')
  const another = await browser.request(
    'GET',
    authorizeAt({
      client: chat.id,
      redirect: 'https://chat.example/callback',
      proof: proof(),
      resource: 'https://other.example/mcp',
    }),
  )
  assert.equal(another.status, 400, 'an address of another site is refused')
})
