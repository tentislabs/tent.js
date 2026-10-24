import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Reach } from '../../connect/index.ts'
import { runCommandLine } from '../../connect/index.ts'
import type { Terminal } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine, keptAlone } from '../../engine/index.ts'
import { browserSignIn } from '../signIn.ts'
import { copied } from './typed.ts'

const system = { kind: 'system' } as const

/** The app of these tests, served on this computer's own network, with a person in it and a folder of the runner. */
async function served(t: TestContext): Promise<{ app: App; address: string; home: string; ada: string }> {
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, `signed-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, 'signedCli')
  const built = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const data = join(project, '.tent')
  const app = await engine.open(built.bundleFolder, { dataFolder: data, mode: 'test' })
  const { port } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
  const home = join(project, '..', 'home')
  mkdirSync(home, { recursive: true })
  const made = await app.write([{ add: 'users', values: { email: 'ada@example.com', roles: [] } }], { as: system })
  return {
    app,
    address: `http://127.0.0.1:${port}`,
    home,
    ada: String(Object(Array.isArray(made) ? made[0] : made).id),
  }
}

/** A reach of the server over this computer's network, which follows no answer to another host. */
const reachOf = (address: string): Reach => ({
  request: (request) => {
    const url = new URL(request.url)
    return fetch(`${address}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
      ...(request.body ? { body: request.body, duplex: 'half' as const } : {}),
    })
  },
  live: () => {
    throw new Error('the tests of login open no live connection')
  },
})

/** A terminal that keeps what is written to it. */
function terminalOf(): { terminal: Terminal; out: string[]; err: string[] } {
  const [out, err]: string[][] = [[], []]
  return {
    out,
    err,
    terminal: {
      write: (text) => void out.push(text),
      error: (text) => void err.push(text),
      raw: (text) => void out.push(text),
      line: async () => undefined,
      keys: async function* () {},
      size: () => ({ columns: 80, rows: 24 }),
      onResize: () => () => undefined,
      interactive: false,
      color: false,
    },
  }
}

/**
 * The person at the browser: a session that the test made makes the browser them, they open the address the
 * command line opens, read the word of the page, allow, and the browser follows the answer back to the command
 * line's port.
 */
function person(app: App, address: string, user: string, seen: string[]): (url: string) => Promise<void> {
  return async (url) => {
    const cookie = app.session(user)
    const page = await fetch(url, { headers: { cookie }, redirect: 'manual' })
    const html = await page.text()
    seen.push(html)
    const text = /name="t" value="([^"]+)"/.exec(html)?.[1] ?? ''
    const allowed = await fetch(`${address}/_t/oauth/decide`, {
      method: 'POST',
      headers: { cookie, origin: address, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ t: text, answer: 'allow' }).toString(),
      redirect: 'manual',
    })
    const back = String(allowed.headers.get('location'))
    assert.match(back, /^http:\/\/127\.0\.0\.1:\d+\/callback\?/, 'the command line waits on a port of this computer')
    await (await fetch(back)).text()
  }
}

test('[25-8b] `login` opens the browser, the person is asked also the second time, and the tokens are kept in a file only the current user reads', async (t) => {
  const { app, address, home, ada } = await served(t)
  const seen: string[] = []
  const signIn = browserSignIn({ open: person(app, address, ada, seen) })
  const run = async (...words: string[]) => {
    const { terminal, out, err } = terminalOf()
    const code = await runCommandLine({
      words,
      terminal,
      reach: reachOf(address),
      home,
      target: { local: false, address },
      env: {},
      signIn,
    })
    return { code, out: out.join(''), err: err.join('') }
  }
  const first = await run('login')
  assert.equal(first.code, 0, first.err)
  const word = /word ([A-Z0-9_-]{6})/.exec(first.err + first.out)?.[1]
  assert.ok(word, 'the terminal prints the word of the page')
  assert.ok(seen[0].includes(word), 'the page shows the same word')
  assert.match(seen[0], /This program will act as you in the whole app/)
  const kept = join(home, 'keys.json')
  const held = JSON.parse(readFileSync(kept, 'utf8')).servers[address].app
  assert.ok(held.access && held.refresh && held.expiresAt, JSON.stringify(held))
  if (process.platform === 'win32') assert.equal(keptAlone(kept).why, undefined)
  else assert.equal(statSync(kept).mode & 0o077, 0)
  const second = await run('login')
  assert.equal(second.code, 0, second.err)
  assert.equal(seen.length, 2, 'the person is asked every time')
  // A command calls as the person, and the token is nobody at /mcp.
  const called = await run('who-am-i')
  assert.equal(called.code, 0, called.err)
  assert.equal(called.out.trim(), `you are ${ada}`)
  const access = String(JSON.parse(readFileSync(kept, 'utf8')).servers[address].app.access)
  const atMcp = await fetch(`${address}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} }),
  })
  assert.equal(atMcp.status, 401)
})

test('[25-8b] [05-13.25] two commands at once renew once, and `logout` ends the grant', async (t) => {
  const { app, address, home, ada } = await served(t)
  const signIn = browserSignIn({ open: person(app, address, ada, []) })
  const run = async (...words: string[]) => {
    const { terminal, out, err } = terminalOf()
    const code = await runCommandLine({
      words,
      terminal,
      reach: reachOf(address),
      home,
      target: { local: false, address },
      env: {},
      signIn,
    })
    return { code, out: out.join(''), err: err.join('') }
  }
  assert.equal((await run('login')).code, 0)
  const kept = join(home, 'keys.json')
  const before = JSON.parse(readFileSync(kept, 'utf8')).servers[address].app
  // The access token is made to end, as an hour later: each command is answered 401 and renews.
  const ended = { ...before, access: `${before.access.slice(0, -2)}xx`, expiresAt: 0 }
  writeFileSync(kept, JSON.stringify({ format: 'tent.keys/1', servers: { [address]: { app: ended } } }))
  const [one, two] = await Promise.all([run('who-am-i'), run('who-am-i')])
  assert.deepEqual([one.code, two.code], [0, 0], `${one.err} ${two.err}`)
  const after = JSON.parse(readFileSync(kept, 'utf8')).servers[address].app
  assert.notEqual(after.refresh, before.refresh)
  // One renewal: the grant stands, and no renewal token was used a second time.
  const [grant] = Object(await app.call('grantsOf', { user: ada }, { as: system }))
  assert.equal(grant.reusedAt, undefined)
  const out = await run('logout')
  assert.equal(out.code, 0, out.err)
  assert.equal(existsSync(kept) ? JSON.parse(readFileSync(kept, 'utf8')).servers[address] : undefined, undefined)
  const renewed = await fetch(`${address}/_t/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: after.refresh, client_id: 'tent-cli' }),
  })
  assert.equal(renewed.status, 400, 'logout ended the grant')
})
