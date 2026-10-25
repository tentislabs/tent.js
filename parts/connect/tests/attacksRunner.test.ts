import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Terminal } from '../../core/index.ts'
import { keepKey, keepPublishKey, keepTokens } from '../cli/keys.ts'
import type { Reach } from '../index.ts'
import { runCommandLine } from '../index.ts'

const escape = '\u001b'
// Codes that move a terminal's cursor, clear it, ring it and change its title.
const driving = `${escape}[2J${escape}[H${escape}]0;owned${escape}\\\u0007\u009b31m`

/** Whether a text holds a code that drives a terminal, as it came. */
const drives = (text: string): boolean => text.includes(escape) || text.includes('\u0007') || text.includes('\u009b')

/** A folder of the runner of its own for one test, removed when the test ends. */
function homeOf(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), 'tent-attacks-runner-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  return home
}

/** A terminal that keeps what was printed. `interactive` says whether a person sits at it. */
function terminalOf(o: { lines?: string[]; interactive?: boolean } = {}): {
  terminal: Terminal
  out: string[]
  err: string[]
} {
  const lines = [...(o.lines ?? [])]
  const [out, err]: string[][] = [[], []]
  const terminal: Terminal = {
    write: (text) => void out.push(text),
    error: (text) => void err.push(text),
    raw: (text) => void out.push(text),
    line: async () => lines.shift(),
    keys: async function* () {},
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: o.interactive === true,
    color: false,
  }
  return { terminal, out, err }
}

/** A request as the server was handed it: its path and its lines. */
interface Asked {
  path: string
  headers: Headers
}

/** A server that the runner reaches, as a test says it answers each path, with every request it was handed. */
function serverOf(answer: (path: string, request: Request) => Response | undefined): { reach: Reach; asked: Asked[] } {
  const asked: Asked[] = []
  const reach: Reach = {
    request: async (request) => {
      const { pathname, search } = new URL(request.url)
      asked.push({ path: `${pathname}${search}`, headers: request.headers })
      return answer(pathname, request) ?? Response.json({ ok: false, error: { code: 'T0001', message: 'none' } })
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

const fn = (definition: string, more: object = {}) => ({ definition, kind: 'function', at: 'call', input: {}, ...more })

const target = { address: 'https://server.test', local: false }

/** The users of this computer that a file is open to, but the current one: none where it is closed to the others. */
function othersOn(file: string): string[] {
  if (process.platform !== 'win32') {
    const others = statSync(file).mode & 0o077
    return others ? [`mode ${others.toString(8)}`] : []
  }
  const rights = execFileSync('icacls', [file], { encoding: 'utf8' })
  const mine = `\\${userInfo().username.toLowerCase()}:`
  return rights
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .filter((line) => !line.toLowerCase().includes(mine))
}

/** A module of a command as the runner takes it: its name holds the start of the fingerprint of its bytes. */
function moduleNamed(word: string, code: string): { name: string; bytes: Uint8Array<ArrayBuffer> } {
  const bytes = new TextEncoder().encode(code)
  const print = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  return { name: `${word}.${print}.js`, bytes }
}

/** A server whose one command is written in code, by the module given, and that the runner was told to add. */
function codeServer(
  home: string,
  module: { name: string; bytes: Uint8Array<ArrayBuffer> },
  answer: (path: string) => Response | undefined,
): { reach: Reach; asked: Asked[] } {
  mkdirSync(join(home, 'cli', 'server.test'), { recursive: true })
  writeFileSync(join(home, 'cli', 'server.test', 'added.json'), '{"address":"https://server.test","name":"shop"}')
  const commands = {
    look: { definition: 'look', kind: 'command', at: 'call', input: {}, module: `cli/${module.name}`, export: 'c' },
  }
  return serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    if (path === `/_t/b/cli/${module.name}`) return new Response(module.bytes)
    return answer(path)
  })
}

test('[05-12.6] `keys.json` cannot be read by another user of the computer, also where the file it replaces could', (t) => {
  const home = homeOf(t)
  const file = join(home, 'keys.json')
  // A file that stood there open to every user, as a person may have copied one in.
  writeFileSync(file, '{"format":"tent.keys/1","servers":{}}', { mode: 0o644 })
  if (process.platform === 'win32') execFileSync('icacls', [file, '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  else execFileSync('chmod', ['644', file])
  assert.notDeepEqual(othersOn(file), [], 'the planted file is open to the others')
  keepKey(home, 'https://server.test', 'tent_the_key')
  assert.deepEqual(othersOn(file), [], 'after a key is kept')
  keepTokens(home, 'https://server.test', { access: 'a', refresh: 'r', expiresAt: 1 })
  assert.deepEqual(othersOn(file), [], 'after the tokens of a login are kept')
  keepPublishKey(home, 'https://other.test', 'tent_publish', 'live')
  assert.deepEqual(othersOn(file), [], 'after the key of publishing is kept')
})

test('[05-12.6] `keys.json` cannot be read by another user of the computer where its folder hands down no rights, and the account gives its own', (t) => {
  const home = homeOf(t)
  // On Windows a file made in such a folder is given the account's default rights, as SYSTEM and Administrators.
  if (process.platform === 'win32')
    execFileSync('icacls', [home, '/inheritance:r', '/grant:r', `${userInfo().username}:F`], { stdio: 'ignore' })
  keepKey(home, 'https://server.test', 'tent_the_key')
  assert.deepEqual(othersOn(join(home, 'keys.json')), [], 'after a key is kept')
})

test("[05-12.11] a `command` that writes a model's words which hold codes that move the cursor: `write` and `error` print them as codes", async (t) => {
  const home = homeOf(t)
  const module = moduleNamed(
    'look',
    'export const c = { options: { run: async ({ read, terminal }) => { const words = await read({ definition: "say", kind: "query" }, {}); terminal.write(words); terminal.error(words) } } }',
  )
  const { reach } = codeServer(home, module, (path) =>
    path === '/_t/read/say' ? Response.json({ ok: true, value: `the model says ${driving}` }) : undefined,
  )
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 0, err.join(''))
  assert.match(out.join(''), /the model says/)
  assert.match(err.join(''), /the model says/)
  for (const one of [...out, ...err]) assert.equal(drives(one), false, JSON.stringify(one))
})

test('[05-12.18] an error of the server that a `command` written in code lets out is printed as codes', async (t) => {
  const home = homeOf(t)
  const module = moduleNamed(
    'look',
    'export const c = { options: { run: async ({ call }) => { await call({ definition: "pay", kind: "action" }, {}) } } }',
  )
  const { reach } = codeServer(home, module, (path) =>
    path === '/_t/call/pay'
      ? Response.json({
          ok: false,
          error: { code: `T0002${driving}`, name: 'bad-input', message: `refused ${driving}`, fix: driving },
        })
      : undefined,
  )
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 1)
  assert.match(err.join(''), /refused/)
  for (const one of [...out, ...err]) assert.equal(drives(one), false, JSON.stringify(one))
})

test('[05-12.18] the refusal of a `command` whose `access` does not fit the caller prints the definition the server named as codes', async (t) => {
  const home = homeOf(t)
  const commands = {
    look: {
      definition: `look${driving}`,
      kind: 'command',
      at: 'call',
      input: {},
      access: { rule: 'role', role: 'staff' },
    },
  }
  const { reach } = serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: {} })
    return undefined
  })
  const { terminal, out, err } = terminalOf()
  assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }), 1)
  assert.match(err.join(''), /T0006/)
  for (const one of [...out, ...err]) assert.equal(drives(one), false, JSON.stringify(one))
})

test('[05-12.12] `TENT_KEY` is sent to the address that `TENT_AT` names alone, and a command run against another server is sent no key', async (t) => {
  const home = homeOf(t)
  const commands = { look: fn('look') }
  const run = async (env: Record<string, string>): Promise<Asked[]> => {
    const { reach, asked } = serverOf((path) => {
      if (path === '/_t/cli') return Response.json(listOf(commands))
      if (path === '/_t/call/look') return Response.json({ ok: true, value: 'looked' })
      return undefined
    })
    const { terminal } = terminalOf()
    assert.equal(await runCommandLine({ words: ['look'], terminal, reach, home, target, env }), 0)
    return asked
  }
  for (const at of ['https://other.test', 'https://server.test:8443', 'http://server.test', 'no address at all']) {
    const asked = await run({ TENT_KEY: 'tent_the_secret_key', TENT_AT: at })
    assert.ok(asked.length >= 2)
    for (const one of asked)
      assert.equal(one.headers.get('authorization'), null, `TENT_AT ${at}: ${one.path} carried a key`)
  }
  // The same server, written in capitals and with its own port: two addresses are the same where these are.
  const asked = await run({ TENT_KEY: 'tent_the_secret_key', TENT_AT: 'HTTPS://Server.Test:443/x' })
  for (const one of asked) assert.equal(one.headers.get('authorization'), 'Bearer tent_the_secret_key', one.path)
})

test("[05-12.17] a function that states `danger: 'ask'`, typed by a program with no person at the terminal, ends with 2 unless --yes was typed", async (t) => {
  const home = homeOf(t)
  const commands = { remove: fn('removeOrder', { danger: 'ask', input: { order: { kind: 'text' } } }) }
  const run = async (words: string[], o: { lines?: string[]; interactive?: boolean } = {}) => {
    const { reach, asked } = serverOf((path, request) => {
      if (path === '/_t/cli') return Response.json(listOf(commands))
      if (path !== '/_t/call/removeOrder') return undefined
      if (request.headers.get('tent-agreed') === 'the text of the ask')
        return Response.json({ ok: true, value: 'removed' })
      return Response.json({
        ok: false,
        error: {
          code: 'T7120',
          name: 'ask',
          message: 'A person says yes first.',
          fields: { ask: 'the text of the ask' },
        },
      })
    })
    const { terminal, out, err } = terminalOf(o)
    const ended = await runCommandLine({ words, terminal, reach, home, target, env: {} })
    const calls = asked.filter((one) => one.path === '/_t/call/removeOrder')
    return { ended, calls, out: out.join(''), err: err.join('') }
  }
  const alone = await run(['remove', '--order', 'o1'])
  assert.equal(alone.ended, 2, alone.err)
  assert.equal(alone.calls.length, 1, 'the call is not sent again')
  assert.match(alone.err, /--yes/)
  const piped = await run(['remove', '--order', 'o1'], { lines: ['yes'] })
  assert.equal(piped.ended, 2, 'a yes in the input of a program is no person')
  assert.equal(piped.calls.length, 1)
  const typed = await run(['--yes', 'remove', '--order', 'o1'])
  assert.equal(typed.ended, 0, typed.err)
  assert.equal(typed.calls.length, 2)
  assert.equal(typed.calls[1].headers.get('tent-agreed'), 'the text of the ask')
  const person = await run(['remove', '--order', 'o1'], { lines: ['no'], interactive: true })
  assert.equal(person.ended, 1)
  assert.equal(person.calls.length, 1, 'a no calls nothing more')
})
