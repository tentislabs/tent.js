import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp, TestBrowser } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import type { Heard, Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'
import { bytesUnder } from './storms.ts'

/** The stand-in provider: what it was asked, and what a test sets it to answer. */
interface Provider {
  remote: Remote
  issued: number
  refreshes: number
  usedCodes: Set<string>
  // The access tokens that are answered 401 the next time they are sent.
  unauthorized: Set<string>
  hugeTokens?: boolean
}

const formOf = (heard: Heard): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(heard.body.toString('utf8')))

async function providerOf(t: TestContext): Promise<Provider> {
  const provider: Provider = {
    issued: 0,
    refreshes: 0,
    usedCodes: new Set(),
    unauthorized: new Set(),
    remote: { origin: '', heard: [] },
  }
  provider.remote = await remoteOf(t, (heard, response) => {
    const path = heard.path.split('?')[0]
    if (path === '/token') {
      const form = formOf(heard)
      if (provider.hugeTokens) {
        response.writeHead(200, { 'content-type': 'application/json' })
        const piece = Buffer.alloc(1_048_576, 32)
        let n = 0
        const more = (): void => {
          while (n < 1024) {
            n++
            if (!response.write(piece)) return void response.once('drain', more)
          }
          response.end()
        }
        response.on('close', () => (n = 1024))
        return more()
      }
      const answer = (): void => {
        const n = ++provider.issued
        answerJson(response, 200, {
          access_token: `access-${n}`,
          refresh_token: `refresh-${n}`,
          expires_in: 3600,
          scope: 'repo',
        })
      }
      if (form.grant_type === 'refresh_token') {
        provider.refreshes++
        setTimeout(answer, 100)
        return
      }
      // A code is good once, as at every provider.
      if (provider.usedCodes.has(form.code)) return answerJson(response, 400, { error: 'invalid_grant' })
      provider.usedCodes.add(form.code)
      return answer()
    }
    const token = String(heard.headers.authorization ?? '').replace(/^Bearer /, '')
    if (provider.unauthorized.delete(token)) return answerJson(response, 401, { message: 'Bad credentials' })
    answerJson(response, 200, { by: token })
  })
  return provider
}

// Functions of the attacks, beside those of the project: another user's connections named in code with no full access.
const more = `
export const listFor = action('listFor', {
  access: 'signedIn',
  input: { user: text() },
  output: json(),
  run: async ({ input }) => connections.list(input.user),
})

export const endFor = action('endFor', {
  access: 'signedIn',
  input: { user: text() },
  run: async ({ input }) => connections.end(github, { user: input.user }),
})

export const issuesOfAccount = action('issuesOfAccount', {
  access: 'signedIn',
  input: { account: text(), user: text({ optional: true }) },
  output: json(),
  run: async ({ input }) =>
    github.listIssues({}, { account: input.account, ...(input.user ? { for: input.user } : {}) }),
})
`

async function connected(t: TestContext, provider: Provider, tokenUrl?: string): Promise<TestApp> {
  const folder = copyOf(t, 'connected')
  const file = join(folder, 'services.ts')
  let services = readFileSync(file, 'utf8')
  if (tokenUrl) services = services.replace('http://127.0.0.1:1/token', tokenUrl)
  writeFileSync(file, services.split('http://127.0.0.1:1').join(provider.remote.origin))
  appendFileSync(join(folder, 'functions.ts'), more)
  const app = await testApp({ folder, real: ['github', 'githubUploads'] })
  closing(t, () => app.close())
  return app
}

async function userWith(app: TestApp, name: string): Promise<{ user: Caller; browser: TestBrowser; id: string }> {
  const user = await app.user({ name, roles: [] })
  return { user, browser: app.browser({ as: user }), id: String(user.user?.id) }
}

async function started(browser: TestBrowser, o: { back?: string; account?: string } = {}) {
  const answer = await browser.call('startConnect', o)
  assert.equal(answer.ok, true, JSON.stringify(answer))
  const address = new URL(String(answer.value))
  return { address, state: String(address.searchParams.get('state')) }
}

async function back(browser: TestBrowser, query: string): Promise<string> {
  const answer = await browser.request('GET', `/_t/connect/github?${query}`)
  assert.equal(answer.status, 302)
  return String(answer.headers.get('location'))
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** A text of base64 with one character changed: at a place, by the lowest bit of what it stands for. */
const oneChanged = (text: string, at: number): string =>
  text.slice(0, at) + alphabet[alphabet.indexOf(text.charAt(at)) ^ 1] + text.slice(at + 1)

const tokenAsks = (provider: Provider): number => provider.remote.heard.filter((one) => one.path === '/token').length

test("[05-11.5] the return address of a connect, with the attacker's own state and code, opened in a victim's browser, writes nothing", async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const attacker = await userWith(app, 'Attacker')
  const victim = await userWith(app, 'Victim')
  const { state } = await started(attacker.browser, { back: '/done' })
  assert.equal(await back(victim.browser, `code=attackers-code&state=${state}`), '/?connect=failed')
  assert.equal(tokenAsks(provider), 0)
  assert.deepEqual((await victim.browser.read('mine')).value, [])
  assert.deepEqual((await attacker.browser.read('mine')).value, [])
})

test('[05-11.6] a state with one character changed, one eleven minutes old, and one brought back under another name of the app writes nothing', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const { state } = await started(maya.browser, { back: '/done' })
  for (const at of [0, Math.floor(state.length / 2), state.length - 1])
    assert.equal(
      await back(maya.browser, `code=c-${at}&state=${oneChanged(state, at)}`),
      '/?connect=failed',
      `the character at ${at} of ${state.length} changed`,
    )
  // The same app reached by another of its names: the state names the one the start came by.
  const other = await maya.browser.request('GET', `http://127.0.0.1/_t/connect/github?code=c-other&state=${state}`)
  assert.equal(other.status, 302)
  assert.equal(other.headers.get('location'), '/done?connect=failed')
  const old = await started(maya.browser, { back: '/done' })
  app.clock.advance('11 minutes')
  assert.equal(await back(maya.browser, `code=c-old&state=${old.state}`), '/done?connect=failed')
  assert.equal(tokenAsks(provider), 0)
  assert.deepEqual((await maya.browser.read('mine')).value, [])
})

test('[05-11.7] `connections.start` with a `back` of `//evil.example` is T0002', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  for (const back of [
    '//evil.example',
    'https://evil.example/',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
  ]) {
    const answer = await maya.browser.call('startConnect', { back })
    assert.equal(answer.ok, false, back)
    assert.equal(Object(answer.error).code, 'T0002', back)
  }
})

test('[05-11.8] two calls at once that both renew one connection make one renewal, and both are made with the new token', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const { state } = await started(maya.browser, { back: '/done' })
  assert.equal(await back(maya.browser, `code=one&state=${state}`), '/done')
  app.clock.advance('2 hours')
  const [a, b] = await Promise.all([maya.browser.call('issues', {}), maya.browser.call('issues', {})])
  assert.equal(provider.refreshes, 1)
  assert.deepEqual([a.value, b.value], [{ by: 'access-2' }, { by: 'access-2' }])
})

test('[05-11.9] a copy of the data file holds the tokens of a connection in no form that opens without the key', async (t) => {
  const temp = tempOf(t)
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const { state } = await started(maya.browser, { back: '/done' })
  assert.equal(await back(maya.browser, `code=one&state=${state}`), '/done')
  await app.close()
  for (const one of bytesUnder(temp))
    for (const token of ['access-1', 'refresh-1'])
      assert.equal(one.bytes.includes(Buffer.from(token)), false, `${one.file} holds ${token}`)
})

test('[05-11.10] [05-11.34] `for` on a service call, and `connections.list` and `connections.end` with another user, in code with no full access are T0013', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  const { state } = await started(maya.browser, { back: '/done' })
  assert.equal(await back(maya.browser, `code=one&state=${state}`), '/done')
  for (const [name, input] of [
    ['issuesFor', { user: maya.id }],
    ['listFor', { user: maya.id }],
    ['endFor', { user: maya.id }],
  ] as const) {
    const answer = await deniz.browser.call(name, input)
    assert.equal(answer.ok, false, name)
    assert.equal(Object(answer.error).code, 'T0009', `${name}: T0013 has no status, and a caller is sent T0009`)
  }
  assert.equal(Object((await maya.browser.read('mine')).value).length, 1, "maya's connection is still there")
})

test('[05-11.30] the return for a name that is no service with `oauth`, a state used a second time, and a `back` that already holds `connect=`', async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  for (const name of ['githubUploads', 'users', 'nothing', '..%2Fgithub'])
    assert.equal((await maya.browser.request('GET', `/_t/connect/${name}?code=c&state=s`)).status, 404, name)
  const { state } = await started(maya.browser, { back: '/done?connect=refused&tab=2' })
  assert.equal(await back(maya.browser, `code=once&state=${state}`), '/done?tab=2')
  assert.equal(await back(maya.browser, `code=once&state=${state}`), '/done?tab=2&connect=failed')
  assert.equal(provider.issued, 1, 'the provider refused the code used again, and nothing more was written')
})

test('[05-11.35] a provider whose answer to the request for tokens is a gigabyte is cut, and a `tokenUrl` inside this computer is T0022', async (t) => {
  const provider = await providerOf(t)
  provider.hugeTokens = true
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const { state } = await started(maya.browser, { back: '/done' })
  const began = performance.now()
  assert.equal(await back(maya.browser, `code=big&state=${state}`), '/done?connect=failed')
  assert.ok(performance.now() - began < 30_000)
  const inside = await connected(t, provider, 'http://169.254.169.254/token')
  const deniz = await userWith(inside, 'Deniz')
  const second = await started(deniz.browser, { back: '/done' })
  assert.equal(await back(deniz.browser, `code=inside&state=${second.state}`), '/done?connect=failed')
  assert.deepEqual((await deniz.browser.read('mine')).value, [])
})

test("[05-11.48] the second account of a user, named in a call by another user's code without full access: T0013 for `for`, and an account is the caller's own", async (t) => {
  const provider = await providerOf(t)
  const app = await connected(t, provider)
  const maya = await userWith(app, 'Maya')
  const deniz = await userWith(app, 'Deniz')
  const { state } = await started(maya.browser, { back: '/done', account: 'work' })
  assert.equal(await back(maya.browser, `code=work&state=${state}`), '/done')
  assert.deepEqual((await maya.browser.call('issuesOfAccount', { account: 'work' })).value, { by: 'access-1' })
  const own = await deniz.browser.call('issuesOfAccount', { account: 'work' })
  assert.equal(own.ok, false)
  assert.equal(Object(own.error).code, 'T7117')
  const named = await deniz.browser.call('issuesOfAccount', { account: 'work', user: maya.id })
  assert.equal(named.ok, false)
  assert.equal(Object(named.error).code, 'T0009')
  assert.equal(provider.remote.heard.filter((one) => one.path === '/issues').length, 1)
})
