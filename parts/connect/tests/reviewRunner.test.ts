import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Terminal } from '../../core/index.ts'
import { keptIn } from '../cli/commandRun.ts'
import { watched } from '../cli/watched.ts'
import type { Reach } from '../env.ts'
import { runCommandLine } from '../index.ts'

/** A folder of the runner of its own for one test, removed when the test ends. */
function homeOf(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), 'tent-review-runner-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  return home
}

/** A terminal that keeps what was printed, with no person at it. */
function terminalOf(): { terminal: Terminal; out: string[]; err: string[] } {
  const [out, err]: string[][] = [[], []]
  const terminal: Terminal = {
    write: (text) => void out.push(text),
    error: (text) => void err.push(text),
    raw: (text) => void out.push(text),
    line: async () => undefined,
    keys: async function* () {},
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: false,
    color: false,
  }
  return { terminal, out, err }
}

/** A server that the runner reaches, as a test says it answers each path and request. */
function serverOf(answer: (path: string, request: Request) => Promise<Response | undefined> | Response | undefined): {
  reach: Reach
  asked: string[]
} {
  const asked: string[] = []
  const reach: Reach = {
    request: async (request) => {
      const { pathname, search } = new URL(request.url)
      asked.push(`${pathname}${search}`)
      return (
        (await answer(pathname, request)) ?? Response.json({ ok: false, error: { code: 'T0001', message: 'none' } })
      )
    },
    live: async () => {
      throw new Error('no live connection in this test')
    },
  }
  return { reach, asked }
}

const listOf = (commands: Record<string, object>) => ({
  ok: true,
  value: { app: 'shop', name: 'shop', version: 'v1', needsEngine: '0.0.0', commands },
})

const target = { address: 'https://server.test', local: false }

/** A server whose one command, named look, is written in code, by the module given, and that the runner was told to add. */
function codeServer(home: string, code: string, answer: (path: string) => Response | undefined) {
  const bytes = new TextEncoder().encode(code)
  const name = `look.${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.js`
  mkdirSync(join(home, 'cli', 'server.test'), { recursive: true })
  writeFileSync(join(home, 'cli', 'server.test', 'added.json'), '{"address":"https://server.test","name":"shop"}')
  const commands = {
    look: { definition: 'look', kind: 'command', at: 'call', input: {}, module: `cli/${name}`, export: 'c' },
  }
  return serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    if (path === `/_t/b/cli/${name}`) return new Response(bytes)
    return answer(path)
  })
}

test('[24-14] `call` and `read` of a command written in code answer the value itself: true, a number and a text', async (t) => {
  const home = homeOf(t)
  const { reach } = codeServer(
    home,
    'export const c = { options: { run: async ({ call, read, terminal }) => { const paid = await read({ definition: "paid", kind: "query" }, {}); const count = await call({ definition: "count", kind: "action" }, {}); const name = await read({ definition: "name", kind: "query" }, {}); terminal.write([typeof paid, paid === true, typeof count, count === 3, typeof name, name === "ada"].join(" ")) } } }',
    (path) => {
      if (path === '/_t/read/paid') return Response.json({ ok: true, value: true })
      if (path === '/_t/call/count') return Response.json({ ok: true, value: 3 })
      if (path === '/_t/read/name') return Response.json({ ok: true, value: 'ada' })
      return undefined
    },
  )
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 0, err.join(''))
  assert.equal(out.join(''), 'boolean true number true string true')
})

test('[24-14] an upload of a command written in code that the app refuses fails, and answers no id', async (t) => {
  const home = homeOf(t)
  const file = join(home, 'sent.txt')
  writeFileSync(file, 'the bytes')
  const { reach } = codeServer(
    home,
    `export const c = { options: { run: async ({ upload, terminal }) => { try { const id = await upload(${JSON.stringify(file)}); terminal.write(\`id \${id}\`) } catch { terminal.write('refused') } } } }`,
    (path) =>
      path === '/_t/files'
        ? Response.json({ ok: false, error: { code: 'T3101', name: 'not-allowed', message: 'No.' } })
        : undefined,
  )
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 0, err.join(''))
  assert.equal(out.join(''), 'refused')
})

test('[05-12.20] a host whose name holds colons, as an address of IPv6 does, is kept under a folder with hyphens', (t) => {
  const home = homeOf(t)
  for (const address of ['https://[2001:db8::1]:8443', 'https://[::1]:3000', 'https://shop.example:8443']) {
    const folder = basename(keptIn(home, { address }))
    assert.doesNotMatch(folder, /:/, `${address} is kept under ${folder}`)
  }
})

test('[24-13] after a yes, a flow whose run outlasts the call is asked for again with `{ run }` until it ends', async (t) => {
  const home = homeOf(t)
  const commands = {
    'close-month': { definition: 'closeMonth', kind: 'flow', at: 'call', input: {}, danger: 'ask' },
  }
  const { reach, asked } = serverOf(async (path, request) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path !== '/_t/call/closeMonth') return undefined
    const input: unknown = Reflect.get(Object(await request.json()), 'input')
    if (Reflect.get(Object(input), 'run') === 'r1') return Response.json({ ok: true, value: 'closed' })
    if (request.headers.get('tent-agreed') !== 'the text')
      return Response.json({
        ok: false,
        error: { code: 'T7120', name: 'ask', message: 'A person says yes first.', fields: { ask: 'the text' } },
      })
    return Response.json({
      ok: false,
      error: { code: 'T0008', name: 'too-long', message: 'The run goes on.', fields: { run: 'r1' } },
    })
  })
  const { terminal, out, err } = terminalOf()
  const ended = await runCommandLine({ words: ['--yes', 'close-month'], terminal, reach, home, target, env: {} })
  assert.equal(ended, 0, err.join(''))
  assert.equal(out.join(''), 'closed\n')
  assert.equal(asked.filter((one) => one === '/_t/call/closeMonth').length, 3)
})

test('[24-15] an app built for a newer engine than the runner still runs its function commands: only a module is refused', async (t) => {
  const home = homeOf(t)
  const { reach } = serverOf((path) => {
    if (path === '/_t/cli')
      return Response.json({
        ok: true,
        value: {
          app: 'shop',
          name: 'shop',
          version: 'v1',
          needsEngine: '99.0',
          commands: { look: { definition: 'look', kind: 'function', at: 'call', input: {} } },
        },
      })
    if (path === '/_t/call/look') return Response.json({ ok: true, value: 'looked' })
    return undefined
  })
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 0, err.join(''))
  assert.equal(out.join(''), 'looked\n')
})

/** A live connection of a test: what was sent down it, and a way to send the runner a message. */
function liveOf(): { reach: Reach; sent: object[]; told(message: object): void; asked: string[] } {
  const sent: object[] = []
  const asked: string[] = []
  let heard: (message: object) => void = () => undefined
  const reach: Reach = {
    request: async (request) => {
      asked.push(new URL(request.url).pathname)
      // A new version runs now: the list of commands names it.
      return Response.json({ ok: true, value: { ...listOf({}).value, version: 'v2' } })
    },
    live: async () => ({
      send: (message) => void sent.push(message),
      each: (fn) => {
        heard = fn
      },
      close: () => undefined,
    }),
  }
  return { reach, sent, told: (message) => heard(message), asked }
}

test('[24-14] a watch that is told of a new version asks for the commands again, and watches again under it', async () => {
  const live = liveOf()
  const stop = watched(live.reach, 'v1', 'openOrders', {}, () => undefined)
  await new Promise((done) => setTimeout(done, 20))
  live.told({ t: 'result', id: 'w1', value: [], mark: 'm1' })
  live.told({ t: 'reload' })
  await new Promise((done) => setTimeout(done, 20))
  stop()
  assert.ok(live.asked.includes('/_t/cli'), `the commands are not asked for again: ${live.asked.join(' ')}`)
  const watches = live.sent.filter((one) => Reflect.get(one, 't') === 'watch')
  assert.equal(watches.length, 2, JSON.stringify(live.sent))
  assert.equal(Reflect.get(watches[1], 'version'), 'v2')
})

test('[24-14] a watch whose live connection cannot be opened lets no failure out that nobody waits for', async (t) => {
  const unseen: unknown[] = []
  const heard = (reason: unknown): void => void unseen.push(reason)
  process.on('unhandledRejection', heard)
  t.after(() => process.off('unhandledRejection', heard))
  const reach: Reach = {
    request: async () => Response.json({}),
    live: async () => {
      throw new Error('the engine cannot be reached')
    },
  }
  const stop = watched(reach, 'v1', 'openOrders', {}, () => undefined)
  await new Promise((done) => setTimeout(done, 50))
  stop()
  assert.deepEqual(
    unseen.map((one) => String(one)),
    [],
  )
})
