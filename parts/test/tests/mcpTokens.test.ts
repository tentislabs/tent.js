import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { errorOf, callerIdOf, mcpApp } from './mcpApp.ts'
import { chatApp, signedFor } from './signedFor.ts'

const redirect = 'https://chat.example/callback'

/** The app of sign-in for programs, with one person, and a chat app that this person let in with these scopes. */
async function grantedApp(t: Parameters<typeof mcpApp>[0], scope: string, edits: Parameters<typeof mcpApp>[1] = []) {
  const app = await mcpApp(t, edits, 'mcpSigned')
  const ada = await app.user({ email: 'ada@example.com' })
  const chat = await chatApp(t)
  const signed = await signedFor(app, ada, { client: chat.id, redirect, scope })
  return { app, ada, chat, signed }
}

/** A request of the app with a token: answers the status and the body as JSON. */
async function sent(
  app: TestApp,
  method: string,
  path: string,
  token: string,
  o: { body?: string | Uint8Array<ArrayBuffer>; type?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const answer = await app.request(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(o.type ? { 'content-type': o.type } : {}),
        ...(o.body === undefined ? {} : { 'content-length': String(new TextEncoder().encode(String(o.body)).length) }),
      },
      ...(o.body === undefined ? {} : { body: o.body }),
    }),
  )
  const text = await answer.text()
  return { status: answer.status, body: text.startsWith('{') ? Object(JSON.parse(text)) : { text } }
}

test('[25-7] [25-18] [05-13.3] a token with `read` is listed what only reads, and a change is 403 with the line that names the missing scope', async (t) => {
  const { app, signed } = await grantedApp(t, 'read')
  const client = app.mcp({ as: { token: signed.access } })
  assert.deepEqual((await client.tools()).map((one) => String(one.name)).sort(), ['docOf', 'openOrders'])
  const change = await client.request('tools/call', { name: 'addOrder', arguments: { title: 'refused' } })
  assert.equal(change.status, 403)
  assert.equal(Object(change.body.error).code, 'T3101')
  assert.match(String(change.headers.get('www-authenticate')), /error="insufficient_scope", scope="write"/)
  assert.equal((await app.rows('orders')).length, 0)
})

test("[25-2] [25-3] [25-7] a token with `write` is listed every offered function, and a call passes the door as the token's user", async (t) => {
  const { app, ada, signed } = await grantedApp(t, 'read write')
  const client = app.mcp({ as: { token: signed.access } })
  assert.deepEqual((await client.tools()).map((one) => String(one.name)).sort(), ['addOrder', 'docOf', 'openOrders'])
  const added = await client.call('addOrder', { title: 'by a chat app' })
  assert.equal(added.isError, undefined, JSON.stringify(added))
  const [row] = await app.rows('orders')
  assert.equal(row.placedBy, callerIdOf(ada))
})

test('[25-1] a method that `mcp.on` names reaches a query for a token with `read`', async (t) => {
  const { app, signed } = await grantedApp(t, 'read', [
    {
      from: "scopes: { billing: ['addOrder'] },",
      to: "scopes: { billing: ['addOrder'] },\n    on: { 'resources/list': 'listResources' },",
    },
  ])
  const listed = await app.mcp({ as: { token: signed.access } }).request('resources/list', {})
  assert.deepEqual(listed.body.result, { resources: [] })
})

test('[25-7] a token of a finer scope calls the functions of that scope and no other', async (t) => {
  const { app, signed } = await grantedApp(t, 'billing')
  const client = app.mcp({ as: { token: signed.access } })
  assert.deepEqual(
    (await client.tools()).map((one) => one.name),
    ['addOrder'],
  )
  assert.equal((await client.call('addOrder', { title: 'billed' })).isError, undefined)
  const other = await client.request('tools/call', { name: 'openOrders', arguments: {} })
  assert.equal(other.status, 403)
})

test('[25-7] [05-13.12] a token sent to /_t/call/ is nobody, a token in the address is not read, and a renewal token is no token of a request', async (t) => {
  const { app, signed } = await grantedApp(t, 'read write')
  const called = await sent(app, 'POST', '/_t/call/openOrders', signed.access, {
    body: JSON.stringify({ input: {} }),
    type: 'application/json',
  })
  assert.equal(Object(called.body.error).code, 'T0006', 'a token given for /mcp is nobody at /_t/call/')
  const inAddress = await app.request(
    new Request(`http://localhost/mcp?access_token=${signed.access}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }),
  )
  assert.equal(inAddress.status, 401)
  assert.equal((await app.mcp({ as: { token: signed.refresh } }).request('tools/list', {})).status, 401)
})

test("[25-7] a page of a listed site calls /mcp after the browser's question", async (t) => {
  const { app, signed } = await grantedApp(t, 'read', [
    {
      from: "privateHosts: ['http://127.0.0.1'],",
      to: "privateHosts: ['http://127.0.0.1'],\n  api: { origins: ['https://partner.example'] },",
    },
  ])
  const asked = await app.request(
    new Request('http://localhost/mcp', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://partner.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, mcp-protocol-version',
      },
    }),
  )
  assert.equal(asked.status, 204)
  assert.equal(asked.headers.get('access-control-allow-origin'), 'https://partner.example')
  assert.match(String(asked.headers.get('access-control-allow-headers')), /Mcp-Protocol-Version/)
  const listed = await app.mcp({ as: { token: signed.access } }).request(
    'tools/list',
    {},
    {
      headers: { origin: 'https://partner.example' },
    },
  )
  assert.equal(listed.status, 200)
  assert.equal(listed.headers.get('access-control-allow-origin'), 'https://partner.example')
  const stranger = await app.mcp({ as: { token: signed.access } }).request(
    'tools/list',
    {},
    {
      headers: { origin: 'https://stranger.example' },
    },
  )
  assert.equal(stranger.status, 403)
})

test("[25-7] under `mcp: { only: 'queries' }` a change is not found for a token with `write`", async (t) => {
  const { app, signed } = await grantedApp(t, 'read write', [
    { from: "scopes: { billing: ['addOrder'] },", to: "scopes: { billing: ['addOrder'] },\n    only: 'queries'," },
  ])
  const change = await app.mcp({ as: { token: signed.access } }).call('addOrder', { title: 'x' })
  assert.equal(errorOf(change).code, 'T0001')
})

test('[25-7] a token uploads a file with `write`, puts it into a row, and downloads the file that an answer named', async (t) => {
  const { app, signed } = await grantedApp(t, 'read write')
  const uploaded = await sent(app, 'POST', '/_t/files?name=note.txt', signed.access, {
    body: 'the words of the note',
    type: 'text/plain',
  })
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body))
  const id = String(Object(uploaded.body.value).id)
  const client = app.mcp({ as: { token: signed.access } })
  assert.equal((await client.call('addOrder', { title: 'with a note', doc: id })).isError, undefined)
  const named = await client.call('docOf', {})
  assert.deepEqual(named.structuredContent, { value: id })
  const download = await app.request(
    new Request(`http://localhost/_t/files/${id}`, { headers: { authorization: `Bearer ${signed.access}` } }),
  )
  assert.equal(download.status, 200)
  assert.equal(await download.text(), 'the words of the note')
  const reader = await grantedApp(t, 'read')
  const refused = await sent(reader.app, 'POST', '/_t/files?name=note.txt', reader.signed.access, {
    body: 'words',
    type: 'text/plain',
  })
  assert.equal(Object(refused.body.error).code, 'T3101', 'an upload needs `write`')
})

test("[25-7] a picture of `mcp.inline` or less that an answer names travels inside the answer as the standard's own part, and a file field of the input says that its id comes from an upload", async (t) => {
  const { app, signed } = await grantedApp(t, 'read write')
  // A picture of one point, as a PNG file holds it.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const uploaded = await app.request(
    new Request('http://localhost/_t/files?name=dot.png', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signed.access}`,
        'content-type': 'image/png',
        'content-length': String(png.length),
      },
      body: new Uint8Array(png),
    }),
  )
  const id = String(Object(Object(await uploaded.json()).value).id)
  const client = app.mcp({ as: { token: signed.access } })
  await client.call('addOrder', { title: 'with a picture', doc: id })
  const named = await client.call('docOf', {})
  const parts = Array.isArray(named.content) ? named.content.map((one: unknown) => Object(one)) : []
  const picture = parts.find((one) => one.type === 'image')
  assert.ok(picture, JSON.stringify(parts))
  assert.equal(picture.mimeType, 'image/png')
  assert.equal(Buffer.from(String(picture.data), 'base64').equals(png), true)
  const tool = (await client.tools()).find((one) => one.name === 'addOrder')
  const doc = Object(Object(Object(tool?.inputSchema).properties).doc)
  assert.match(String(doc.description), /uploaded/)
})

test('[25-1] with a kept stream, `mcp.request` of a maker reaches the client of the grant and answers its answer, and is T7120 with no stream', async (t) => {
  const { app, ada, signed } = await grantedApp(t, 'read', [
    { from: "scopes: { billing: ['addOrder'] },", to: "scopes: { billing: ['addOrder'] },\n    stream: true," },
  ])
  // The request of the maker, reached through the action of the project, in whatever room its code runs.
  const ask = async (grant: string): Promise<unknown> =>
    app.call(
      'askClient',
      {
        grant,
        method: 'sampling/createMessage',
        params: { messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }], maxTokens: 10 },
      },
      { as: { kind: 'system' } },
    )
  const [grant] = Object(await app.as(ada).call('myGrants', {}))
  await assert.rejects(ask(String(grant.id)), { code: 'T7120' })
  const client = app.mcp({ as: { token: signed.access }, form: '2025-06-18' })
  const stream = await client.listen()
  const answer = ask(String(grant.id))
  const sent = await stream.next()
  assert.equal(sent.method, 'sampling/createMessage')
  await client.send({
    jsonrpc: '2.0',
    id: sent.id,
    result: { role: 'assistant', content: { type: 'text', text: 'Hi' } },
  })
  assert.deepEqual(await answer, { role: 'assistant', content: { type: 'text', text: 'Hi' } })
  stream.close()
})
