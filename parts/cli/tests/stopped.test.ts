import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Reach } from '../../connect/index.ts'
import { runCommandLine } from '../../connect/index.ts'
import type { Terminal } from '../../core/index.ts'
import { fingerprintOf } from '../../core/internal.ts'

/** A folder of the runner of its own for one test, removed when the test ends. */
function homeOf(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), 'tent-stopped-'))
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

/** An app that the runner reaches, as the test answers each request, with the path and the body of each. */
function appOf(answer: (path: string, body: unknown, request: Request) => Promise<Response> | Response | undefined): {
  reach: Reach
  asked: { path: string; body: unknown }[]
} {
  const asked: { path: string; body: unknown }[] = []
  const reach: Reach = {
    request: async (request) => {
      const { pathname } = new URL(request.url)
      const text = request.body ? await request.text() : ''
      const body: unknown = text ? JSON.parse(text) : undefined
      asked.push({ path: pathname, body })
      return (await answer(pathname, body, request)) ?? Response.json({ ok: false, error: { code: 'T0001' } })
    },
    live: async () => {
      throw new Error('no live connection in this test')
    },
  }
  return { reach, asked }
}

const listOf = (commands: Record<string, object>, needsEngine = '1.0') =>
  Response.json({ ok: true, value: { app: 'shop', name: 'shop', version: 'v1', needsEngine, commands } })

/** An answer that never comes until the request is ended, when it fails as a request that was ended. */
const held = (request: Request): Promise<Response> =>
  new Promise((_, refuse) => request.signal.addEventListener('abort', () => refuse(request.signal.reason)))

test('[24-13] stopping the command while a run outlasts its call sends `{ run, stop: true }`', {
  timeout: 20_000,
}, async (t) => {
  const home = homeOf(t)
  const stop = new AbortController()
  const { reach, asked } = appOf((path, body, request) => {
    if (path === '/_t/cli') return listOf({ ship: { definition: 'ship', kind: 'flow', at: 'call', input: {} } })
    const input: unknown = Reflect.get(Object(body), 'input')
    if (Reflect.get(Object(input), 'stop') === true) return Response.json({ ok: true, value: 'stopped' })
    if (typeof Reflect.get(Object(input), 'run') === 'string') {
      setTimeout(() => stop.abort(), 50)
      return held(request)
    }
    return Response.json({
      ok: false,
      error: { code: 'T0008', name: 'too-slow', message: 'later', fields: { run: 'r1' } },
    })
  })
  const { terminal } = terminalOf()
  const ended = await runCommandLine({
    words: ['ship'],
    terminal,
    reach,
    home,
    target: { local: true },
    env: {},
    signal: stop.signal,
  })
  assert.deepEqual(asked.at(-1), { path: '/_t/call/ship', body: { input: { run: 'r1', stop: true } } })
  assert.equal(ended, 1)
})

test('[24-14] the `signal` of a command ends when the person stops the command', { timeout: 20_000 }, async (t) => {
  const home = homeOf(t)
  const stop = new AbortController()
  const code =
    'export const c = { options: { run: ({ signal }) => new Promise((done) => signal.addEventListener("abort", () => done(5))) } }'
  const module = `cli/waits.${fingerprintOf(new TextEncoder().encode(code)).slice(0, 12)}.js`
  const { reach } = appOf((path) => {
    if (path === '/_t/cli')
      return listOf({ waits: { definition: 'waits', kind: 'command', at: 'call', input: {}, module, export: 'c' } })
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    if (path.startsWith('/_t/b/cli/')) {
      setTimeout(() => stop.abort(), 50)
      return new Response(code)
    }
    return undefined
  })
  const { terminal, err } = terminalOf()
  const ended = await runCommandLine({
    words: ['waits'],
    terminal,
    reach,
    home,
    target: { local: true },
    env: {},
    signal: stop.signal,
  })
  assert.equal(ended, 5, err.join(''))
})

test('[24-13] a command written in code of an app that needs a newer engine than the runner is refused with its fix, and nothing is called', async (t) => {
  const home = homeOf(t)
  const { reach, asked } = appOf((path) => {
    if (path === '/_t/cli')
      return listOf(
        {
          look: {
            definition: 'look',
            kind: 'command',
            at: 'call',
            input: {},
            module: 'cli/look.0123456789ab.js',
            export: 'c',
          },
        },
        '99.0',
      )
    return Response.json({ ok: true, value: 'looked' })
  })
  const { terminal, err, out } = terminalOf()
  const ended = await runCommandLine({ words: ['look'], terminal, reach, home, target: { local: true }, env: {} })
  assert.equal(ended, 2)
  assert.match(err.join(''), /99\.0/)
  assert.equal(out.join(''), '')
  assert.deepEqual(
    asked.map((one) => one.path),
    ['/_t/cli'],
  )
})
