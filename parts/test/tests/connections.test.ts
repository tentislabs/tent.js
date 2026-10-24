import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import type { Heard, Remote } from './remotes.ts'
import { answerJson, callCodeOf, remoteOf, untilWithin } from './remotes.ts'
import { bytesUnder } from './storms.ts'

/** What the stand-in provider does, which a test sets, and what it was asked. */
interface Provider {
  remote: Remote
  issued: number
  refreshes: number
  revoked: Record<string, string>[]
  formAnswer?: boolean
  refuseRefresh?: boolean
  expiresIn?: number
  // The access tokens that are answered 401 the next time they are sent.
  unauthorized: Set<string>
}

/** The fields of a body of a form. */
const formOf = (heard: Heard): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(heard.body.toString('utf8')))

/** Starts the stand-in provider: its authorization, its tokens, its taking back, and the calls of its API. */
async function providerOf(t: TestContext): Promise<Provider> {
  const provider: Provider = {
    issued: 0,
    refreshes: 0,
    revoked: [],
    unauthorized: new Set(),
    remote: { origin: '', heard: [] },
  }
  provider.remote = await remoteOf(t, (heard, response) => {
    const path = heard.path.split('?')[0]
    if (path === '/token') {
      const form = formOf(heard)
      const answer = (): void => {
        const n = ++provider.issued
        const tokens = {
          access_token: `access-${n}`,
          refresh_token: `refresh-${n}`,
          token_type: 'bearer',
          expires_in: provider.expiresIn ?? 3600,
          scope: 'repo',
        }
        if (provider.formAnswer) {
          response.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' })
          response.end(new URLSearchParams(Object.entries(tokens).map(([k, v]) => [k, String(v)])).toString())
        } else answerJson(response, 200, tokens)
      }
      if (form.grant_type === 'refresh_token') {
        provider.refreshes++
        if (provider.refuseRefresh) return answerJson(response, 400, { error: 'invalid_grant' })
        // A renewal takes a moment, so that two calls that need one meet.
        setTimeout(answer, 100)
        return
      }
      return answer()
    }
    if (path === '/revoke') {
      provider.revoked.push(formOf(heard))
      return answerJson(response, 200, {})
    }
    const token = String(heard.headers.authorization ?? '').replace(/^Bearer /, '')
    if (provider.unauthorized.delete(token)) return answerJson(response, 401, { message: 'Bad credentials' })
    answerJson(response, 200, { by: token })
  })
  return provider
}

/** The project of the connections, with every address of its services at the stand-in provider, as a test app. */
async function connected(t: TestContext, provider: Provider): Promise<TestApp> {
  const folder = copyOf(t, 'connected')
  const file = join(folder, 'services.ts')
  writeFileSync(file, readFileSync(file, 'utf8').split('http://127.0.0.1:1').join(provider.remote.origin))
  // The services of the tests answer at the stand-in provider, which they reach for real.
  const app = await testApp({ folder, real: ['github', 'githubUploads'] })
  closing(t, () => app.close())
  return app
}

/** A user of the app, and a browser that a pass made that user. */
async function userWith(app: TestApp, name: string): Promise<{ user: Caller; browser: TestBrowser; id: string }> {
  const user = await app.user({ name, roles: [] })
  return { user, browser: app.browser({ as: user }), id: String(user.user?.id) }
}

/** Starts a connect in a browser, and answers the address it is sent to and the state it carries. */
async function started(browser: TestBrowser, o: { back?: string; account?: string } = {}) {
  const answer = await browser.call('startConnect', o)
  assert.equal(answer.ok, true, JSON.stringify(answer))
  const address = new URL(String(answer.value))
  return { address, state: String(address.searchParams.get('state')) }
}

/** Comes back from the provider in a browser, and answers where the browser is sent. */
async function back(browser: TestBrowser, query: string): Promise<string> {
  const answer = await browser.request('GET', `/_t/connect/github?${query}`)
  assert.equal(answer.status, 302)
  return String(answer.headers.get('location'))
}

/** Connects a user's account: the start, the agreement at the provider, and the return. */
async function connect(browser: TestBrowser, code: string, account?: string): Promise<void> {
  const { state } = await started(browser, { back: '/done', ...(account ? { account } : {}) })
  assert.equal(await back(browser, `code=${code}&state=${state}`), '/done')
}

test('[24-6] `connections.start` answers the address of the provider with a state and the proof, and the return writes a connection whose tokens cannot be read in the data', async (t) => {
  const temp = tempOf(t)
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const { address, state } = await started(maya.browser, { back: '/done' })
  assert.equal(`${address.origin}${address.pathname}`, `${provider.remote.origin}/authorize`)
  const asked = Object.fromEntries(address.searchParams)
  assert.equal(asked.response_type, 'code')
  assert.equal(asked.client_id, 'test-GITHUB_ID')
  assert.equal(asked.redirect_uri, 'http://localhost/_t/connect/github')
  assert.equal(asked.scope, 'repo user')
  assert.equal(asked.prompt, 'consent')
  assert.equal(asked.code_challenge_method, 'S256')
  assert.ok(state.length > 20)
  assert.equal(await back(maya.browser, `code=the-code&state=${state}`), '/done')
  const [token] = provider.remote.heard.filter((one) => one.path === '/token').map(formOf)
  assert.equal(token.grant_type, 'authorization_code')
  assert.equal(token.code, 'the-code')
  assert.equal(token.redirect_uri, 'http://localhost/_t/connect/github')
  assert.equal(token.client_secret, 'test-GITHUB_SECRET')
  assert.equal(createHash('sha256').update(token.code_verifier).digest('base64url'), asked.code_challenge)
  assert.deepEqual(await maya.browser.read('mine'), {
    ok: true,
    value: [{ service: 'github', account: '', scopes: ['repo'] }],
  })
  // The tokens are kept encrypted: no file of the data holds them as they are.
  for (const words of ['access-1', 'refresh-1'])
    assert.equal(
      bytesUnder(temp).filter((one) => one.bytes.includes(Buffer.from(words))).length,
      0,
      `a file holds ${words}`,
    )
})

test('[24-6] a state that is older than its time, changed by one character, or brought back by another user writes nothing and answers connect=failed, to `/` where it did not open; a no at the provider answers connect=refused', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  const first = await started(maya.browser, { back: '/done' })
  app.clock.advance('11 minutes')
  assert.equal(await back(maya.browser, `code=c&state=${first.state}`), '/done?connect=failed')
  const second = await started(maya.browser, { back: '/done' })
  const changed = `${second.state.slice(0, -1)}${second.state.endsWith('A') ? 'B' : 'A'}`
  assert.equal(await back(maya.browser, `code=c&state=${changed}`), '/?connect=failed')
  assert.equal(await back(deniz.browser, `code=c&state=${second.state}`), '/?connect=failed')
  assert.equal(await back(maya.browser, `error=access_denied&state=${second.state}`), '/done?connect=refused')
  assert.equal(provider.remote.heard.filter((one) => one.path === '/token').length, 0)
  assert.deepEqual((await maya.browser.read('mine')).value, [])
  assert.deepEqual((await deniz.browser.read('mine')).value, [])
})

test('[24-6] [24-1b] a token answer written as a form is read, a call uses the connection of its caller as its bearer line, and a caller with none is T7117 with the service in `fields`', async (t) => {
  const provider = await providerOf(t)
  provider.formAnswer = true
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  await connect(maya.browser, 'maya')
  assert.deepEqual(await app.as(maya.user).call('issues', {}), { by: 'access-1' })
  const error = await app
    .as(deniz.user)
    .call('issues', {})
    .then(
      () => undefined,
      (failed) => failed,
    )
  assert.equal(error?.code, 'T7117')
  assert.deepEqual(error?.fields, { service: 'github' })
})

test('[24-6] `for` without full access is T0013, and from a step of a run of the system it names the user whose account is used', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  await connect(maya.browser, 'maya')
  assert.equal(await callCodeOf(app.as(deniz.user).call('issuesFor', { user: maya.id })), 'T0013')
  assert.deepEqual(await app.as('system').call('nightly', { user: maya.id }), { by: 'access-1' })
})

test('[24-6] an answer of 401 causes one renewal and one more try, and a renewal that the provider refuses removes the connection, and the call is T7117', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  await connect(maya.browser, 'maya')
  provider.unauthorized.add('access-1')
  assert.deepEqual(await app.as(maya.user).call('issues', {}), { by: 'access-2' })
  assert.equal(provider.refreshes, 1)
  assert.equal(formOf(provider.remote.heard.filter((one) => one.path === '/token')[1]).refresh_token, 'refresh-1')
  provider.unauthorized.add('access-2')
  provider.refuseRefresh = true
  assert.equal(await callCodeOf(app.as(maya.user).call('issues', {})), 'T7117')
  assert.deepEqual((await maya.browser.read('mine')).value, [])
})

test("[24-6] two accounts of one user are kept apart and a call names one; a service that states `connection` uses the other one's; `connections.end` posts the tokens to `revokeUrl`", async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  await connect(maya.browser, 'home')
  await connect(maya.browser, 'work', 'work')
  assert.deepEqual(await app.as(maya.user).call('issues', {}), { by: 'access-1' })
  assert.deepEqual(await app.as(maya.user).call('issues', { account: 'work' }), { by: 'access-2' })
  assert.deepEqual(await app.as(maya.user).call('upload', {}), { by: 'access-1' })
  assert.deepEqual(
    ((await maya.browser.read('mine')).value as { account: string }[]).map((one) => one.account).sort(),
    ['', 'work'],
  )
  await app.as(maya.user).call('endConnect', {})
  assert.deepEqual(
    provider.revoked.map((one) => one.token),
    ['refresh-1', 'access-1'],
  )
  assert.equal(provider.revoked[0].client_id, 'test-GITHUB_ID')
  assert.deepEqual(
    ((await maya.browser.read('mine')).value as { account: string }[]).map((one) => one.account),
    ['work'],
  )
})

test('[24-6] a row of a connection copied to another user opens nothing', async (t) => {
  const temp = tempOf(t)
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  await connect(maya.browser, 'maya')
  const home = String(readdirSync(temp).find((name) => name.startsWith('tent-test-')))
  const data = new DatabaseSync(join(temp, home, 'data', 'data.db'))
  try {
    const row = data.prepare('SELECT * FROM "_t_connections" WHERE "user" = ?').get(maya.id)
    assert.ok(row)
    data
      .prepare(
        'INSERT INTO "_t_connections" ("service", "user", "account", "tokens", "scopes", "expiresAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(row.service, deniz.id, row.account, row.tokens, row.scopes, row.expiresAt, row.createdAt, row.updatedAt)
  } finally {
    data.close()
  }
  assert.equal(await callCodeOf(app.as(deniz.user).call('issues', {})), 'T7117')
})

test('[24-6] `connections.list` is live in a query: a watch of it is sent the connection once it is made', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  // A live connection of maya, opened as a page of hers opens it, with the cookie of a session the test made.
  const cookie = app.session(maya.user)
  const end = app.live(
    new Request(`http://localhost/_t/live?as=${maya.id}`, { headers: { origin: 'http://localhost', cookie } }),
  )
  closing(t, () => end.close())
  const got: Record<string, unknown>[] = []
  end.each((message) => {
    if (message.t === 'alive') end.send({ t: 'alive' })
    else got.push(Object(message))
  })
  end.send({ t: 'watch', id: 'mine', query: 'mine', input: {} })
  await untilWithin('the watch is answered', () => got.length > 0)
  assert.deepEqual(got[0].value, [])
  await connect(maya.browser, 'maya')
  await untilWithin('the watch is told of the connection', () => got.length > 1)
  assert.equal(got[1].t, 'result')
  assert.deepEqual(got[1].value, [{ service: 'github', account: '', scopes: ['repo'] }])
})

test('[24-6] `app.connection` writes a connection of a user as a connect would, which a call then uses', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  await app.connection(maya.id, 'github')
  const answer = await app.as(maya.user).call('issues', {})
  assert.match(String(Reflect.get(Object(answer), 'by')), /^test-/)
  assert.deepEqual((await maya.browser.read('mine')).value, [
    { service: 'github', account: '', scopes: ['repo', 'user'] },
  ])
})

test('[24-21] two renewals at once for one connected account leave one valid token', async (t) => {
  const provider = await providerOf(t)
  provider.expiresIn = 30
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  await connect(maya.browser, 'maya')
  provider.expiresIn = 3600
  // The token ends within a minute: each call needs a renewal, and the two meet.
  const [first, second] = await Promise.all([
    app.as(maya.user).call('issues', {}),
    app.as(maya.user).call('issues', {}),
  ])
  assert.equal(provider.refreshes, 1)
  assert.deepEqual([first, second], [{ by: 'access-2' }, { by: 'access-2' }])
  assert.deepEqual(await app.as(maya.user).call('issues', {}), { by: 'access-2' })
})
