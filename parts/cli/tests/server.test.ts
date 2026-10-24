import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine, keptAlone } from '../../engine/index.ts'
import { copied, shell, typed } from './typed.ts'

const system = { kind: 'system' } as const

/** The app of these tests, served on this computer's own network, with a folder of the runner of its own. */
async function served(t: TestContext): Promise<{ app: App; address: string; home: string; project: string }> {
  const engine = createEngine({ port: 0 })
  t.after(() => engine.close())
  const project = copied(t, `served-${process.pid}-${Math.random().toString(36).slice(2, 8)}`, 'served')
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
  return { app, address: `http://127.0.0.1:${port}`, home, project }
}

/** What the runner printed, and how it ended, run as a program of its own with the runner's folder in `TENT_HOME`. */
async function runner(
  home: string,
  words: string[],
  o: { input?: string; env?: Record<string, string> } = {},
): Promise<{ status: number | null; out: string; err: string }> {
  // The runner carries out no file for a program that it finds this in, as it would in a test that a test started.
  const { NODE_TEST_CONTEXT: _, TENT_KEY: __, TENT_AT: ___, ...env } = process.env
  // The server runs in this program: the runner is waited for without holding this program still.
  const child = spawn(process.execPath, [shell, 'cli', ...words], {
    cwd: home,
    env: { ...env, TENT_HOME: home, ...o.env },
  })
  const [out, err]: string[][] = [[], []]
  child.stdout.on('data', (part) => void out.push(String(part)))
  child.stderr.on('data', (part) => void err.push(String(part)))
  child.stdin.end(o.input ?? '')
  const status = await new Promise<number | null>((done) => {
    const timer = setTimeout(() => child.kill(), 60_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      done(code)
    })
  })
  return { status, out: out.join(''), err: err.join('') }
}

/** A key of the app, made as the system makes it. */
async function keyOf(app: App, name: string): Promise<string> {
  return String(Object(await app.call('makeKey', { name }, { as: system })).key)
}

test('[24-15] `tent cli add` asks once and writes a launcher; `tent cli list` shows it, and `tent cli remove` takes all of it away', async (t) => {
  const { app, address, home } = await served(t)
  const key = await keyOf(app, 'laptop')
  // The commands of this server are for signed-in callers: the person logs in first.
  // A key that is nobody ends with 1, and nothing is kept.
  const wrong = await runner(home, [address, 'login', '--key'], { input: 'tent_nothing\n' })
  assert.equal(wrong.status, 1, wrong.err)
  assert.equal(existsSync(join(home, 'keys.json')), false)
  // The person logs in with a key; the key is kept in a file that only the current user may read.
  const login = await runner(home, [address, 'login', '--key'], { input: `${key}\n` })
  assert.equal(login.status, 0, login.err)
  const kept = join(home, 'keys.json')
  const held = JSON.parse(readFileSync(kept, 'utf8'))
  assert.equal(held.format, 'tent.keys/1')
  assert.equal(held.servers[address].app.key, key)
  if (process.platform === 'win32') assert.equal(keptAlone(kept).why, undefined)
  else assert.equal(statSync(kept).mode & 0o077, 0)
  const unasked = await runner(home, ['add', address])
  assert.equal(unasked.status, 2, 'with no person there and no --yes it adds nothing')
  assert.match(unasked.err, new RegExp(address.replace(/[.]/g, '\\.')))
  // The install's own launchers, as an installer lays them, which the launcher of the app starts.
  const install = ['tent', 'tent.exe']
  mkdirSync(join(home, 'bin'), { recursive: true })
  for (const one of install) writeFileSync(join(home, 'bin', one), '')
  const added = await runner(home, ['add', address, '--yes'])
  assert.equal(added.status, 0, added.err)
  const launchers = readdirSync(join(home, 'bin'))
    .filter((one) => !install.includes(one))
    .sort()
  assert.deepEqual(launchers, ['served', 'served.cmd'])
  const unix = readFileSync(join(home, 'bin', 'served'), 'utf8').split('\n')
  assert.equal(unix[0], '#!/bin/sh')
  assert.equal(unix[1], `exec "${join(home, 'bin', 'tent')}" cli "${address}" "$@"`)
  const windows = readFileSync(join(home, 'bin', 'served.cmd'), 'utf8').split(/\r?\n/)
  assert.equal(windows[0], '@echo off')
  assert.equal(windows[1], `"${join(home, 'bin', 'tent.exe')}" cli "${address}" %*`)
  // A second address of the same name is refused unless --name gives another.
  const again = await runner(home, ['add', address.replace('127.0.0.1', 'localhost'), '--yes'])
  assert.equal(again.status, 2)
  assert.equal(
    (await runner(home, ['add', address.replace('127.0.0.1', 'localhost'), '--yes', '--name', 'served-two'])).status,
    0,
  )
  assert.equal((await runner(home, [address, 'whoami'])).out.trim(), 'laptop')
  assert.match((await runner(home, [address, 'hello'])).out, /hello a key/)
  const listed = await runner(home, ['list'])
  assert.match(listed.out, new RegExp(`served\\s+${address.replace(/[.]/g, '\\.')}`))
  assert.equal((await runner(home, ['remove', address])).status, 0)
  assert.deepEqual(
    readdirSync(join(home, 'bin'))
      .filter((one) => !install.includes(one))
      .sort(),
    ['served-two', 'served-two.cmd'],
  )
  assert.equal(JSON.parse(readFileSync(kept, 'utf8')).servers[address], undefined)
  assert.equal((await runner(home, ['list'])).out.includes(address), false)
})

test('[24-15] a server whose command is named `tent`, or the name of a command the terminal already finds, is refused unless --name gives another', async (t) => {
  const { home, project } = await served(t)
  const named = join(project, 'tent.ts')
  writeFileSync(
    named,
    readFileSync(named, 'utf8').replace(
      "title: 'Served',",
      "title: 'Served',\n  cli: { name: 'node' },\n  describeTo: 'anyone',",
    ),
  )
  // `node` is a command that the terminal of this computer already finds: it runs these tests.
  const project2 = await buildProject(project, { for: 'dev' })
  assert.deepEqual(
    project2.findings.filter((one) => one.level === 'error'),
    [],
  )
  // The engine is closed in the test, before its folder is removed.
  const engine = createEngine({ port: 0 })
  try {
    const data = join(project, '.tent-two')
    await engine.open(project2.bundleFolder, { dataFolder: data, mode: 'test' })
    const { port } = JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
    const other = `http://127.0.0.1:${port}`
    const refused = await runner(home, ['add', other, '--yes'])
    assert.equal(refused.status, 2, refused.out + refused.err)
    assert.match(refused.err, /--name/)
    assert.equal((await runner(home, ['add', other, '--yes', '--name', 'my-node'])).status, 0)
  } finally {
    await engine.close()
  }
})

test('[24-15] `TENT_KEY` is sent to the address of `TENT_AT` and to no other, and no key is sent over a connection that is not secure but to this computer or a host that --insecure names', async (t) => {
  const { app, address, home } = await served(t)
  const key = await keyOf(app, 'ci')
  const taken = await runner(home, [address, 'whoami'], { env: { TENT_KEY: key, TENT_AT: address } })
  assert.equal(taken.out.trim(), 'ci', taken.err)
  const elsewhere = await runner(home, [address, 'hello'], { env: { TENT_KEY: key, TENT_AT: 'https://other.example' } })
  assert.equal(elsewhere.status, 2)
  assert.match(elsewhere.err, /T0006/)
  // An address of another computer is reached over a secure connection alone.
  const plain = await runner(home, ['http://shop.example', 'hello'], {
    env: { TENT_KEY: key, TENT_AT: 'http://shop.example' },
  })
  assert.equal(plain.status, 2)
  assert.match(plain.err, /--insecure/)
})

test('[24-15] a file flag uploads, and `file` downloads to the path that --out names', async (t) => {
  const { app, address, home } = await served(t)
  const key = await keyOf(app, 'files')
  void (await runner(home, [address, 'login', '--key'], { input: `${key}\n` }))
  const path = join(home, 'doc.txt')
  writeFileSync(path, 'the words of a document')
  const kept = await runner(home, [address, 'keep-doc', '--doc', path])
  assert.equal(kept.status, 0, kept.err)
  const id = kept.out.trim()
  assert.match(id, /^[0-9a-z]{26}$/)
  const out = join(home, 'back.txt')
  const fetched = await runner(home, [address, 'file', id, '--out', out])
  assert.equal(fetched.status, 0, fetched.err)
  assert.equal(readFileSync(out, 'utf8'), 'the words of a document')
  // A file that is there is not written over without --yes.
  assert.notEqual((await runner(home, [address, 'file', id, '--out', out])).status, 0)
  assert.equal((await runner(home, [address, '--yes', 'file', id, '--out', out])).status, 0)
})

test('[24-15] a command of an app that was not added runs no code; once added it runs, a module whose bytes do not fit its name is thrown away, and after a new version the runner asks for the commands again', async (t) => {
  const { app, address, home, project } = await served(t)
  const key = await keyOf(app, 'code')
  void (await runner(home, [address, 'login', '--key'], { input: `${key}\n` }))
  const unadded = await runner(home, [address, 'greet'])
  assert.equal(unadded.status, 2)
  assert.match(unadded.err, /tent cli add/)
  assert.equal(unadded.out.includes('code says'), false)
  await runner(home, ['add', address, '--yes'])
  const ran = await runner(home, [address, 'greet'])
  assert.equal(ran.status, 0, ran.err)
  assert.match(ran.out, /code says hello a key/)
  const kept = join(home, 'cli', address.slice('http://'.length).replace(':', '-'))
  const module = readdirSync(kept).find((one) => one.startsWith('commands.greet.'))
  assert.ok(module, readdirSync(kept).join(', '))
  writeFileSync(join(kept, module), 'throw new Error("changed on the disk")')
  const fixed = await runner(home, [address, 'greet'])
  assert.match(fixed.out, /code says hello a key/, fixed.err)
  assert.notEqual(readFileSync(join(kept, module), 'utf8'), 'throw new Error("changed on the disk")')
  // A new version with a new command: the runner asks for the list again.
  const functions = join(project, 'functions.ts')
  writeFileSync(
    functions,
    `${readFileSync(functions, 'utf8')}\nexport const later = query('later', { access: 'signedIn', offer: ['cli'], input: {}, output: text(), run: () => 'new' })\n`,
  )
  const built = await buildProject(project, { for: 'dev' })
  await app.switch(await app.add(built.bundleFolder))
  assert.equal((await runner(home, [address, 'later'])).out.trim(), 'new')
})

test('[24-15] `/_t/cli` holds to `describeTo`; a request with `Tent-Caller` and no admin token is nobody; `onRequest` sees neither the admin token nor `Tent-Caller`', async (t) => {
  const { address, home, project } = await served(t)
  const asked = await runner(home, [address, '--help'])
  assert.notEqual(asked.status, 0)
  assert.match(asked.err, /T0006|login/)
  const named = await fetch(`${address}/_t/cli/me`, { headers: { 'tent-caller': 'system' } })
  assert.deepEqual(Object(await named.json()).value, {})
  const { token } = JSON.parse(readFileSync(join(project, '.tent', 'engine.json'), 'utf8'))
  const seen = await fetch(`${address}/seen`, {
    headers: { authorization: `Bearer ${token}`, 'tent-caller': 'system' },
  })
  assert.deepEqual(await seen.json(), { authorization: null, caller: null })
  // A request with no admin token reaches the app's code as it was sent.
  const plain = await fetch(`${address}/seen`, { headers: { 'tent-caller': 'system' } })
  assert.deepEqual(await plain.json(), { authorization: null, caller: 'system' })
})

test('[24-15] `tent build` writes a launcher into `.tent/bin/` for a project that has commands', async (t) => {
  const project = copied(t, `launched-${process.pid}`, 'served')
  const built = await typed(project, 'build', '--json')
  assert.equal(built.ended, 0, built.printed)
  const bin = join(project, '.tent', 'bin')
  assert.ok(existsSync(join(bin, 'served')) && existsSync(join(bin, 'served.cmd')))
  assert.ok(readFileSync(join(bin, 'served'), 'utf8').includes(`cli "${project}"`))
  assert.ok(readFileSync(join(bin, 'served.cmd'), 'utf8').includes(`cli "${project}" %*`))
})
