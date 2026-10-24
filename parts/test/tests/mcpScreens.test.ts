import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { chatServed } from './chatHost.ts'
import { errorOf, mcpApp, mcpProject, people, textOf } from './mcpApp.ts'
import { chatApp, signedFor } from './signedFor.ts'
import { untilWithin } from './remotes.ts'

/** The file of a screen in a chat that a bundle holds, by the description that names it. */
function chatFileOf(bundle: string, description: object, screen: string): string {
  const named = Object(Object(Object(Reflect.get(description, 'mcp')).screens)[screen]).en
  assert.equal(typeof named, 'string', 'the description names the file of the screen in English')
  return readFileSync(join(bundle, String(named)), 'utf8')
}

test('[25-9] the build writes one file for each screen offered to MCP, which holds its scripts, its styles and its module', async (t) => {
  const folder = mcpProject(t, [], 'mcpScreened')
  const built = await buildProject(folder, { for: 'release', out: join(folder, '..', 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const files = readdirSync(join(built.bundleFolder, 'mcp')).sort()
  assert.equal(files.length, 2, files.join(' '))
  assert.match(files[0], /^countedScreen\.en\.[0-9a-f]{12}\.html$/)
  assert.match(files[1], /^ordersScreen\.en\.[0-9a-f]{12}\.html$/)
  const html = chatFileOf(built.bundleFolder, built.description, 'ordersScreen')
  assert.match(html, /<script id="tent-views" type="application\/json">/)
  assert.ok(html.includes('__tentViews'), 'the module of a screen is one more script of the file')
  assert.ok(html.includes('__tent'), 'the page code in its form for one file')
  assert.ok(/<script>[\s\S]*ui\/initialize[\s\S]*<\/script>/.test(html), 'the part that speaks to a chat app')
  assert.doesNotMatch(html, /<script[^>]+src=/, 'no script is loaded from an address')
  assert.doesNotMatch(html, /aboutScreen/, 'a screen that is not offered stands in no file')
  const code = chatFileOf(built.bundleFolder, built.description, 'countedScreen')
  assert.ok(code.includes('__tentViews'), 'the module of the screen is one more script of the file')
  assert.doesNotMatch(code, /<script[^>]+src=|\bimport\s*\(?["']\.\/page\./, 'and it imports nothing')
})

test("[25-9] the layer writes the app's address into the file, and the screen's tool answers its record with the answers of its data and one line for the model", async (t) => {
  const app = await mcpApp(t, [], 'mcpScreened')
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  await client.call('addOrder', { title: 'Tea' })
  const tools = await client.tools()
  const screen = Object(tools.find((one) => one.name === 'ordersScreen'))
  assert.equal(Object(screen.annotations).readOnlyHint, true)
  assert.match(String(screen.description), /^The orders of the person/)
  const uri = String(Object(Object(screen._meta).ui).resourceUri)
  assert.match(uri, /^ui:\/\/shop\/ordersScreen\.en\.[0-9a-f]{12}\.html$/)
  assert.deepEqual(
    tools.map((one) => one.name).sort(),
    ['callFunction', 'countedScreen', 'findFunction', 'ordersScreen'],
    'above toolsListed each screen is listed beside the pair',
  )
  const listed = await client.request('resources/list', {})
  const uris = Object(listed.body.result).resources.map((one: unknown) => Object(one).uri)
  assert.ok(uris.includes(uri), uris.join(' '))
  const read = await client.request('resources/read', { uri })
  const [content] = Object(read.body.result).contents
  assert.equal(content.mimeType, 'text/html;profile=mcp-app')
  assert.match(String(content.text), /<base href="http:\/\/localhost\/">/)
  assert.deepEqual(Object(Object(content._meta).ui).csp.connectDomains, ['http://localhost', 'ws://localhost'])
  const shown = await client.call('ordersScreen', {})
  assert.equal(shown.isError, undefined, JSON.stringify(shown))
  const kept = Object(shown._meta)
  const page = Object(kept['tent.page'])
  assert.equal(page.screen, 'ordersScreen')
  assert.equal(typeof page.version, 'string')
  assert.deepEqual(
    page.answers.map((one: unknown) => [Object(one).what, Object(one).value]),
    [['openOrders', [{ title: 'Tea' }]]],
  )
  assert.equal(typeof kept['tent.pass'], 'string')
  const lines = Array.isArray(shown.content) ? shown.content : []
  assert.equal(lines.length, 1)
  assert.match(String(Object(lines[0]).text), /ordersScreen/)
  // An outcome that is not this screen is the tool's error: a caller who is nobody is asked to sign in.
  const visitor = await mcpApp(
    t,
    [{ from: 'mcp: { toolsListed: 1 }', to: 'mcp: { toolsListed: 1, anyone: true }' }],
    'mcpScreened',
  )
  const refused = await visitor.mcp().call('ordersScreen', {})
  assert.equal(refused.isError, true)
  assert.equal(errorOf(refused).code, 'T0006')
})

/** The edits of the project of a screen in a chat with a toolsListed, `countAll` for the model, and a screen that calls `pressCounted` by its code. */
const frameEdits = (listed: number) => [
  { from: 'mcp: { toolsListed: 1 }', to: `mcp: { toolsListed: ${listed} }` },
  {
    file: 'functions.ts',
    from: "which no screen in a chat reads',",
    to: "which no screen in a chat reads',\n  offer: ['mcp'],",
  },
  {
    file: 'functions.ts',
    from: 'export const countAll',
    to: "export const pressCounted = change('pressCounted', {\n  about: 'Notes a press of the counted screen',\n  access: 'signedIn',\n  offer: ['mcp'],\n  input: {},\n  output: number(),\n  run: () => 1,\n})\n\nexport const countAll",
  },
  {
    file: 'counted.tsx',
    from: "import { screen, read } from 'tentjs/ui'\nimport { openOrders } from './functions'",
    to: "import { screen, read, useCall } from 'tentjs/ui'\nimport { openOrders, pressCounted } from './functions'",
  },
  {
    file: 'counted.tsx',
    from: '    const [pressed, setPressed] = useState(0)\n',
    to: '    const [pressed, setPressed] = useState(0)\n    const press = useCall(pressCounted)\n',
  },
  {
    file: 'counted.tsx',
    from: 'onClick={() => setPressed(pressed + 1)}',
    to: 'onClick={() => void press.call({}).then(() => setPressed(pressed + 1))}',
  },
]

test('[25-9] a function that only a screen in a chat uses, by its data or by its code, is told as callable by the frame alone, and findFunction answers it not', async (t) => {
  const app = await mcpApp(t, frameEdits(10), 'mcpScreened')
  const { ada } = await people(app)
  const tools = await app.mcp({ as: ada }).tools()
  const seen = (name: string): unknown => Object(Object(tools.find((one) => one.name === name))._meta).ui
  for (const name of ['openOrders', 'addOrder', 'pressCounted'])
    assert.deepEqual(Object(seen(name)).visibility, ['app'], `${name} is for the frame alone`)
  assert.equal(Object(seen('countAll')).visibility, undefined, 'countAll is the model too')
  assert.equal(Object(seen('ordersScreen')).visibility, undefined, "a screen's tool is the model's")
  // Above toolsListed the pair stands in their place, and what findFunction answers is the model's alone.
  const above = await mcpApp(t, frameEdits(1), 'mcpScreened')
  const found = await above.mcp({ as: (await people(above)).ada }).call('findFunction', { words: '' })
  assert.deepEqual(
    Object(found.structuredContent).functions.map((one: unknown) => Object(one).name),
    ['countAll'],
    JSON.stringify(found),
  )
})

test("[25-9] the text of every answer holds all that the model is to have: the value, a failure's words and fix and fields, and a screen's data, with words that say the screen is offered", async (t) => {
  const app = await mcpApp(t, frameEdits(10), 'mcpScreened')
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  await client.call('addOrder', { title: 'Tea' })
  const counted = await client.call('countAll', {})
  assert.deepEqual(JSON.parse(textOf(counted)), counted.structuredContent)
  const taken = await client.call('addOrder', { title: 'Taken' })
  const short = await client.call('addOrder', { title: 'ab' })
  for (const one of [taken, short]) {
    const error = errorOf(one)
    assert.equal(one.isError, true)
    for (const said of [error.code, error.message, error.fix, ...Object.values(Object(error.fields))])
      if (typeof said === 'string') assert.ok(textOf(one).includes(said), `${said} is in ${textOf(one)}`)
  }
  const shown = await client.call('ordersScreen', {})
  const text = textOf(shown)
  assert.doesNotMatch(text, /shown/, 'no screen is said to be shown, which the chat app may not do')
  assert.match(text, /ordersScreen/)
  assert.match(text, /offered/)
  assert.match(text, /Tea/, "the screen's data is in the text")
})

/** What Claude sends with each request of the newest form, as it was heard: its version, who it is and the extension. */
const claudeMeta = (name: string) => ({
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name, version: name === 'claude-ai' ? '0.1.0' : '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
  },
})

test('[25-1] [25-9] the requests that Claude sends, as they were written down from it, are answered as they stand, in the newest form and the older one, and `Mcp-Name` is held to the body', async (t) => {
  const app = await mcpApp(
    t,
    [{ from: "title: 'Shop',", to: "title: 'Shop',\n  privateHosts: ['http://127.0.0.1']," }],
    'mcpScreened',
  )
  const { ada } = await people(app)
  // Claude is a chat app that a person signed in, with a token that reads and writes.
  const chat = await chatApp(t)
  const { access: key } = await signedFor(app, ada, {
    client: chat.id,
    redirect: 'https://chat.example/callback',
    scope: 'read write',
  })
  const sent = async (lines: Record<string, string>, body: object) => {
    const answer = await app.request(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          ...lines,
        },
        body: JSON.stringify(body),
      }),
    )
    const text = await answer.text()
    return {
      status: answer.status,
      session: answer.headers.get('mcp-session-id'),
      body: text === '' ? {} : Object(JSON.parse(text)),
    }
  }
  const newest = (method: string, name?: string) => ({
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
    ...(name === undefined ? {} : { 'mcp-name': name }),
  })
  // The newest form: the probe with an id that is text, the list of the Toolbox with nothing it can do, a call.
  const probe = await sent(newest('server/discover'), {
    jsonrpc: '2.0',
    id: 'server-discover-probe-1',
    method: 'server/discover',
    params: { _meta: claudeMeta('claude-ai') },
  })
  assert.equal(probe.body.id, 'server-discover-probe-1')
  assert.ok(Object(probe.body.result).supportedVersions.includes('2026-07-28'), JSON.stringify(probe.body))
  const listed = await sent(newest('tools/list'), {
    jsonrpc: '2.0',
    id: 281214151,
    method: 'tools/list',
    params: {
      _meta: {
        ...claudeMeta('Anthropic/Toolbox'),
        'io.modelcontextprotocol/clientCapabilities': {},
        traceparent: '00-a42e40397a8a557072ec1fa98c03f9ce-552be8cdfa1ea8b8-01',
      },
    },
  })
  assert.equal(listed.body.id, 281214151)
  const uri = String(
    Object(Object(Object(listed.body.result).tools.find((one: unknown) => Object(one).name === 'ordersScreen'))._meta)
      .ui.resourceUri,
  )
  const called = await sent(newest('tools/call', 'ordersScreen'), {
    jsonrpc: '2.0',
    id: 460680427,
    method: 'tools/call',
    params: { _meta: claudeMeta('Anthropic/ClaudeAI'), arguments: {}, name: 'ordersScreen' },
  })
  assert.equal(Object(called.body.result).isError, undefined, JSON.stringify(called.body))
  const read = await sent(newest('resources/read', uri), {
    method: 'resources/read',
    params: { uri, _meta: claudeMeta('claude-ai') },
    jsonrpc: '2.0',
    id: 1,
  })
  assert.equal(Object(read.body.result).contents[0].uri, uri)
  // A name in the line that is not the one of the body is refused, as a method is.
  const other = await sent(newest('tools/call', 'addOrder'), {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { _meta: claudeMeta('Anthropic/ClaudeAI'), arguments: {}, name: 'ordersScreen' },
  })
  assert.match(JSON.stringify(other.body), /T0002/)
  const otherFile = await sent(newest('resources/read', 'ui://shop/other.html'), {
    jsonrpc: '2.0',
    id: 8,
    method: 'resources/read',
    params: { uri, _meta: claudeMeta('claude-ai') },
  })
  assert.match(JSON.stringify(otherFile.body), /T0002/)
  // The older form, as Claude falls back to it: the opening with the method in its line and no version, the note,
  // and a call with both lines; no session of it is kept, and the newest form goes on beside it.
  const opened = await sent(
    { 'mcp-method': 'initialize' },
    {
      jsonrpc: '2.0',
      id: 546690813,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'Anthropic/ClaudeAI', version: '1.0.0' },
        capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
      },
    },
  )
  assert.equal(Object(opened.body.result).protocolVersion, '2025-11-25')
  assert.equal(opened.session, null, 'no session of the older form is kept')
  const noted = await sent(
    { 'mcp-protocol-version': '2025-11-25', 'mcp-method': 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
  )
  assert.equal(noted.status, 202)
  const olderCall = await sent(
    { 'mcp-protocol-version': '2025-11-25', 'mcp-method': 'tools/call', 'mcp-name': 'ordersScreen' },
    { jsonrpc: '2.0', id: 546690814, method: 'tools/call', params: { name: 'ordersScreen', arguments: {} } },
  )
  assert.equal(Object(olderCall.body.result).isError, undefined, JSON.stringify(olderCall.body))
  const again = await sent(newest('server/discover'), {
    jsonrpc: '2.0',
    id: 399969308,
    method: 'server/discover',
    params: { _meta: claudeMeta('Anthropic/ClaudeAI') },
  })
  assert.equal(again.body.id, 399969308)
  assert.ok(Object(again.body.result).supportedVersions, JSON.stringify(again.body))
})

test('[25-9] the pass of a frame calls the member of an agent that its screen calls, at the app, and no other member', async (t) => {
  const app = await mcpApp(
    t,
    [
      {
        file: 'screens.tsx',
        from: "  path: '/form',\n  access: 'signedIn',",
        to: "  path: '/form',\n  access: 'signedIn',\n  about: 'The form of the helper',\n  offer: ['mcp'],",
      },
      {
        file: 'screens.tsx',
        from: '      {working.map(',
        to: '      <Form call={helper.stop}>\n        <button type="submit">Stop</button>\n      </Form>\n      {working.map(',
      },
      {
        file: 'functions.ts',
        from: "  memory: { in: messages, thread: 'chat' },",
        to: "  memory: { in: messages, thread: 'chat' },\n  offer: ['mcp'],",
      },
    ],
    'assisted',
  )
  const ada = await app.user({ name: 'Ada', roles: [] })
  const shown = await app.mcp({ as: ada }).call('formScreen', {})
  assert.notEqual(shown.isError, true, JSON.stringify(shown))
  const pass = String(Object(shown._meta)['tent.pass'])
  const posted = (path: string) =>
    app.request(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${pass}`, 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }),
    )
  // The member is reached as the caller: its own answer to an input that names no run is T0002, and no refusal.
  const stopped = await posted('/_t/call/helper.stop')
  assert.match(await stopped.text(), /T0002/)
  const other = await posted('/_t/call/helper.approve')
  assert.ok([401, 403].includes(other.status), `a member that the screen does not call is refused: ${other.status}`)
})

test('[05-13.14] a screen in a chat that calls a function which is not offered to MCP is answered T0001', async (t) => {
  const app = await mcpApp(t, [], 'mcpScreened')
  const { ada } = await people(app)
  const answer = await app.mcp({ as: ada }).call('countAll', {})
  assert.equal(answer.isError, true)
  assert.equal(errorOf(answer).code, 'T0001')
})

test("[25-9] [05-13.39] [05-13.44] the pass of a frame reads the queries that the screen's answer named and no other, from a frame of no site, and is refused after its time, for a write, with a cookie from another site and in the address of a call", async (t) => {
  const app = await mcpApp(t, [], 'mcpScreened')
  const { ada } = await people(app)
  const shown = await app.mcp({ as: ada }).call('ordersScreen', {})
  const pass = String(Object(shown._meta)['tent.pass'])
  const asked = async (path: string, lines: Record<string, string>): Promise<Record<string, unknown>> => {
    const answer = await app.request(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'null', ...lines },
        body: JSON.stringify({ input: {} }),
      }),
    )
    return Object(await answer.json())
  }
  const bearer = { authorization: `Bearer ${pass}` }
  const named = await asked('/_t/read/openOrders', bearer)
  assert.equal(named.ok, true, JSON.stringify(named))
  const other = await asked('/_t/read/countAll', bearer)
  assert.equal(Object(other.error).code, 'T0006', 'a query that the answer did not name is read by nobody')
  const written = await asked('/_t/call/addOrder', bearer)
  assert.equal(Object(written.error).code, 'T0006', 'a pass makes no write')
  const cookied = await asked('/_t/read/openOrders', {
    ...bearer,
    cookie: 'tent_session.shop=x',
    origin: 'https://evil.example',
  })
  assert.equal(Object(cookied.error).code, 'T0004', 'with a cookie, the origin rule holds')
  const inAddress = await asked(`/_t/read/openOrders?pass=${encodeURIComponent(pass)}`, {})
  assert.equal(
    Object(inAddress.error).code,
    'T0004',
    'a pass in the address of a call is not read: the origin rule holds',
  )
  app.clock.advance('11 minutes')
  const late = await asked('/_t/read/openOrders', bearer)
  assert.equal(Object(late.error).code, 'T0004', 'a pass after its time opens nothing: the origin rule holds')
})

test("[25-9] in a frame of a chat app the screen is drawn, a press calls the function's tool through the chat app above toolsListed and the screen is asked again, a failed call shows its words under its field, a goTo asks for an address to be opened, and the frame opens the live connection with its pass", async (t) => {
  const { host, at } = await chatServed(t, 'ordersScreen')
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const sockets: string[] = []
      page.on('websocket', (socket) => sockets.push(socket.url()))
      await page.goto(`${host.origin}/`)
      const frame = page.frameLocator('iframe')
      await frame.getByRole('heading', { name: /\d+ orders/ }).waitFor()
      const before = Number(/^(\d+)/.exec(String(await frame.getByRole('heading').textContent()))?.[1])
      await frame.locator('[id="newTitle"]').fill(`Tea in ${engine}`)
      await frame.getByText('Add the order').click()
      await frame.getByRole('heading', { name: `${before + 1} orders` }).waitFor()
      await frame.getByText(`Tea in ${engine}`).waitFor()
      const asked = Object(await page.evaluate((name) => Reflect.get(window, name), 'asked'))
      assert.ok(asked.includes('addOrder') && asked.includes('ordersScreen'), `${engine}: ${String(asked)}`)
      // A call that the function refuses shows the function's words under its field.
      await frame.locator('[id="newTitle"]').fill('Taken')
      await frame.getByText('Add the order').click()
      // A native field is told the words through the browser's own check of the field.
      await frame.locator('[id="newTitle"]').evaluate(
        (field) =>
          new Promise<void>((done) => {
            const told = (): void =>
              field instanceof HTMLInputElement && field.validationMessage === 'That title is taken.'
                ? done()
                : void setTimeout(told, 10)
            told()
          }),
      )
      await frame.getByText('About the shop').click()
      await page.waitForFunction(() => Object(Reflect.get(window, 'opened')).length > 0)
      const opened = Object(await page.evaluate((name) => Reflect.get(window, name), 'opened'))
      assert.equal(opened[0], `${at.address}/about`)
      assert.ok(
        sockets.some((one) => one.includes('/_t/live') && one.includes('pass=')),
        `${engine}: the frame opens the live connection with its pass: ${sockets.join(' ')}`,
      )
    })
})

test('[25-9] a screen is shown in a frame the same way, and an answer of another version shows the line that the view is out of date', async (t) => {
  const { host, at } = await chatServed(t, 'countedScreen')
  await inBrowser('chromium', async (page) => {
    // A frame that may connect nowhere asks its tool again every `frameAsk`, which is how it learns of the new version.
    await page.goto(`${host.origin}/?closed`)
    const frame = page.frameLocator('iframe')
    await frame.getByRole('heading', { name: /\d+ counted/ }).waitFor()
    await frame.getByText('Pressed 0').click()
    await frame.getByText('Pressed 1').waitFor()
    // A new version runs: the frame that shows the old one says so once it asks its tool again.
    const source = join(at.bundleFolder, '..', '..', '..')
    const file = join(source, 'functions.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('The orders that the caller placed', 'The orders of the caller'),
    )
    const again = await buildProject(source, { for: 'release' })
    await at.app.switch(await at.app.add(again.bundleFolder))
    await frame.getByText(/out of date/).waitFor({ timeout: 10_000 })
  })
})

test('[25-9] a frame that may connect nowhere asks its tool again, and with the pass a picture of a file is loaded', async (t) => {
  const { host, at, ada, key } = await chatServed(t, 'ordersScreen')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const uploaded = await at.app.request(
    new Request(`${at.address}/_t/files?name=dot.png`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'image/png', 'content-length': String(png.length) },
      body: new Uint8Array(png),
    }),
  )
  const photo = String(Object(Object(await uploaded.json()).value).id)
  // The file is handed in by the key, so it is the key that names it in a row.
  const added = await at.app.request(
    new Request(`${at.address}/_t/call/addOrder`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: { title: 'With a photo', photo } }),
    }),
  )
  assert.equal(added.status, 200, await added.clone().text())
  const as = { as: { kind: 'user' as const, user: { id: ada, roles: [] } } }
  await inBrowser('chromium', async (page) => {
    await page.goto(`${host.origin}/?closed`)
    const frame = page.frameLocator('iframe')
    await frame.getByRole('heading', { name: '1 orders' }).waitFor()
    // A write that the frame did not make reaches it when it asks its tool again, every `frameAsk`.
    await at.app.call('addOrder', { title: 'From elsewhere' }, as)
    await frame.getByRole('heading', { name: '2 orders' }).waitFor({ timeout: 10_000 })
  })
  await inBrowser('chromium', async (page) => {
    const pictures: number[] = []
    page.on('response', (answer) => {
      if (answer.url().includes(photo) && answer.url().includes('pass=')) pictures.push(answer.status())
    })
    await page.goto(`${host.origin}/`)
    const frame = page.frameLocator('iframe')
    await frame.locator('img.photo[srcset], img.photo[src]').first().waitFor()
    await untilWithin('the picture of a file is loaded with the pass', () => pictures.includes(200))
  })
})
