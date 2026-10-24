import assert from 'node:assert/strict'
import test from 'node:test'
import { mcpApp, people } from './mcpApp.ts'
import { chatApp, signedFor } from './signedFor.ts'

test('[05-13.39] the pass of a frame uploads only where the caller it was made for could upload', async (t) => {
  // The chat app of the tests serves its document from this computer, which the engine may then reach.
  const app = await mcpApp(
    t,
    [{ from: "title: 'Shop',", to: "title: 'Shop',\n  privateHosts: ['http://127.0.0.1']," }],
    'mcpScreened',
  )
  const { ada } = await people(app)
  const chat = await chatApp(t)
  // A token that may only read: it uploads nothing itself.
  const { access } = await signedFor(app, ada, {
    client: chat.id,
    redirect: 'https://chat.example/callback',
    scope: 'read',
  })
  const upload = (token: string) =>
    app.request(
      new Request('http://localhost/_t/files?name=note.txt', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain', 'content-length': '5' },
        body: 'hello',
      }),
    )
  assert.equal((await upload(access)).status, 403, 'the token uploads nothing')
  const shown = await app.mcp({ as: { token: access } }).call('ordersScreen', {})
  assert.notEqual(shown.isError, true, JSON.stringify(shown))
  const pass = String(Object(shown._meta)['tent.pass'])
  assert.ok(pass.startsWith('pass.'), 'the screen tool answers a pass')
  const passed = await upload(pass)
  assert.notEqual(passed.status, 200, `the pass of a frame of the token uploads: ${await passed.text()}`)
})
