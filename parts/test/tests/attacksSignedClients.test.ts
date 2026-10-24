import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { mcpApp } from './mcpApp.ts'
import { authorizeAt, chatApp, decideFormOf, proof, signedFor } from './signedFor.ts'

const redirect = 'https://chat.example/callback'

/** The app of sign-in for programs, with one person in it. */
async function signedApp(t: Parameters<typeof mcpApp>[0]) {
  const app = await mcpApp(t, [], 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  return { app, ada }
}

/** Asks for a page of sign-in in a browser, and holds that the person is neither asked nor sent anywhere. */
async function refusedAt(browser: Pick<TestBrowser, 'request'>, path: string, what: string): Promise<void> {
  const answer = await browser.request('GET', path)
  assert.equal(answer.headers.get('location'), null, `${what}: nobody is sent anywhere`)
  assert.notEqual(answer.status, 200, `${what}: the person is asked`)
  assert.equal(decideFormOf(await answer.text()).text, '', `${what}: the page holds the text of a yes`)
}

/** What `/mcp` answers a request with a token. */
const mcpWith = async (app: TestApp, token: string): Promise<number> =>
  (await app.mcp({ as: { token } }).request('tools/list', {})).status

test('[05-13.6] a return address that the client document does not list, and one that differs in one letter, is refused, and nobody is sent there', async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t, { redirects: [redirect] })
  const browser = app.browser({ as: ada })
  for (const back of [
    'https://evil.example/callback',
    'https://chat.example/callbacl',
    'https://chat.example/Callback',
    'https://chat.exampl3/callback',
    'https://chat.example/callback/',
    'https://chat.example/callback?to=https://evil.example',
    'https://chat.example.evil.example/callback',
    'http://chat.example/callback',
  ])
    await refusedAt(browser, authorizeAt({ client: chat.id, redirect: back, proof: proof() }), back)
  // The listed address is taken as it is written: so the refusals are of the addresses alone.
  const listed = await browser.request('GET', authorizeAt({ client: chat.id, redirect, proof: proof() }))
  assert.equal(listed.status, 200)
})

test("[05-13.17] a client with a document of its own that asks for the app is given /mcp, one that asks for another site is refused, and a program that says it is the app's command line is asked about every time as a program for the whole app", async (t) => {
  const { app, ada } = await signedApp(t)
  const chat = await chatApp(t)
  const browser = app.browser({ as: ada })
  // It asks for a token for the whole app, and is given one for /mcp alone.
  const signed = await signedFor(app, ada, {
    client: chat.id,
    redirect,
    resource: 'http://localhost',
    scope: 'read write',
  })
  assert.equal(await mcpWith(app, signed.access), 200, 'it was not given /mcp')
  const called = await app.request(
    new Request('http://localhost/_t/call/addOrder', {
      method: 'POST',
      headers: { authorization: `Bearer ${signed.access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { title: 'by a client of a document' } }),
    }),
  )
  assert.notEqual(called.status, 200, 'the token of a client of a document reaches the whole app')
  // Another site, as what the token is for: refused.
  for (const resource of ['https://other.example/mcp', 'https://other.example'])
    await refusedAt(browser, authorizeAt({ client: chat.id, redirect, proof: proof(), resource }), resource)
  // A program of this computer that names itself the command line: the person is asked each time, for the whole app.
  const cli = { client: 'tent-cli', redirect: 'http://127.0.0.1:43123/callback', scope: 'read write' }
  for (let time = 1; time <= 3; time++) {
    const page = await browser.request('GET', authorizeAt({ ...cli, proof: proof(), resource: 'http://localhost' }))
    assert.equal(page.status, 200, `time ${time}: the person was not asked`)
    const html = await page.text()
    assert.ok(decideFormOf(html).text, `time ${time}: the page holds no yes to give`)
    assert.match(html, /This program will act as you in the whole app/, `time ${time}`)
    if (time === 1) await signedFor(app, ada, { ...cli, resource: 'http://localhost' })
  }
})
