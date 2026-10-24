import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { edited, errorOf, callerIdOf, mcpApp, mcpProject, opened, people, textOf } from './mcpApp.ts'

const older = ['2025-11-25', '2025-06-18', '2025-03-26']

test('[25-1] a request of the newest form with lines that match its body is answered, and one whose lines and body differ is T0002', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const hello = await client.hello()
  assert.ok(Array.isArray(hello.supportedVersions), JSON.stringify(hello))
  assert.ok(Object(hello.capabilities).tools, 'it says that it has tools')
  assert.ok((await client.tools()).length > 0)
  const method = await client.request('tools/list', {}, { headers: { 'mcp-method': 'tools/call' } })
  assert.equal(method.status, 400)
  assert.equal(Object(Object(method.body.error).data).code, 'T0002')
  const version = await client.request('tools/list', {}, { headers: { 'mcp-protocol-version': '2025-06-18' } })
  assert.equal(version.status, 400)
  assert.equal(Object(Object(version.body.error).data).code, 'T0002')
})

test('[25-1] a client of each older version opens, lists and calls, and nothing is kept between its requests', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  for (const form of older) {
    const client = app.mcp({ as: ada, form })
    const hello = await client.hello()
    assert.equal(hello.protocolVersion, form, `the form ${form} is answered in itself`)
    assert.ok(Object(hello.capabilities).tools)
    const names = (await client.tools()).map((one) => one.name)
    assert.ok(names.includes('openOrders'), names.join(' '))
    const added = await client.call('addOrder', { title: `made in ${form}` })
    assert.equal(added.isError, undefined, JSON.stringify(added))
    // A client that never opened is answered as one that did: the layer keeps nothing of an opening.
    const fresh = await app.mcp({ as: ada, form }).send({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} })
    assert.equal(fresh.status, 200, JSON.stringify(fresh.body))
    assert.ok(Array.isArray(Object(fresh.body.result).tools))
    assert.equal(fresh.headers.get('mcp-session-id'), null, 'no session is handed out')
  }
  const listed = await app.mcp({ as: ada }).call('openOrders', {})
  assert.deepEqual(
    Object(listed.structuredContent).value.map((one: { title: string }) => one.title),
    older.map((form) => `made in ${form}`),
  )
})

test('[25-1] an unknown method is not known, a GET is 405, a body of many requests is T0002, and a note is taken', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const unknown = await client.request('tools/destroy', {})
  assert.equal(unknown.status, 200)
  assert.equal(Object(unknown.body.error).code, -32601)
  assert.equal((await client.send(undefined, { method: 'GET' })).status, 405)
  const many = await client.send([
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ])
  assert.equal(many.status, 400)
  assert.equal(Object(Object(many.body.error).data).code, 'T0002')
  const note = await app
    .mcp({ as: ada, form: '2025-06-18' })
    .send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  assert.equal(note.status, 202)
})

test('[25-1] a request that names no caller is 401 with the line that says where the sign-in is described, and a refusal of step 4 is its status with the wire error', async (t) => {
  const app = await mcpApp(t, [{ from: 'callerPerMinute: 100000', to: 'callerPerMinute: 2' }])
  const { ada } = await people(app)
  const nobody = await app.mcp().request('tools/list', {})
  assert.equal(nobody.status, 401)
  const line = String(nobody.headers.get('www-authenticate'))
  assert.match(line, /^Bearer /)
  assert.match(line, /resource_metadata="http:\/\/localhost\/\.well-known\/oauth-protected-resource\/mcp"/)
  const client = app.mcp({ as: ada })
  await client.request('tools/list', {})
  await client.request('tools/list', {})
  const third = await client.request('tools/list', {})
  assert.equal(third.status, 429)
  assert.equal(Object(third.body.error).code, 'T0005', JSON.stringify(third.body))
})

test('[25-1] with `mcp: { stream: true }` a GET is a kept stream, which is sent the note that the tools changed when a new version goes live', async (t) => {
  const folder = mcpProject(t, [{ from: 'mcp: { names', to: 'mcp: { stream: true, names' }])
  const app = await opened(t, folder)
  const { ada } = await people(app)
  const stream = await app.mcp({ as: ada, form: '2025-06-18' }).listen()
  assert.equal(stream.status, 200)
  assert.equal(stream.kind, 'text/event-stream')
  edited(folder, [{ file: 'functions.ts', from: 'Writes a note', to: 'Writes a note of the caller' }])
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'second') })
  await app.switch(await app.add(built.bundleFolder))
  const note = await stream.next()
  assert.equal(note.method, 'notifications/tools/list_changed')
  stream.close()
  // The newest form asks for its stream by the standard's own listening request.
  const newest = await app.mcp({ as: ada }).listen()
  assert.equal(newest.status, 200)
  assert.equal(newest.kind, 'text/event-stream')
  newest.close()
  // Without `stream`, a GET is 405 and the list says how long it may be kept.
  const plain = await mcpApp(t)
  const { ada: other } = await people(plain)
  assert.equal((await plain.mcp({ as: other, form: '2025-06-18' }).send(undefined, { method: 'GET' })).status, 405)
  const listed = await plain.mcp({ as: other }).request('tools/list', {})
  assert.equal(listed.headers.get('cache-control'), 'private, max-age=300')
})

test('[25-1] [05-13.35] a method that `mcp.on` names is answered by its function as the caller, and the layer names that part of the standard in what it says of itself', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const listed = await client.request('resources/list', {})
  assert.deepEqual(Object(listed.body.result).resources, [
    { uri: 'tent://orders', name: `orders of ${callerIdOf(ada)}` },
  ])
  for (const form of [undefined, '2025-06-18']) {
    const hello = await app.mcp({ as: ada, ...(form ? { form } : {}) }).hello()
    assert.ok(Object(hello.capabilities).resources, 'resources/list is of the part `resources`')
    assert.ok(Object(hello.capabilities).prompts, 'prompts/get is of the part `prompts`')
  }
  // A method whose function refuses the caller is the answer of a tool with T3101.
  const refused = await client.request('prompts/get', { name: 'x' })
  const result = Object(refused.body.result)
  assert.equal(result.isError, true)
  assert.equal(errorOf(result).code, 'T3101')
})

test('[25-2] [25-18] the list holds exactly the offered functions, each with its title, its about, its input and the marks of its row', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const tools = await app.mcp({ as: ada }).tools()
  const byName = new Map(tools.map((one) => [String(one.name), one]))
  assert.deepEqual(
    [...byName.keys()].sort(),
    [
      'addNote',
      'addOrder',
      'bigJob',
      'forget',
      'openOrders',
      'openToAll',
      'peek',
      'removeOrder',
      'renamed',
      'sendReceipt',
      'slowJob',
      'staffTotals',
      'titles',
    ],
    'what is offered to MCP, by the name of its tool, and no other',
  )
  const open = Object(byName.get('openOrders'))
  assert.equal(open.title, 'Open orders')
  assert.match(String(open.description), /^The orders that the caller placed/)
  assert.deepEqual(Object(open.inputSchema).type, 'object')
  assert.ok(Object(Object(open.inputSchema).properties).limit)
  const marks = (name: string) => Object(Object(byName.get(name)).annotations)
  assert.deepEqual(marks('openOrders'), { readOnlyHint: true, openWorldHint: false })
  assert.deepEqual(marks('addOrder'), { readOnlyHint: false, openWorldHint: false })
  assert.deepEqual(marks('addNote'), { readOnlyHint: false, destructiveHint: false, openWorldHint: false })
  assert.deepEqual(marks('removeOrder'), { readOnlyHint: false, destructiveHint: true, openWorldHint: false })
  assert.deepEqual(marks('sendReceipt'), { readOnlyHint: false, openWorldHint: true })
  assert.deepEqual(marks('peek'), { readOnlyHint: true, openWorldHint: false })
  assert.equal(marks('bigJob').readOnlyHint, false, 'a flow is marked as an action is')
  assert.equal(Object(byName.get('renamed')).title, 'Renamed')
  assert.equal(Object(byName.get('sendReceipt')).title, 'Send receipt')
})

test('[25-2] under `mcp: { anyone: true }` a request with no caller is listed the open functions and may call them, and is 401 for any other', async (t) => {
  const app = await mcpApp(t, [{ from: 'mcp: { names', to: 'mcp: { anyone: true, names' }])
  const client = app.mcp()
  assert.deepEqual(
    (await client.tools()).map((one) => one.name),
    ['openToAll'],
  )
  assert.deepEqual((await client.call('openToAll', {})).structuredContent, { value: 'open words' })
  const other = await client.request('tools/call', { name: 'openOrders', arguments: {} })
  assert.equal(other.status, 401)
  assert.match(String(other.headers.get('www-authenticate')), /resource_metadata=/)
})

test('[25-2] an answer that is a list is { value }, and says so in the part that is kept from the model; nothing is {}', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  await client.call('addOrder', { title: 'first' })
  const listed = await client.call('titles', {})
  assert.deepEqual(listed.structuredContent, { value: ['first'] })
  assert.equal(Object(listed._meta)['tent.wrapped'], true)
  assert.deepEqual(JSON.parse(textOf(listed)), { value: ['first'] })
  const schema = Object((await client.tools()).find((one) => one.name === 'titles')?.outputSchema)
  assert.deepEqual(Object(schema.properties).value?.type, 'array')
  const nothing = await client.call('forget', {})
  assert.deepEqual(nothing.structuredContent, {})
  assert.equal(Object(nothing._meta)['tent.wrapped'], true)
  const record = await client.call('peek', {})
  assert.deepEqual(record.structuredContent, { at: 'now' })
  assert.equal(Object(record._meta)['tent.wrapped'], undefined, 'a record is no wrapped value')
})

test('[25-2] a function offered to MCP with a name of 65 characters is T1014, and one named callFunction is T1009', async (t) => {
  for (const [name, code] of [
    ['a'.repeat(65), 'T1014'],
    ['callFunction', 'T1009'],
  ]) {
    const folder = mcpProject(t)
    writeFileSync(
      join(folder, 'more.ts'),
      `import { query } from 'tentjs'\nexport const ${name} = query('${name}', { about: 'x', access: 'signedIn', offer: ['mcp'], input: {}, run: () => 1 })\n`,
    )
    const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'out') })
    assert.ok(
      built.findings.some((one) => one.code === code && one.level === 'error'),
      built.findings.map((one) => `${one.code} ${one.message}`).join('\n'),
    )
  }
})

test('[25-3] [11-2@9b] a call passes the door as its caller: a row of another user is not found, a refusal of the rule is T3101, and an input that does not fit is an error answer with its fields', async (t) => {
  const app = await mcpApp(t)
  const { ada, bob } = await people(app)
  const asAda = app.mcp({ as: ada })
  const added = await asAda.call('addOrder', { title: 'by Ada' })
  assert.equal(added.isError, undefined, JSON.stringify(added))
  const [row] = await app.rows('orders')
  assert.equal(row.placedBy, callerIdOf(ada), 'the call ran as its caller')
  assert.deepEqual(Object(await app.mcp({ as: bob }).call('openOrders', {})).structuredContent, { value: [] })
  const refused = await asAda.call('staffTotals', {})
  assert.equal(refused.isError, true)
  assert.equal(errorOf(refused).code, 'T3101')
  assert.match(textOf(refused), /^Error T3101: /)
  const bad = await asAda.call('addOrder', { title: 'x' })
  assert.equal(bad.isError, true)
  assert.equal(errorOf(bad).code, 'T0002')
  assert.deepEqual(errorOf(bad).fields, { title: 'min' })
  assert.match(textOf(bad), /^Error T0002: .*\ntitle: min$/s)
  for (const name of ['hidden', 'onlyApi', 'listResources', 'nothingHere']) {
    const missing = await asAda.call(name, {})
    assert.equal(missing.isError, true)
    assert.equal(errorOf(missing).code, 'T0001', name)
  }
})

test('[25-3] [23-30@9b] a flow offered to MCP answers its answer through its output, one that outlasts the call is T0008 with the run, and a flow with `access` alone is no tool', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const counted = await client.call('bigJob', { word: 'four' })
  assert.deepEqual(counted.structuredContent, { letters: 4 })
  const late = await client.call('slowJob', { word: 'late' })
  assert.equal(late.isError, true)
  assert.equal(errorOf(late).code, 'T0008')
  const run = String(Object(errorOf(late).fields).run)
  assert.ok(run.length > 10)
  app.clock.advance('2 hours')
  const waited = await client.call('slowJob', { run })
  assert.deepEqual(waited.structuredContent, { word: 'late' })
  const pages = await client.call('pagesOnly', { word: 'x' })
  assert.equal(errorOf(pages).code, 'T0001')
  assert.equal(app.runs.find({ flow: 'pagesOnly' }).length, 0)
})

test("[25-18] under `mcp: { only: 'queries' }` the list holds what only reads, and a change is not found", async (t) => {
  const app = await mcpApp(t, [{ from: 'mcp: { names', to: "mcp: { only: 'queries', names" }])
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const names = (await client.tools()).map((one) => String(one.name)).sort()
  assert.deepEqual(names, ['openOrders', 'openToAll', 'peek', 'renamed', 'staffTotals', 'titles'])
  for (const one of await client.tools()) assert.equal(Object(one.annotations).readOnlyHint, true, String(one.name))
  const change = await client.call('addOrder', { title: 'refused' })
  assert.equal(errorOf(change).code, 'T0001')
  assert.equal((await app.rows('orders')).length, 0)
})

test('[32-7@9b] `/mcp` goes to MCP in an app that offers something to it, and a route at `/mcp` answers in an app that offers nothing', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  assert.equal((await app.mcp({ as: ada }).request('tools/list', {})).status, 200)
  const routed = await mcpApp(t, [], 'mcpRouted')
  const answer = await routed.request(new Request('http://localhost/mcp'))
  assert.deepEqual([answer.status, await answer.text()], [200, 'the route at /mcp'])
})
