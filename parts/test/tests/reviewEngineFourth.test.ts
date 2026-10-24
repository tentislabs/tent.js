import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { lockedTool } from '../../connect/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { heavyWith, joined, system, untilAsync } from './heavyApps.ts'
import { mcpApp } from './mcpApp.ts'
import type { StandTool } from './outsideServer.ts'
import { outsideServer } from './outsideServer.ts'
import { listened } from './probe.ts'
import { closing, copyOf } from './projects.ts'
import { chatApp, signedFor } from './signedFor.ts'
import { notDropped } from './started.ts'

/** Waits a while of the wall clock, for what timers of the app set off to settle. */
const settled = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

test('[25-9] [05-13.39] the pass of a frame made for a token that may only read is that token narrowed: it calls no member that changes', async (t) => {
  // The chat app of the tests serves its document from this computer, which the engine may then reach.
  const app = await mcpApp(
    t,
    [
      { from: "title: 'Board',", to: "title: 'Board',\n  privateHosts: ['http://127.0.0.1']," },
      {
        file: 'screens.tsx',
        from: "  path: '/form',\n  access: 'signedIn',",
        to: "  path: '/form',\n  access: 'signedIn',\n  about: 'The form of the helper',\n  offer: ['mcp'],",
      },
      // The screen reads nothing that a token which may only read is refused, and offers to stop a run.
      { file: 'screens.tsx', from: 'import { screen, read, ', to: 'import { screen, ' },
      {
        file: 'screens.tsx',
        from: '  data: { working: read(helper.working, {}) },\n  view: ({ working }) => (',
        to: '  view: () => (',
      },
      {
        file: 'screens.tsx',
        from: '      {working.map((entry, place) => <span key={place}>Working: {entry.state} {entry.text}</span>)}',
        to: '      <Form call={helper.stop}>\n        <button type="submit">Stop</button>\n      </Form>',
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
  const chat = await chatApp(t)
  const { access } = await signedFor(app, ada, {
    client: chat.id,
    redirect: 'https://chat.example/callback',
    scope: 'read',
  })
  const shown = await app.mcp({ as: { token: access } }).call('formScreen', {})
  assert.notEqual(shown.isError, true, JSON.stringify(shown))
  const pass = String(Object(shown._meta)['tent.pass'])
  assert.ok(pass.startsWith('pass.'), 'the screen tool answers a pass')
  const stopped = await app.request(
    new Request('http://localhost/_t/call/helper.stop', {
      method: 'POST',
      headers: { authorization: `Bearer ${pass}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    }),
  )
  const said = await stopped.text()
  // Reached, the member answers T0002 for an input that names no run: the pass called it as the person in full.
  assert.doesNotMatch(said, /T0002/, 'the pass of a token that may only read called a member that changes')
  assert.equal(stopped.status, 403, said)
})

test('[51-8] the bytes of a file that the writer removed are taken out of fetched/ of the worker that holds them', async (t) => {
  const app = await heavyWith(t, '', "  limits: { inFrame: '0.3 KB' },\n")
  for (let i = 0; i < 8; i++) await app.call('addMark', { what: `a mark among many, number ${i}` }, system)
  const worker = await joined(t, app, ['gpu'])
  // The rows travel as a file that the writer made for this task alone, and removes, with its bytes, at its end.
  const { run } = notDropped(await app.start('withRows', undefined, system))
  assert.equal(await app.runs.wait(run), 8)
  assert.ok(worker.at().folder.fetched > 0, 'the worker fetched the file of the rows')
  await untilAsync('the worker was told that the bytes are gone', () => worker.at().folder.fetched === 0, 600)
})

test('[51-6] a file in a remembered answer is kept as long as the answer: a caller who is given it past filesKept reads its bytes', async (t) => {
  const folder = copyOf(t, 'remembers')
  const app = await testApp({ folder })
  closing(t, () => app.close())
  let made = 0
  listened(t, 'tentjs.test.remembers', (told) => {
    if (told === 'made') made += 1
    return made
  })
  const ada = { as: await app.user({ name: 'Ada' }) }
  const bo = { as: await app.user({ name: 'Bo' }) }
  await app.call('made', { n: 1 }, ada)
  // The file that the work made is loose: an hour on it is removed, and past filesKept its row and its bytes go.
  app.clock.advance('61 minutes')
  await settled(1500)
  app.clock.advance('8 days')
  await settled(1500)
  const theirs = String(await app.call('made', { n: 1 }, bo))
  assert.equal(made, 1, 'the remembered answer was given, within its 30 days')
  assert.equal(await app.call('textOf', { id: theirs }, bo), 'the bytes of 1', 'the file of the answer is gone')
})

/** A tool of a stand-in, by its name and its words, with an input of one text. */
const toolOf = (name: string, description: string): StandTool => ({
  name,
  description,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

// A stand-in for an outside MCP server that is a program: its one tool answers which of the named names of the
// environment the program was started with.
const programText = `import { createInterface } from 'node:readline'
const tools = [{ name: 'echo', description: 'Answers its environment', inputSchema: { type: 'object', properties: { words: { type: 'string' } } } }]
const write = (message) => void process.stdout.write(JSON.stringify(message) + '\\n')
const named = /^(HOME|USERPROFILE|APPDATA|TEMP|TMP|TMPDIR)$/i
for await (const line of createInterface({ input: process.stdin })) {
  let message
  try { message = JSON.parse(line) } catch { continue }
  if (message.id === undefined) continue
  const reply = (result) => write({ jsonrpc: '2.0', id: message.id, result })
  if (message.method === 'server/discover') reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, serverInfo: { name: 'program', version: '1' } })
  else if (message.method === 'tools/list') reply({ tools })
  else if (message.method === 'tools/call') reply({ content: [{ type: 'text', text: 'env: ' + Object.keys(process.env).filter((one) => named.test(one)).map((one) => one.toUpperCase()).sort().join(',') }] })
  else write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
}
`

/** The name a tool of an outside server is handed to a model under, as the request names it. */
const handed = (request: ReplyRequest, own: string): string =>
  request.tools?.find((one) => one.name.replace(/[^A-Za-z0-9]/g, '') === own.replace(/[^A-Za-z0-9]/g, ''))?.name ?? own

/** A faked model that calls the tool when a person spoke last, and else tells what the tool answered. */
const calling = (tool: string) => (request: ReplyRequest) => {
  const last = request.messages.at(-1)
  if (last?.who === 'user') return { calls: [{ tool: handed(request, tool), with: { words: 'one' } }] }
  const answer = request.messages.findLast((one) => one.who === 'tool')
  return {
    text: `Told: ${typeof answer?.result === 'string' ? answer.result : JSON.stringify(answer?.result ?? null)}`,
  }
}

/** The project of the outside servers, its program written by the test, with the tool of the program approved. */
async function programApp(t: TestContext) {
  const board = await outsideServer(t, { tools: [], answer: () => ({ content: [] }) })
  const folder = copyOf(t, 'outsided')
  const programs = join(folder, '..', 'program')
  mkdirSync(programs, { recursive: true })
  const program = join(programs, 'program.mjs')
  writeFileSync(program, programText)
  const file = join(folder, 'services.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replaceAll('http://127.0.0.1:1', board.remote.origin)
      .replace("['PROGRAM']", JSON.stringify([process.execPath, program])),
  )
  const echo = toolOf('echo', 'Answers its environment')
  const lock = {
    local: { tools: { echo: lockedTool({ name: 'echo', about: echo.description, schema: echo.inputSchema }) } },
  }
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  const app = await testApp({ folder, real: ['board', 'local'] })
  closing(t, () => app.close())
  return app
}

test("[25-11] a server started by `mcp: { command }` is started with the named environment of a Python program: the person's folder and the temporary folder among it", async (t) => {
  const app = await programApp(t)
  app.fake('writer', calling('local.echo'))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  const told = String(Object(await app.runs.wait(started.run)).text)
  const names = (/env: (\S*)/.exec(told)?.[1] ?? '').split(',').filter(Boolean)
  // On Windows the person's folder is two names: the one of the person, and the one where programs keep what is theirs.
  const home = (process.platform === 'win32' ? ['USERPROFILE', 'APPDATA'] : ['HOME']).filter(
    (one) => process.env[one] !== undefined,
  )
  assert.ok(
    home.every((one) => names.includes(one)),
    `the person's folder: ${told}`,
  )
  const temporary = ['TEMP', 'TMP', 'TMPDIR'].filter((one) => process.env[one] !== undefined)
  assert.ok(
    temporary.every((one) => names.includes(one)),
    `the temporary folder: ${told}`,
  )
})
