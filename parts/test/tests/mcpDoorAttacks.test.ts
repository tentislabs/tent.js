import assert from 'node:assert/strict'
import test from 'node:test'
import type { McpListening } from '../index.ts'
import { errorOf, callerIdOf, mcpApp, people } from './mcpApp.ts'
import { chatApp, signedFor } from './signedFor.ts'

const redirect = 'https://chat.example/callback'

/** The project of sign-in for programs with a function of the tests that removes a key, and the edits it is given. */
const keyRemoved = [
  { file: 'functions.ts', from: 'grants, json,', to: 'grants, json, keys,' },
  {
    file: 'functions.ts',
    from: 'export const notOnline',
    to: "export const removeKey = action('removeKey', {\n  access: anyone('a test removes a key'),\n  system: 'removes keys for the tests',\n  input: { id: text() },\n  run: async ({ input }) => keys.remove(input.id),\n})\n\nexport const notOnline",
  },
]

/** The project of sign-in for programs with kept streams, and two connections at once for an address. */
const streamed = [
  { from: "scopes: { billing: ['addOrder'] },", to: "scopes: { billing: ['addOrder'] },\n    stream: true," },
  { from: 'screensPerMinute: 100000 }', to: 'screensPerMinute: 100000, liveConnections: 2 }' },
]

/** Whether a kept stream is closed within a short wait: its next message ends it, or nothing comes. */
async function closedSoon(stream: McpListening, ms = 2000): Promise<boolean> {
  const ended = stream.next().then(
    () => false,
    () => true,
  )
  const waited = new Promise<boolean>((done) => setTimeout(() => done(false), ms))
  return Promise.race([ended, waited])
}

test('[05-13.1] /mcp with no caller, with an ended token, and with a removed key is 401 each time', async (t) => {
  const app = await mcpApp(t, keyRemoved, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t)
  assert.equal((await app.mcp().request('tools/list', {})).status, 401)
  const removed = await app.key({ user: callerIdOf(ada), scopes: ['*'] })
  const keyClient = app.mcp({ as: { token: removed.key } })
  assert.equal((await keyClient.request('tools/list', {})).status, 200)
  await app.as('system').call('removeKey', { id: String(removed.caller.key?.id) })
  assert.equal((await keyClient.request('tools/list', {})).status, 401, 'a removed key')
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read' })
  const tokenClient = app.mcp({ as: { token: signed.access } })
  assert.equal((await tokenClient.request('tools/list', {})).status, 200)
  app.clock.advance('61 minutes')
  assert.equal((await tokenClient.request('tools/list', {})).status, 401, 'an ended token')
})

test('[05-13.2] a call of a function that is not offered, and of one that `mcp.only` leaves out, also through callFunction, is T0001', async (t) => {
  const app = await mcpApp(t, [
    { from: 'mcp: { names:', to: "mcp: { toolsListed: 1, only: ['openOrders', 'titles', 'addNote'], names:" },
  ])
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const names = (await client.tools()).map((one) => String(one.name)).sort()
  assert.deepEqual(names, ['callFunction', 'findFunction'], 'above toolsListed the pair is listed')
  for (const name of ['hidden', 'addOrder'])
    assert.equal(errorOf(await client.call(name, {})).code, 'T0001', `${name} called by its own name`)
  for (const name of ['hidden', 'addOrder', 'onlyApi'])
    assert.equal(
      errorOf(await client.call('callFunction', { name, input: {} })).code,
      'T0001',
      `${name} called through callFunction`,
    )
  assert.equal(errorOf(await client.call('callFunction', { name: 'titles', input: {} })).code, undefined)
})

test('[05-13.34] a session cookie at /mcp from a page of a site that is not listed is T0004', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const browser = app.browser({ as: ada, site: 'https://evil.example' })
  const answer = await browser.request('POST', '/mcp', {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  assert.equal(answer.status, 403)
  assert.match(await answer.text(), /T0004/)
})

test('[05-13.43] the yes of an ask page is used by no other program of the same person, and a GET of /_t/ask with the text of the yes agrees to nothing', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const added = await app.mcp({ as: ada }).call('addOrder', { title: 'to remove' })
  const order = String(Object(added.structuredContent).id)
  const first = app.mcp({ as: { token: (await app.key({ user: callerIdOf(ada), scopes: ['*'] })).key } })
  const second = app.mcp({ as: { token: (await app.key({ user: callerIdOf(ada), scopes: ['*'] })).key } })
  const browser = app.browser({ as: ada })
  /** The text of the yes on the page of the ask that a call of the first program was answered. */
  const yesOf = async (): Promise<string> => {
    const refused = await first.call('removeOrder', { order })
    assert.equal(errorOf(refused).code, 'T7120')
    const page = String(Object(errorOf(refused).fields).page).slice('http://localhost'.length)
    const html = await (await browser.request('GET', page)).text()
    return /name="t" value="([^"]+)"/.exec(html)?.[1] ?? ''
  }
  const looked = await yesOf()
  assert.ok(looked)
  for (const path of [
    `/_t/ask?t=${encodeURIComponent(looked)}&answer=allow`,
    `/_t/ask?a=${encodeURIComponent(looked)}&answer=allow`,
  ])
    await browser.request('GET', path)
  assert.equal(errorOf(await first.call('removeOrder', { order })).code, 'T7120', 'a GET agreed to nothing')
  const text = await yesOf()
  const said = await browser.request('POST', '/_t/ask', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ t: text, answer: 'allow' }).toString(),
  })
  assert.equal(said.status, 200)
  assert.equal(errorOf(await second.call('removeOrder', { order })).code, 'T7120', 'another program of the person')
  assert.equal((await app.rows('orders')).length, 1, 'the function did not run')
  assert.equal(errorOf(await first.call('removeOrder', { order })).code, undefined, 'the program it was given for')
  assert.equal((await app.rows('orders')).length, 0)
})

test('[05-13.46] kept streams of /mcp from one address past `liveConnections` are T0005', async (t) => {
  const app = await mcpApp(t, streamed, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t)
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read' })
  const client = app.mcp({ as: { token: signed.access }, form: '2025-06-18' })
  const open = [await client.listen(), await client.listen()]
  for (const one of open) assert.equal(one.status, 200)
  const third = await client.listen()
  assert.equal(third.status, 429)
  open[0].close()
  await new Promise((done) => setTimeout(done, 50))
  const again = await client.listen()
  assert.equal(again.status, 200, 'a closed stream gives its place back')
  again.close()
  open[1].close()
})

test('[05-13.46] a kept stream that never reads is closed once more than 1 MB waits for it', async (t) => {
  const app = await mcpApp(t, streamed, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t)
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read' })
  const [grant] = Object(await app.as(ada).call('myGrants', {}))
  const stream = await app.mcp({ as: { token: signed.access }, form: '2025-06-18' }).listen()
  assert.equal(stream.status, 200)
  // Three requests of half a megabyte each are sent down a stream that nothing reads, through the request of the
  // maker that the action of the project reaches: each is a value that crosses a room, within `valueSize`.
  const sent = [1, 2, 3].map(
    (n): Promise<unknown> =>
      app.call(
        'askClient',
        {
          grant: String(grant.id),
          method: 'sampling/createMessage',
          params: { n, big: 'x'.repeat(512 * 1024) },
        },
        { as: { kind: 'system' } },
      ),
  )
  const told = await Promise.race([
    Promise.allSettled(sent).then((all) =>
      all.map((one) => (one.status === 'rejected' ? Object(one.reason).code : 'answered')),
    ),
    new Promise<string[]>((done) => setTimeout(() => done(['still waiting']), 3000)),
  ])
  assert.ok(told.includes('T7120'), `the stream was closed, and what waited on it failed: ${told.join(' ')}`)
  stream.close()
})

test('[25-1] a kept stream is closed when the token of its caller ends', async (t) => {
  const app = await mcpApp(t, streamed, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t)
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope: 'read' })
  const stream = await app.mcp({ as: { token: signed.access }, form: '2025-06-18' }).listen()
  assert.equal(stream.status, 200)
  assert.equal(await closedSoon(stream, 300), false, 'the stream stands while its token does')
  app.clock.advance('61 minutes')
  assert.equal(await closedSoon(stream), true, 'the stream is closed once its token ended')
})
