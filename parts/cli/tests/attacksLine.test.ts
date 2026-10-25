import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { Reach } from '../../connect/index.ts'
import { keptKey, runCommandLine } from '../../connect/index.ts'
import type { Terminal } from '../../core/index.ts'
import { add } from '../added.ts'
import { commandLine } from '../commandLine.ts'

const escape = '\u001b'
// Codes that move a terminal's cursor, clear it, and change its title.
const driving = `${escape}[2J${escape}[H${escape}]0;owned${escape}\\\u0007\u009b31m`

/** A folder of the runner of its own for one test, removed when the test ends. */
function homeOf(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), 'tent-attacks-line-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  return home
}

/** A terminal that keeps what was printed, with no person at it. */
function terminalOf(lines: string[] = []): { terminal: Terminal; out: string[]; err: string[] } {
  const [out, err]: string[][] = [[], []]
  const terminal: Terminal = {
    write: (text) => void out.push(text),
    error: (text) => void err.push(text),
    raw: (text) => void out.push(text),
    line: async () => lines.shift(),
    keys: async function* () {},
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: false,
    color: false,
  }
  return { terminal, out, err }
}

/** A server that the runner reaches, as a test says it answers each path, with every path it was asked. */
function serverOf(answer: (path: string, request: Request) => Response | undefined): { reach: Reach; asked: string[] } {
  const asked: string[] = []
  const reach: Reach = {
    request: async (request) => {
      const { pathname, search } = new URL(request.url)
      asked.push(`${pathname}${search}`)
      return answer(pathname, request) ?? Response.json({ ok: false, error: { code: 'T0001', message: 'none' } })
    },
    live: async () => {
      throw new Error('no live connection in this test')
    },
  }
  return { reach, asked }
}

const listOf = (commands: Record<string, object>, more: object = {}) => ({
  ok: true,
  value: { app: 'shop', name: 'shop', version: 'v1', needsEngine: '0.0.0', commands, ...more },
})

const fn = (definition: string, more: object = {}) => ({ definition, kind: 'function', at: 'call', input: {}, ...more })

const target = { address: 'https://server.test', local: false }

test('[05-12.7] an answer of `/_t/cli` that names a module on another host, or with `..` in its name: the runner fetches only from its own address, under `/_t/b/cli/`', async (t) => {
  const home = homeOf(t)
  mkdirSync(join(home, 'cli', 'server.test'), { recursive: true })
  writeFileSync(join(home, 'cli', 'server.test', 'added.json'), '{"address":"https://server.test","name":"shop"}')
  const modules = [
    '../../../description.abcdef123456.js',
    'cli/../../secrets.abcdef123456.js',
    'http://evil.example/cli/x.abcdef123456.js',
    '//evil.example/cli/x.abcdef123456.js',
    'cli\\..\\..\\x.abcdef123456.js',
  ]
  const commands = Object.fromEntries(
    modules.map((module, n) => [
      `c${n}`,
      { definition: `c${n}`, kind: 'command', at: 'call', input: {}, module, export: 'c' },
    ]),
  )
  const { reach, asked } = serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    return new Response('export const c = { options: { run: () => 7 } }')
  })
  for (const word of Object.keys(commands)) {
    const { terminal } = terminalOf()
    await runCommandLine({ words: [word], terminal, reach, home, target, env: {} })
  }
  const fetched = asked.filter((one) => !one.startsWith('/_t/cli'))
  for (const one of fetched) assert.match(one, /^\/_t\/b\/cli\/[A-Za-z0-9.-]+\.js$/, `the runner fetched ${one}`)
})

test("[05-12.8] [05-12.18] an answer, an error's `message`, `fields` and `fix`, and an `about` that hold codes that move the cursor are printed as codes", async (t) => {
  const home = homeOf(t)
  const commands = {
    look: fn('look', { about: `Looks ${driving}`, input: { note: { kind: 'text', label: driving, help: driving } } }),
    fail: fn('fail'),
  }
  const { reach } = serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/call/look') return Response.json({ ok: true, value: `a row ${driving}` })
    if (path === '/_t/call/fail')
      return Response.json({
        ok: false,
        error: { code: 'T0002', name: 'bad-input', message: driving, fields: { [driving]: driving }, fix: driving },
      })
    return undefined
  })
  const printed: string[] = []
  for (const words of [['look'], ['fail'], ['--help'], ['look', '--help'], ['look', '--json'], ['fail', '--json']]) {
    const { terminal, out, err } = terminalOf()
    await runCommandLine({ words, terminal, reach, home, target, env: {} })
    printed.push(...out, ...err)
  }
  for (const one of printed) {
    assert.equal(one.includes(escape), false, JSON.stringify(one))
    assert.equal(one.includes('\u0007'), false, JSON.stringify(one))
    assert.equal(one.includes('\u009b'), false, JSON.stringify(one))
  }
})

test('[05-12.19] an answer of `/_t/cli` that is a gigabyte is cut at `callSize`', async (t) => {
  const home = homeOf(t)
  let pulled = 0
  const piece = new Uint8Array(1_048_576).fill(32)
  const { reach } = serverOf((path) => {
    if (path !== '/_t/cli') return undefined
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += piece.length
        // A runner that reads past 64 MB reads it all: the test stops it there.
        if (pulled > 64 * 1_048_576) controller.error(new Error('read past 64 MB'))
        else controller.enqueue(piece)
      },
    })
    return new Response(body, { headers: { 'content-type': 'application/json' } })
  })
  const { terminal } = terminalOf()
  const ended = await runCommandLine({ words: ['look'], terminal, reach, home, target, env: {} }).catch(() => -1)
  assert.equal(ended, 2)
  assert.ok(pulled <= 8 * 1_048_576, `the runner read ${pulled} bytes`)
})

test('[05-12.19] an answer of `/_t/cli` with a command named `login` and a word with a control character leaves both out, and a key `__proto__` is T0002', async (t) => {
  const home = homeOf(t)
  const commands = { login: fn('login', { about: 'steals the key' }), [`bad${escape}[2J`]: fn('bad'), fine: fn('fine') }
  const { reach } = serverOf((path) => (path === '/_t/cli' ? Response.json(listOf(commands)) : undefined))
  const { terminal, out } = terminalOf()
  assert.equal(await runCommandLine({ words: [], terminal, reach, home, target, env: {} }), 0)
  const help = out.join('')
  assert.match(help, /fine/)
  assert.doesNotMatch(help, /login|steals|bad/)
  const proto = `{"ok":true,"value":{"app":"shop","name":"shop","version":"v1","needsEngine":"0.0.0","commands":{"__proto__":{"definition":"x","kind":"function","at":"call","input":{}}}}}`
  const second = serverOf((path) =>
    path === '/_t/cli' ? new Response(proto, { headers: { 'content-type': 'application/json' } }) : undefined,
  )
  const run = terminalOf()
  const ended = await runCommandLine({
    words: ['x'],
    terminal: run.terminal,
    reach: second.reach,
    home,
    target,
    env: {},
  })
  assert.notEqual(ended, 0)
  assert.match(run.err.join(''), /T0002/)
})

test('[05-12.20] a module named `con.js` is refused; a host whose name holds a colon is kept under a folder with a hyphen', async (t) => {
  const home = homeOf(t)
  const portTarget = { address: 'https://server.test:8443', local: false }
  mkdirSync(join(home, 'cli', 'server.test-8443'), { recursive: true })
  writeFileSync(
    join(home, 'cli', 'server.test-8443', 'added.json'),
    '{"address":"https://server.test:8443","name":"shop"}',
  )
  const commands = {
    dev: { definition: 'dev', kind: 'command', at: 'call', input: {}, module: 'cli/con.abcdef123456.js', export: 'c' },
    aux: { definition: 'aux', kind: 'command', at: 'call', input: {}, module: 'cli/aux.js', export: 'c' },
  }
  const { reach, asked } = serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    return new Response('export const c = { options: { run: () => 7 } }')
  })
  for (const word of ['dev', 'aux']) {
    const { terminal } = terminalOf()
    assert.equal(await runCommandLine({ words: [word], terminal, reach, home, target: portTarget, env: {} }), 2, word)
  }
  assert.deepEqual(
    asked.filter((one) => one.startsWith('/_t/b/')),
    [],
  )
  assert.deepEqual(readdirSync(join(home, 'cli')), ['server.test-8443'])
})

test('[05-12.21] `file <id>` with no `--out`, where the server names the file `../../x`, ends with 2', async (t) => {
  const home = homeOf(t)
  const { reach, asked } = serverOf((path) =>
    path.startsWith('/_t/files/')
      ? new Response('x', { headers: { 'content-disposition': 'attachment; filename="../../tent-attack-file"' } })
      : undefined,
  )
  const { terminal } = terminalOf()
  assert.equal(await runCommandLine({ words: ['file', 'f1'], terminal, reach, home, target, env: {} }), 2)
  assert.deepEqual(asked, [])
  // A name that no folder of the system holds: macOS keeps a folder `X` two above its temporary one, and its names
  // tell no capitals apart.
  assert.equal(existsSync(join(home, '..', '..', 'tent-attack-file')), false)
})

test('[05-12.9] a file flag whose value is a folder is refused', async (t) => {
  const home = homeOf(t)
  const commands = { send: fn('send', { input: { doc: { kind: 'file' } } }) }
  const { reach, asked } = serverOf((path) => (path === '/_t/cli' ? Response.json(listOf(commands)) : undefined))
  const { terminal } = terminalOf()
  assert.equal(await runCommandLine({ words: ['send', '--doc', home], terminal, reach, home, target, env: {} }), 2)
  assert.deepEqual(
    asked.filter((one) => one.startsWith('/_t/files')),
    [],
  )
})

test('[05-12.15] a module that the server changes under a name the runner already holds does not fit its name: thrown away', async (t) => {
  const home = homeOf(t)
  mkdirSync(join(home, 'cli', 'server.test'), { recursive: true })
  writeFileSync(join(home, 'cli', 'server.test', 'added.json'), '{"address":"https://server.test","name":"shop"}')
  const name = 'cli/go.abcdef123456.js'
  writeFileSync(
    join(home, 'cli', 'server.test', 'go.abcdef123456.js'),
    'export const c = { options: { run: () => 9 } }',
  )
  const commands = { go: { definition: 'go', kind: 'command', at: 'call', input: {}, module: name, export: 'c' } }
  const { reach } = serverOf((path) => {
    if (path === '/_t/cli') return Response.json(listOf(commands))
    if (path === '/_t/cli/me') return Response.json({ ok: true, value: { system: true } })
    return new Response('export const c = { options: { run: () => 7 } }')
  })
  const { terminal } = terminalOf()
  assert.equal(await runCommandLine({ words: ['go'], terminal, reach, home, target, env: {} }), 2)
})

test('[05-12.10] [05-12.23] a server whose command is named `git`, `tent` or holds a slash, a second app with the name of the first, and an address that is already added under another name are refused', async (t) => {
  const home = homeOf(t)
  const adding = async (address: string, listed: string | undefined, name?: string): Promise<number> => {
    const { terminal } = terminalOf()
    return add({
      home,
      address,
      ...(name ? { name } : {}),
      yes: true,
      terminal,
      listed: async () => (listed === undefined ? undefined : { name: listed }),
    })
  }
  assert.equal(await adding('https://one.test', 'tent'), 2)
  assert.equal(await adding('https://one.test', 'a/b'), 2)
  assert.equal(await adding('https://one.test', '../bin/x'), 2)
  assert.equal(await adding('https://one.test', 'shop'), 0)
  assert.equal(await adding('https://two.test', 'shop'), 2, 'a second app with the name of the first')
  assert.equal(
    await adding('https://one.test', 'shop', 'shop-two'),
    2,
    'an address that is already added under another name',
  )
  assert.deepEqual(readdirSync(join(home, 'bin')).sort(), ['shop', 'shop.cmd'])
})

test('[05-12.4] `tent cli add` of a server over a connection that is not secure is refused, unless --insecure names the host', async (t) => {
  const home = homeOf(t)
  const before = process.env.TENT_HOME
  process.env.TENT_HOME = home
  t.after(() => {
    if (before === undefined) delete process.env.TENT_HOME
    else process.env.TENT_HOME = before
  })
  const ended = await commandLine(['add', 'http://shop.example', '--name', 'shop', '--yes'], home).catch(
    (error) => `it went on: ${String(error)}`,
  )
  assert.equal(ended, 2)
  assert.equal(existsSync(join(home, 'bin')), false, 'no launcher of an address that is not secure is written')
})

test('[05-12.13] `keys.json` as a link that another user put there is not read', async (t) => {
  const home = homeOf(t)
  const elsewhere = homeOf(t)
  const planted = join(elsewhere, 'planted.json')
  writeFileSync(
    planted,
    JSON.stringify({ format: 'tent.keys/1', servers: { 'https://server.test': { app: { key: 'tent_planted' } } } }),
  )
  try {
    symlinkSync(planted, join(home, 'keys.json'), 'file')
  } catch (error) {
    // Windows makes a link to a file only for a user who holds that right: the row is tried where links are made.
    if (Reflect.get(Object(error), 'code') === 'EPERM') {
      // An owed row is marked and fails, so the run counts it as owed and not as held.
      t.todo('this computer makes no link to a file: owed to a run where links are made')
      throw new Error('owed: no link to a file is made here')
    }
    throw error
  }
  assert.equal(keptKey(home, 'https://server.test'), undefined)
})
