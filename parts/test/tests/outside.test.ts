import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { lockedTool } from '../../connect/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import type { Stand, StandAnswer, StandTool } from './outsideServer.ts'
import { outsideServer } from './outsideServer.ts'
import { closing, copyOf } from './projects.ts'
import { remoteOf, untilWithin } from './remotes.ts'
import { notDropped } from './started.ts'

/** A tool of a stand-in, by its name and its words, with an input of one text. */
const toolOf = (name: string, description = `The tool ${name}`): StandTool => ({
  name,
  description,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

/** A picture of one pixel, as a PNG. */
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** What the board answers each of its tools with. */
function boardAnswer(name: string): StandAnswer {
  if (name === 'big') return { content: [{ type: 'text', text: 'x'.repeat(2 * 1024 * 1024) }] }
  if (name === 'fails') return { content: [{ type: 'text', text: 'The board is locked.' }], isError: true }
  if (name === 'sample') return { asks: 'sampling/createMessage' }
  if (name === 'paint') return { samples: 'Name a color.' }
  if (name === 'confirm') return { question: 'Remove the board?' }
  if (name === 'snap') return { content: [{ type: 'image', data: png, mimeType: 'image/png' }] }
  if (name === 'link')
    return {
      content: [
        { type: 'text', text: `See ${linked.origin}/secret` },
        { type: 'resource_link', uri: `${linked.origin}/more`, name: 'more' },
      ],
    }
  return { content: [{ type: 'text', text: `${name} answered` }], structuredContent: { boards: [name] } }
}

// A site that an answer names, which nothing may fetch by itself.
let linked = { origin: '', heard: [] as unknown[] }

/** The stand-ins of a project of the outside servers, and the tools of each that the lock holds. */
interface Outsiders {
  board: Stand
  notes?: Stand
  cloud?: Stand
  wiki?: Stand
  team?: Stand
  program?: string
  approved: Record<string, StandTool[]>
  // Changes of the services file, each a text put in the place of another.
  services?: { from: string; to: string }[]
}

/** The project of the outside servers, with each address at its stand-in and the tools of each in the lock. */
async function outsideApp(t: TestContext, o: Outsiders): Promise<TestApp> {
  const app = await testApp({ folder: outsideFolder(t, o), real: ['board', 'notes', 'cloud', 'local', 'wiki', 'team'] })
  closing(t, () => app.close())
  return app
}

/** The folder of the project of the outside servers, written for its stand-ins. */
function outsideFolder(t: TestContext, o: Outsiders): string {
  const folder = copyOf(t, 'outsided')
  const file = join(folder, 'services.ts')
  const program = JSON.stringify([
    process.execPath,
    o.program ?? join(import.meta.dirname, 'outsidePrograms', 'program.ts'),
  ])
  let text = readFileSync(file, 'utf8')
  for (const one of o.services ?? []) {
    assert.ok(text.includes(one.from), `services.ts holds ${one.from}`)
    text = text.replace(one.from, one.to)
  }
  writeFileSync(
    file,
    text
      .replaceAll('http://127.0.0.1:1', o.board.remote.origin)
      .replaceAll('http://127.0.0.1:2', o.notes?.remote.origin ?? 'http://127.0.0.1:2')
      .replaceAll('http://127.0.0.1:3', o.cloud?.remote.origin ?? 'http://127.0.0.1:3')
      .replaceAll('http://127.0.0.1:4', o.wiki?.remote.origin ?? 'http://127.0.0.1:4')
      .replaceAll('http://127.0.0.1:5', o.team?.remote.origin ?? 'http://127.0.0.1:5')
      .replace("['PROGRAM']", program),
  )
  const lock = Object.fromEntries(
    Object.entries(o.approved).map(([service, tools]) => [
      service,
      {
        tools: Object.fromEntries(
          tools.map((one) => [
            one.name,
            lockedTool({ name: one.name, about: one.description, schema: one.inputSchema }),
          ]),
        ),
      },
    ]),
  )
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  return folder
}

/** The name a tool of an outside server is handed to a model under, as the request names it. */
const handed = (request: ReplyRequest, own: string): string =>
  request.tools?.find((one) => one.name.replace(/[^A-Za-z0-9]/g, '') === own.replace(/[^A-Za-z0-9]/g, ''))?.name ?? own

/** A faked model that calls one tool when a person spoke last, and else tells what the tool answered. */
const calling =
  (tool: string, input: unknown = {}) =>
  (request: ReplyRequest) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user' && !last.images) return { calls: [{ tool: handed(request, tool), with: input }] }
    const answer = request.messages.findLast((one) => one.who === 'tool')
    return {
      text: `Told: ${typeof answer?.result === 'string' ? answer.result : JSON.stringify(answer?.error ?? answer?.result ?? null)}`,
    }
  }

/** A run of an agent as a person of the app, to its end, and the text it answered. */
async function ran(app: TestApp, agent: string): Promise<string> {
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start(agent, { message: 'Go.' }, { as: ada }))
  return String(Object(await app.runs.wait(started.run)).text)
}

test.before(async () => {
  linked = { origin: '', heard: [] }
})

test('[25-11] a server that knows only the older form is asked in it, and a tool of it is called', async (t) => {
  const notes = await outsideServer(t, {
    older: true,
    tools: [toolOf('find')],
    answer: () => ({ content: [{ type: 'text', text: 'found three' }] }),
  })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, { board, notes, approved: { notes: notes.tools } })
  app.fake('writer', calling('notes.find', { words: 'tea' }))
  assert.equal(await ran(app, 'helper'), 'Told: found three')
  const methods = notes.asked.map((one) => one.method)
  assert.ok(methods.includes('initialize') && methods.includes('tools/call'), methods.join(' '))
  assert.deepEqual(Object(notes.asked.find((one) => one.method === 'tools/call')?.params.arguments), { words: 'tea' })
})

test('[25-11] a question of a server of the older form, put down the stream of the call, is an ask of the step, and the answer goes back down that stream', async (t) => {
  const notes = await outsideServer(t, { older: true, tools: [toolOf('confirm')], answer: boardAnswer })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, { board, notes, approved: { notes: notes.tools } })
  app.fake('writer', calling('notes.confirm'))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  let asked: Record<string, unknown> | undefined
  await untilWithin('the run waits for the person', () => {
    asked = (app.runs.read(started.run)?.steps ?? []).map(Object).find((one) => one.state === 'waiting')
    return asked !== undefined
  })
  assert.match(JSON.stringify(asked?.show), /Remove the board\?/)
  app.runs.approve(started.run, String(asked?.name))
  assert.equal(String(Object(await app.runs.wait(started.run)).text), 'Told: It was done.')
  const answers = notes.remote.heard
    .map((one) => Object(JSON.parse(one.body.toString('utf8') || '{}')))
    .filter((one) => one.id === 'question-1' && one.method === undefined)
  assert.deepEqual(
    answers.map((one) => Object(one.result).action),
    ['accept'],
  )
  assert.equal(notes.asked.filter((one) => one.method === 'tools/call').length, 1, 'the call is made once')
})

test("[25-11] [05-13.13] an answer over the result limit is T5102, a request of more than a question is T7115, a tool's own error words reach the model, and an address in an answer is never fetched", async (t) => {
  const site = await remoteOf(t, (_heard, response) => {
    response.writeHead(200)
    response.end('nothing')
  })
  linked = site
  const board = await outsideServer(t, {
    tools: ['big', 'sample', 'fails', 'link'].map((one) => toolOf(one)),
    answer: boardAnswer,
  })
  const app = await outsideApp(t, { board, approved: { board: board.tools } })
  app.fake('writer', calling('board.big'))
  assert.match(await ran(app, 'helper'), /T5102/)
  app.fake('writer', calling('board.sample'))
  assert.match(await ran(app, 'helper'), /T7115.*sampling\/createMessage/)
  app.fake('writer', calling('board.fails'))
  assert.match(await ran(app, 'helper'), /Error T7115: The board is locked\./)
  app.fake('writer', calling('board.link'))
  assert.match(await ran(app, 'helper'), new RegExp(`${site.origin}/secret`))
  assert.equal(site.heard.length, 0, 'no address of an answer is fetched')
})

test('[25-11] [25-20] [05-13.13] a tool whose description changed since it was approved is held back: it is not offered, and a call of it is T7112; the others go on', async (t) => {
  const board = await outsideServer(t, { tools: [toolOf('listBoards'), toolOf('renameBoard')], answer: boardAnswer })
  const approved = board.tools.map((one) => ({ ...one }))
  board.tools[1] = toolOf('renameBoard', 'Renames a board, and now mails everyone')
  const app = await outsideApp(t, { board, approved: { board: approved } })
  const offered: string[][] = []
  app.fake('writer', (request) => {
    offered.push((request.tools ?? []).map((one) => one.name))
    return calling('board.listBoards')(request)
  })
  assert.equal(await ran(app, 'helper'), 'Told: {"boards":["listBoards"]}')
  assert.ok(offered[0].some((one) => one.includes('listBoards')))
  assert.ok(!offered[0].some((one) => one.includes('renameBoard')), offered[0].join(' '))
  const ada = await app.user({ name: 'Ada', roles: [] })
  await assert.rejects(app.as(ada).call('renameIt', {}), { code: 'T7112' })
})

test("[25-11] a question with yes and no from a server becomes an ask of the tool's step, which the starter answers", async (t) => {
  const board = await outsideServer(t, { tools: [toolOf('confirm')], answer: boardAnswer })
  const app = await outsideApp(t, { board, approved: { board: board.tools } })
  app.fake('writer', calling('board.confirm'))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  let asked: Record<string, unknown> | undefined
  await untilWithin('the run waits for the person', () => {
    asked = (app.runs.read(started.run)?.steps ?? []).map(Object).find((one) => one.state === 'waiting')
    return asked !== undefined
  })
  assert.match(String(asked?.name), /^ask 1\.1/)
  assert.match(JSON.stringify(asked?.show), /Remove the board\?/)
  app.runs.approve(started.run, String(asked?.name))
  assert.equal(String(Object(await app.runs.wait(started.run)).text), 'Told: It was done.')
  const back = board.asked.filter((one) => one.method === 'tools/call').at(-1)
  assert.equal(Object(Object(back?.params.inputResponses).ask).action, 'accept')
  assert.equal(back?.params.requestState, 'the-state')
})

test('[25-11] a picture in an answer reaches a model that takes pictures as an image, and is a kept file with its id for one that does not', async (t) => {
  const board = await outsideServer(t, { tools: [toolOf('snap')], answer: boardAnswer })
  const app = await outsideApp(t, { board, approved: { board: board.tools } })
  const seen: ReplyRequest[] = []
  app.fake('seer', (request) => {
    seen.push(request)
    return calling('board.snap')(request)
  })
  await ran(app, 'looker')
  const images = seen.at(-1)?.messages.flatMap((one) => one.images ?? []) ?? []
  assert.equal(images.length, 1)
  assert.equal(images[0].kind, 'image/png')
  app.fake('writer', calling('board.snap'))
  const told = await ran(app, 'helper')
  const id = /\[A picture was kept as file ([0-9a-z]+)\.\]/.exec(told)?.[1]
  assert.ok(id, told)
})

test('[25-11] [27-6@9b] a picture of an outside tool is given to the model again when the tool row of a conversation is sent again', async (t) => {
  const board = await outsideServer(t, { tools: [toolOf('snap')], answer: boardAnswer })
  const app = await outsideApp(t, { board, approved: { board: board.tools } })
  const seen: ReplyRequest[] = []
  // The model calls the tool once in a conversation, and after that answers in words.
  app.fake('seer', (request) => {
    seen.push(request)
    if (!request.messages.some((one) => one.who === 'tool')) return calling('board.snap')(request)
    return { text: 'Seen.' }
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(ada).call('newChat', {})), 'id'))
  const first = notDropped(await app.start('rememberer', { message: 'Look.', thread: chat }, { as: ada }))
  await app.runs.wait(first.run)
  const before = seen.length
  const second = notDropped(await app.start('rememberer', { message: 'Again.', thread: chat }, { as: ada }))
  await app.runs.wait(second.run)
  const sent = seen.slice(before)
  assert.ok(sent.length > 0)
  const images = sent[0].messages.flatMap((one) => one.images ?? [])
  assert.equal(images.length, 1, 'the picture of the tool row is sent with it')
  assert.equal(images[0].kind, 'image/png')
})

test('[25-11] a model call that a server asks for is answered by the model that `mcp: { model }` names, and with none named it is T7115', async (t) => {
  const board = await outsideServer(t, { tools: [toolOf('paint')], answer: boardAnswer })
  const app = await outsideApp(t, {
    board,
    approved: { board: board.tools },
    services: [
      {
        from: "mcp: true, auth: { bearer: secret('BOARD_KEY') }",
        to: "mcp: { model: 'seer' }, auth: { bearer: secret('BOARD_KEY') }",
      },
    ],
  })
  app.fake('writer', calling('board.paint'))
  const asked: ReplyRequest[] = []
  app.fake('seer', (request) => {
    asked.push(request)
    return { text: 'Blue.' }
  })
  assert.equal(await ran(app, 'helper'), 'Told: Sampled: Blue.')
  assert.equal(asked.length, 1, 'the named model answered the server once')
  assert.match(JSON.stringify(asked[0].messages), /Name a color\./)
  const sampled = board.asked.filter((one) => one.method === 'tools/call').at(-1)
  assert.equal(sampled?.params.requestState, 'the-sample')
  // Without `mcp: { model }` the same tool fails with the words of what the server asked.
  const other = await outsideServer(t, { tools: [toolOf('paint')], answer: boardAnswer })
  const plain = await outsideApp(t, { board: other, approved: { board: other.tools } })
  plain.fake('writer', calling('board.paint'))
  assert.match(await ran(plain, 'helper'), /T7115.*sampling\/createMessage/)
})

test("[25-11] with `mcp: { keep: 'run' }` the session of a server of the older form is kept for the length of a run", async (t) => {
  const notes = await outsideServer(t, {
    older: true,
    tools: [toolOf('find')],
    answer: () => ({ content: [{ type: 'text', text: 'found' }] }),
  })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, {
    board,
    notes,
    approved: { notes: notes.tools },
    services: [
      { from: "url: 'http://127.0.0.1:2/mcp', mcp: true", to: "url: 'http://127.0.0.1:2/mcp', mcp: { keep: 'run' }" },
    ],
  })
  // The model calls the tool twice in one round, and then tells what it was answered.
  app.fake('writer', (request) => {
    if (request.messages.at(-1)?.who !== 'user') return { text: 'Done.' }
    const tool = handed(request, 'notes.find')
    return {
      calls: [
        { tool, with: { words: 'one' } },
        { tool, with: { words: 'two' } },
      ],
    }
  })
  // The session that each call of the tool was made in, by the line it named it in.
  const sessions = () =>
    notes.asked.filter((one) => one.method === 'tools/call').map((one) => one.headers['mcp-session-id'])
  await ran(app, 'helper')
  const [one, two] = sessions()
  assert.ok(one !== undefined && one === two, `both calls of the run are made in its one session: ${sessions()}`)
  await ran(app, 'helper')
  const [, , three, four] = sessions()
  assert.ok(three !== one && three === four, `another run opens a session of its own: ${sessions()}`)
})

test("[25-11] with `per: 'user'` a program is started for each user who needs it, and ended when it was not used for `pythonStopAfter`", async (t) => {
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const tools = [toolOf('echo', 'Answers what it is handed'), toolOf('quit', 'Ends the program')]
  tools[1].inputSchema = { type: 'object', properties: {} }
  const app = await outsideApp(t, {
    board,
    approved: { local: tools },
    services: [{ from: "mcp: { command: ['PROGRAM'] }", to: "mcp: { command: ['PROGRAM'], per: 'user' }" }],
  })
  app.fake('writer', calling('local.echo', { words: 'one' }))
  const pid = async (name: string): Promise<string> => {
    const caller = await app.user({ name, roles: [] })
    const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: caller }))
    const told = String(Object(await app.runs.wait(started.run)).text)
    return /from (\d+)$/.exec(told)?.[1] ?? told
  }
  const ada = await app.user({ name: 'Ada', roles: [] })
  const asAda = async (): Promise<string> => {
    const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
    const told = String(Object(await app.runs.wait(started.run)).text)
    return /from (\d+)$/.exec(told)?.[1] ?? told
  }
  const first = await asAda()
  assert.match(first, /^\d+$/)
  assert.notEqual(await pid('Bob'), first, 'another user has a program of their own')
  assert.equal(await asAda(), first, 'the same user is served by the same program')
  app.clock.advance('11 minutes')
  const later = await asAda()
  assert.match(later, /^\d+$/)
  assert.notEqual(later, first, 'a program not used for ten minutes was ended, and is started anew')
})

test("[25-11] a tool call with `oauth` is made with the connection of the run's user", async (t) => {
  const cloud = await outsideServer(t, {
    tools: [toolOf('whoami')],
    answer: () => ({ content: [{ type: 'text', text: 'you' }] }),
  })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, { board, cloud, approved: { cloud: cloud.tools } })
  const ada = await app.user({ name: 'Ada', roles: [] })
  await app.connection(ada, 'cloud')
  app.fake('writer', calling('cloud.whoami'))
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  assert.equal(String(Object(await app.runs.wait(started.run)).text), 'Told: you')
  const call = cloud.asked.find((one) => one.method === 'tools/call')
  assert.equal(call?.headers.authorization, `Bearer test-access-cloud-${ada.user?.id}`)
})

test("[25-11] [05-13.45] a server started by `mcp: { command }` is listed and called, and started again when it ends; a name with a space and a shell's signs is started with no shell", async (t) => {
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const folder = join(process.cwd(), 'results', 'test', `program ${process.pid} & more`)
  mkdirSync(folder, { recursive: true })
  const program = join(folder, 'program.ts')
  cpSync(join(import.meta.dirname, 'outsidePrograms', 'program.ts'), program)
  const tools = [toolOf('echo', 'Answers what it is handed'), toolOf('quit', 'Ends the program')]
  tools[1].inputSchema = { type: 'object', properties: {} }
  const app = await outsideApp(t, { board, program, approved: { local: tools } })
  app.fake('writer', calling('local.echo', { words: 'one' }))
  assert.match(await ran(app, 'helper'), /^Told: echo: one from \d+$/)
  app.fake('writer', calling('local.quit'))
  await ran(app, 'helper')
  app.fake('writer', calling('local.echo', { words: 'two' }))
  let told = ''
  // The program is started again after the wait of a failed step: until then a call of it fails.
  for (let tries = 0; tries < 30 && !/echo: two/.test(told); tries++) {
    told = await ran(app, 'helper')
    if (!/echo: two/.test(told)) await new Promise((done) => setTimeout(done, 500))
  }
  assert.match(told, /^Told: echo: two from \d+$/)
})

test('[05-13.26] a file that an outside tool names a picture and that is HTML is kept as the kind its bytes say, and reaches no model as a picture', async (t) => {
  const page = Buffer.from('<html><script>alert(1)</script></html>').toString('base64')
  const board = await outsideServer(t, {
    tools: [toolOf('snap')],
    answer: () => ({ content: [{ type: 'image', data: page, mimeType: 'image/png' }] }),
  })
  const app = await outsideApp(t, { board, approved: { board: board.tools } })
  const seen: ReplyRequest[] = []
  app.fake('seer', (request) => {
    seen.push(request)
    return calling('board.snap')(request)
  })
  const told = await ran(app, 'looker')
  assert.deepEqual(
    seen.flatMap((one) => one.messages.flatMap((message) => message.images ?? [])),
    [],
  )
  assert.match(told, /\[A picture was kept as file [0-9a-z]+\.\]/)
})

/** The start of a connect in a browser, asked again while the engine still reads the server's documents or registers. */
async function connectStarted(browser: ReturnType<TestApp['browser']>, action: string): Promise<URL> {
  for (let tries = 0; tries < 200; tries++) {
    const answer = await browser.call(action, {})
    if (answer.ok) return new URL(String(answer.value))
    await new Promise((done) => setTimeout(done, 20))
  }
  throw new Error(`${action} never started a connect`)
}

/** The fields of the body of a form that a stand-in was sent. */
const formOf = (body: Buffer): Record<string, string> => Object.fromEntries(new URLSearchParams(body.toString('utf8')))

test("[25-11] with `oauth: { discover: true }` the engine reads the server's own documents, serves its client document, and connects a user with no registration", async (t) => {
  const wiki = await outsideServer(t, {
    signIn: 'documents',
    tools: [toolOf('page')],
    answer: () => ({ content: [{ type: 'text', text: 'a page' }] }),
  })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, { board, wiki, approved: { wiki: wiki.tools } })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const browser = app.browser({ as: ada })
  const document = await browser.request('GET', '/_t/connect/wiki/client')
  assert.equal(document.status, 200)
  const client = Object(await document.json())
  assert.equal(client.client_id, 'http://localhost/_t/connect/wiki/client')
  assert.deepEqual(client.redirect_uris, ['http://localhost/_t/connect/wiki'])
  assert.equal(client.client_name, 'Shop')
  const address = await connectStarted(browser, 'connectWiki')
  assert.equal(`${address.origin}${address.pathname}`, `${wiki.remote.origin}/authorize`)
  assert.equal(address.searchParams.get('client_id'), 'http://localhost/_t/connect/wiki/client')
  assert.equal(address.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(address.searchParams.get('resource'), `${wiki.remote.origin}/mcp`)
  const back = await browser.request('GET', `/_t/connect/wiki?code=the-code&state=${address.searchParams.get('state')}`)
  assert.equal(back.status, 302)
  const token = wiki.remote.heard.find((one) => one.path === '/token')
  assert.ok(token, 'the code was changed for tokens')
  const sent = formOf(token.body)
  assert.equal(sent.client_id, 'http://localhost/_t/connect/wiki/client')
  assert.ok(sent.code_verifier)
  assert.equal(sent.client_secret, undefined)
  assert.ok(!wiki.remote.heard.some((one) => one.path === '/register'), 'nothing was registered')
  app.fake('writer', calling('wiki.page'))
  const run = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  assert.equal(String(Object(await app.runs.wait(run.run)).text), 'Told: a page')
  const called = wiki.asked.find((one) => one.method === 'tools/call')
  assert.equal(called?.headers.authorization, 'Bearer outside-access')
})

test('[25-11] a server that takes clients only by registering is registered with once, for the name the app was reached by', async (t) => {
  const team = await outsideServer(t, { signIn: 'registering', tools: [toolOf('members')], answer: boardAnswer })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const app = await outsideApp(t, { board, team, approved: { team: team.tools } })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const browser = app.browser({ as: ada })
  const first = await connectStarted(browser, 'connectTeam')
  const second = await connectStarted(browser, 'connectTeam')
  assert.equal(first.searchParams.get('client_id'), 'registered-1')
  assert.equal(second.searchParams.get('client_id'), 'registered-1')
  const registered = team.remote.heard.filter((one) => one.path === '/register')
  assert.equal(registered.length, 1)
  assert.deepEqual(Object(JSON.parse(registered[0].body.toString('utf8'))).redirect_uris, [
    'http://localhost/_t/connect/team',
  ])
})

test('[25-11] a server that takes clients only by registering is registered with when the app opens, before anyone connects', async (t) => {
  const team = await outsideServer(t, { signIn: 'registering', tools: [toolOf('members')], answer: boardAnswer })
  const board = await outsideServer(t, { tools: [], answer: boardAnswer })
  const folder = outsideFolder(t, { board, team, approved: { team: team.tools } })
  const made = await buildProject(folder, { for: 'dev' })
  assert.deepEqual(made.findings, [])
  // An app opened under a name of its own: a test app answers every name, and so knows none to register for.
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  await engine.open(made.bundleFolder, {
    dataFolder: join(folder, '..', 'data'),
    mode: 'test',
    address: 'shop.example',
  })
  const registers = () => team.remote.heard.filter((one) => one.path === '/register')
  await untilWithin('the app registers with the server', () => registers().length > 0)
  const named = registers().flatMap((one) => Object(JSON.parse(one.body.toString('utf8'))).redirect_uris)
  assert.deepEqual(named, ['https://shop.example/_t/connect/team'])
})
