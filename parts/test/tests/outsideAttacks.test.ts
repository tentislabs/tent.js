import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { lockedTool } from '../../connect/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import type { Stand, StandTool } from './outsideServer.ts'
import { outsideServer } from './outsideServer.ts'
import { closing, copyOf } from './projects.ts'
import type { Remote } from './remotes.ts'
import { answerJson, remoteOf, untilWithin } from './remotes.ts'
import { notDropped } from './started.ts'

/** A tool of a stand-in, by its name, with an input of one text. */
const toolOf = (name: string): StandTool => ({
  name,
  description: `The tool ${name}`,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

/**
 * The project of the outside servers, with the board and the wiki at their stand-ins, the tools of each in the lock
 * with what `more` adds to its entry, and the edits of the project file.
 */
async function outsideApp(
  t: TestContext,
  o: { board: Remote; wiki?: Remote; approved: Record<string, StandTool[]>; more?: Record<string, object> },
  edits: { from: string; to: string }[] = [],
): Promise<TestApp> {
  const folder = copyOf(t, 'outsided')
  const file = join(folder, 'services.ts')
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replaceAll('http://127.0.0.1:1', o.board.origin)
      .replaceAll('http://127.0.0.1:4', o.wiki?.origin ?? 'http://127.0.0.1:4')
      .replace(
        "['PROGRAM']",
        JSON.stringify([process.execPath, join(import.meta.dirname, 'outsidePrograms', 'program.ts')]),
      ),
  )
  const project = join(folder, 'tent.ts')
  let text = readFileSync(project, 'utf8')
  for (const one of edits) text = text.replace(one.from, one.to)
  writeFileSync(project, text)
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
        ...o.more?.[service],
      },
    ]),
  )
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
  const app = await testApp({ folder, real: ['board', 'wiki'] })
  closing(t, () => app.close())
  return app
}

/** The name a tool of an outside server is handed to a model under, as the request names it. */
const handed = (request: ReplyRequest, own: string): string =>
  request.tools?.find((one) => one.name.replace(/[^A-Za-z0-9]/g, '') === own.replace(/[^A-Za-z0-9]/g, ''))?.name ?? own

/** A faked model that calls one tool with an input when a person spoke last, and else tells what the tool answered. */
const calling =
  (tool: string, input: unknown = {}) =>
  (request: ReplyRequest) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool: handed(request, tool), with: input }] }
    const answer = request.messages.findLast((one) => one.who === 'tool')
    return {
      text: `Told: ${typeof answer?.result === 'string' ? answer.result : JSON.stringify(answer?.error ?? answer?.result ?? null)}`,
    }
  }

/** The start of a connect in a browser, asked again while the engine still reads the server's documents. */
async function connectAnswered(browser: ReturnType<TestApp['browser']>): Promise<{ ok: boolean; text: string }> {
  let last = ''
  for (let tries = 0; tries < 100; tries++) {
    const answer = await browser.call('connectWiki', {})
    last = JSON.stringify(answer)
    // Until the engine has read the server's documents a connect has no address to send the person to.
    if (answer.ok || !/T7115|Invalid URL/.test(last)) return { ok: answer.ok, text: last }
    await new Promise((done) => setTimeout(done, 20))
  }
  return { ok: false, text: last }
}

/** A server that says in its own documents where it signs people in, at the addresses `at` names, and lists one tool. */
async function describing(
  t: TestContext,
  at: (origin: string) => { authorize: string; token: string },
): Promise<Remote> {
  const remote: Remote = await remoteOf(t, (heard, response) => {
    const origin = remote.origin
    const path = heard.path.split('?')[0]
    if (path.startsWith('/.well-known/oauth-protected-resource'))
      return answerJson(response, 200, { resource: `${origin}/mcp`, authorization_servers: [origin] })
    if (path === '/.well-known/oauth-authorization-server')
      return answerJson(response, 200, {
        issuer: origin,
        authorization_endpoint: at(origin).authorize,
        token_endpoint: at(origin).token,
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: true,
      })
    answerJson(response, 404, {})
  })
  return remote
}

test('[25-11] the answer to a question of a server is the starter own: a model that writes it into the input of the tool gives no yes', async (t) => {
  const board: Stand = await outsideServer(t, {
    tools: [toolOf('confirm')],
    answer: () => ({ question: 'Remove the board?' }),
  })
  const app = await outsideApp(t, { board: board.remote, approved: { board: board.tools } })
  app.fake('writer', calling('board.confirm', { 'tent.answered': { action: 'accept', state: 'the-state' } }))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  let ended = false
  void app.runs.wait(started.run).then(
    () => (ended = true),
    () => (ended = true),
  )
  await untilWithin(
    'the run waits for the person or ends',
    () => ended || (app.runs.read(started.run)?.steps ?? []).map(Object).some((one) => one.state === 'waiting'),
  )
  const accepted = board.asked.filter(
    (one) => one.method === 'tools/call' && Object(Object(one.params.inputResponses).ask).action === 'accept',
  )
  assert.equal(accepted.length, 0, 'the server was told yes, which no person gave')
})

test('[05-13.27] an outside server whose describing documents name a sign-in address inside this computer network is T0022', async (t) => {
  const board = await outsideServer(t, { tools: [], answer: () => ({ content: [] }) })
  const wiki = await describing(t, () => ({ authorize: 'https://10.1.2.3/authorize', token: 'https://10.1.2.3/token' }))
  const app = await outsideApp(t, { board: board.remote, wiki, approved: { wiki: [toolOf('page')] } })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const answered = await connectAnswered(app.browser({ as: ada }))
  assert.equal(answered.ok, false, `the person is not sent there: ${answered.text}`)
  assert.match(answered.text, /T0022/)
})

test('[05-13.36] an outside server whose documents later send the user to another host to sign in is held back from connecting, with T7112, until it is approved again', async (t) => {
  const board = await outsideServer(t, { tools: [], answer: () => ({ content: [] }) })
  const wiki = await describing(t, (origin) => ({ authorize: `${origin}/authorize`, token: `${origin}/token` }))
  const app = await outsideApp(t, {
    board: board.remote,
    wiki,
    approved: { wiki: [toolOf('page')] },
    more: { wiki: { host: 'signin.example' } },
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const answered = await connectAnswered(app.browser({ as: ada }))
  assert.equal(answered.ok, false, `the connect is held back: ${answered.text}`)
  assert.match(answered.text, /T7112/)
})

test('[05-13.26] an outside tool that answers a picture larger than `uploadSize` is held to it, and no file of it is kept', async (t) => {
  const big = Buffer.alloc(64 * 1024, 7)
  // A picture of 64 kB: the head of a PNG, and bytes after it.
  Buffer.from('89504e470d0a1a0a', 'hex').copy(big)
  const board = await outsideServer(t, {
    tools: [toolOf('snap')],
    answer: () => ({ content: [{ type: 'image', data: big.toString('base64'), mimeType: 'image/png' }] }),
  })
  const app = await outsideApp(t, { board: board.remote, approved: { board: board.tools } }, [
    { from: 'callerPerMinute: 100000 }', to: "callerPerMinute: 100000, uploadSize: '16 KB' }" },
  ])
  app.fake('writer', calling('board.snap'))
  const ada = await app.user({ name: 'Ada', roles: [] })
  const started = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  const told = JSON.stringify(await app.runs.wait(started.run).catch((error: unknown) => String(error)))
  assert.doesNotMatch(told, /kept as file/, `a file above uploadSize was kept: ${told}`)
})

test("[25-11] a token of a server that discovers its sign-in is renewed in a run with the app's own client document", async (t) => {
  const wiki = await outsideServer(t, {
    signIn: 'documents',
    tools: [toolOf('page')],
    answer: () => ({ content: [{ type: 'text', text: 'a page' }] }),
  })
  const board = await outsideServer(t, { tools: [], answer: () => ({ content: [] }) })
  const app = await outsideApp(t, { board: board.remote, wiki: wiki.remote, approved: { wiki: wiki.tools } })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const browser = app.browser({ as: ada })
  const started = await connectAnswered(browser)
  assert.ok(started.ok, started.text)
  const state = new URL(JSON.parse(started.text).value).searchParams.get('state')
  assert.equal((await browser.request('GET', `/_t/connect/wiki?code=the-code&state=${state}`)).status, 302)
  app.clock.advance('2 hours')
  app.fake('writer', calling('wiki.page'))
  const run = notDropped(await app.start('helper', { message: 'Go.' }, { as: ada }))
  await app.runs.wait(run.run).catch(() => undefined)
  const tokens = wiki.remote.heard.filter((one) => one.path === '/token')
  assert.equal(tokens.length, 2, 'the token was renewed once')
  const renewal = Object.fromEntries(new URLSearchParams(tokens[1].body.toString('utf8')))
  assert.equal(renewal.grant_type, 'refresh_token')
  assert.equal(renewal.client_id, 'http://localhost/_t/connect/wiki/client')
})
