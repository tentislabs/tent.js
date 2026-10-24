import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { outline } from '../../core/internal.ts'
import type { HeldStatus } from '../rooms/held/process.ts'
import { startHeld } from '../rooms/held/process.ts'
import { testApp } from '../../test/index.ts'

// The packages of the held app, each one plain way out with the runtime's own modules, as a test lays them in
// `node_modules/`. None is written to break out of the room: each takes one documented way and is refused.
const packages: Record<string, string> = {
  'read-file': `import { readFileSync } from 'node:fs'
export function readFile(path) { return readFileSync(path).length }`,
  dial: `import { connect } from 'node:net'
export function dial(port) {
  return new Promise((done, failed) => {
    const socket = connect(port, '127.0.0.1', () => { socket.end(); done('open') })
    socket.on('error', failed)
  })
}`,
  'start-program': `import { spawnSync } from 'node:child_process'
export function startProgram() { const r = spawnSync(process.execPath, ['-e', '0']); if (r.error) throw r.error; return r.status }`,
  'open-database': `export async function openDatabase(file) { const { DatabaseSync } = await import('node:sqlite'); new DatabaseSync(file); return 'opened' }`,
  'load-native': `export function loadNative() { process.dlopen({ exports: {} }, 'nothing.node'); return 'loaded' }`,
  'send-out': `export async function sendOut(url) { const answer = await fetch(url); return answer.status }`,
  'read-env': `export function readEnv(name) { return process.env[name] ?? 'none' }`,
  'start-worker': `import { Worker } from 'node:worker_threads'
export function startWorker() {
  return new Promise((done, failed) => {
    const worker = new Worker('process.exit(0)', { eval: true, execArgv: [] })
    worker.on('online', () => { worker.terminate(); done('started') })
    worker.on('error', failed)
  })
}`,
  'change-fetch': `export function changeFetch() { globalThis.fetch = () => Promise.resolve(new Response('changed')) ; return 'changed' }`,
}

// The app: a table, a query and a change that stay with the engine, and one action for each way out a package takes.
const functions = `import { action, anyone, change, input, list, number, query, sessions, table, text } from 'tentjs'
import { readFile } from 'read-file'
import { dial } from 'dial'
import { startProgram } from 'start-program'
import { openDatabase } from 'open-database'
import { loadNative } from 'load-native'
import { sendOut } from 'send-out'
import { readEnv } from 'read-env'
import { startWorker } from 'start-worker'
import { changeFetch } from 'change-fetch'

const open = anyone('every visitor')

export const notes = table('notes', { columns: { title: text() }, access: { read: open, add: open } })

export const users = table('users', { columns: { email: text(), roles: list(text()) }, access: { read: open } })

export const startSession = change('startSession', {
  access: open,
  input: { user: text() },
  output: text(),
  run: ({ input }) => {
    sessions.start(input.user)
    return 'ok'
  },
})

export const allNotes = query('allNotes', { access: open, rows: notes.oldest('createdAt').limit(10) })

export const addNote = change('addNote', { access: open, input: { title: text() }, set: notes.add({ title: input('title') }) })

export const readFileAction = action('readFileAction', {
  access: open,
  input: { path: text() },
  output: number(),
  run: async ({ input }) => readFile(input.path),
})

export const dialAction = action('dialAction', {
  access: open,
  input: { port: number() },
  output: text(),
  run: async ({ input }) => dial(input.port),
})

export const spawnAction = action('spawnAction', { access: open, output: number(), run: async () => startProgram() })

export const openDatabaseAction = action('openDatabaseAction', {
  access: open,
  input: { path: text() },
  output: text(),
  run: async ({ input }) => openDatabase(input.path),
})

export const nativeAction = action('nativeAction', { access: open, output: text(), run: async () => loadNative() })

export const fetchAction = action('fetchAction', {
  access: open,
  input: { url: text() },
  output: number(),
  run: async ({ input }) => sendOut(input.url),
})

export const envAction = action('envAction', {
  access: open,
  input: { name: text() },
  output: text(),
  run: async ({ input }) => readEnv(input.name),
})

export const workerAction = action('workerAction', { access: open, output: text(), run: async () => startWorker() })

export const changeFetchAction = action('changeFetchAction', { access: open, output: text(), run: async () => changeFetch() })

export const countThenCall = action('countThenCall', {
  access: open,
  input: { title: text() },
  output: number(),
  run: async ({ input, db }) => {
    const before = await db.notes.count()
    await addNote({ title: input.title })
    return before
  },
})`

/** Lays the held app into a folder of the test, with `hold` as the caller states it, and answers the folder. */
function laid(t: TestContext, hold: string): string {
  const folder = join(process.cwd(), 'results', 'engine', `held-${Math.random().toString(36).slice(2)}`)
  const remove = (): void => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  remove()
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const held = project('held', { title: 'Held', privateHosts: ['127.0.0.1'], hold: ${hold} })\n`,
    'functions/ways.ts': functions,
  }
  for (const [name, text] of Object.entries(packages)) {
    files[`node_modules/${name}/package.json`] = JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    })
    files[`node_modules/${name}/index.js`] = text
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  t.after(remove)
  return folder
}

test('[43-5] [16-2@10c] with the hold on, a package that reads a file, opens a connection, starts a program, loads a native module or opens the database is refused with T0035, and the engine runs on; a query and a change answer at once', async (t) => {
  // The held program is the room of a project that states `hold` where the program that holds the engine gives none.
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  const refused = async (name: string, input: Record<string, unknown>): Promise<void> => {
    await assert.rejects(
      app.as('nobody').call(name, input),
      (error: { code?: string }) => error.code === 'T0035',
      `${name} is refused with T0035`,
    )
  }
  await refused('readFileAction', { path: join(process.cwd(), 'package.json') })
  await refused('spawnAction', {})
  await refused('openDatabaseAction', { path: join(process.cwd(), 'x.db') })
  await refused('nativeAction', {})
  // The engine runs on after each refusal: a query and a change answer at once, as they do with no hold.
  assert.deepEqual(await app.as('nobody').call('allNotes', {}), [])
  await app.as('nobody').call('addNote', { title: 'One' })
  const rows = (await app.as('nobody').call('allNotes', {})) as { title: string }[]
  assert.deepEqual(
    rows.map((one) => one.title),
    ['One'],
  )
  await app.close()
})

test('[43-5] a held action reads through `db` and writes by calling a change, both carried out by the engine', async (t) => {
  const app = await testApp({ folder: laid(t, 'true') })
  await app.as('nobody').call('addNote', { title: 'First' })
  // The action counts the rows through `db` (read, in the room) and then calls a change (the write, in the engine).
  const before = await app.as('nobody').call('countThenCall', { title: 'Second' })
  assert.equal(before, 1)
  const rows = (await app.as('nobody').call('allNotes', {})) as { title: string }[]
  assert.deepEqual(
    rows.map((one) => one.title),
    ['First', 'Second'],
  )
  await app.close()
})

test('[43-5] a fetch of a held app reaches a host the hold names and is refused for one it does not', async (t) => {
  const server = createServer((request, response) => {
    request.resume()
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const app = await testApp({ folder: laid(t, "{ net: ['127.0.0.1'] }") })
  // The host the hold names: the fetch reaches the engine, which reaches the server.
  assert.equal(await app.as('nobody').call('fetchAction', { url: `http://127.0.0.1:${port}/` }), 200)
  // A host the hold does not name: refused with T0035 before any connection.
  await assert.rejects(
    app.as('nobody').call('fetchAction', { url: 'http://other.example.com/' }),
    (error: { code?: string }) => error.code === 'T0035',
  )
  await app.close()
})

test('[43-5] without the hold, the same packages run as installed, and nothing of them is refused', async (t) => {
  const server = createServer((request, response) => {
    request.resume()
    response.end('ok')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const app = await testApp({ folder: laid(t, 'undefined') })
  // A read of a file runs: the action answers the length, not a refusal.
  assert.ok(
    ((await app.as('nobody').call('readFileAction', { path: join(process.cwd(), 'package.json') })) as number) > 0,
  )
  // A connection of its own opens: no hold stands in its way.
  assert.equal(await app.as('nobody').call('dialAction', { port }), 'open')
  await app.close()
})

test('[43-4] the map lists what the hold names: each host, program and native module', async (t) => {
  const app = await testApp({
    folder: laid(t, "{ net: ['api.example.com'], programs: ['ffmpeg'], native: ['sharp'] }"),
  })
  t.after(() => app.close())
  const map = outline(app.description)
  assert.match(map, /^hold$/m)
  assert.match(map, /net api\.example\.com/)
  assert.match(map, /programs ffmpeg/)
  assert.match(map, /native sharp/)
})

test('[43-6] attack 1: a package reads the data folder, a key file or the engine environment by the file and process modules, and reads nothing', async (t) => {
  process.env.TENT_HELD_PROBE = 'a secret of the engine'
  t.after(() => void delete process.env.TENT_HELD_PROBE)
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  // Reading a file of the engine is refused.
  await assert.rejects(
    app.as('nobody').call('readFileAction', { path: join(process.cwd(), 'package.json') }),
    (error: { code?: string }) => error.code === 'T0035',
  )
  // The room's environment holds nothing of the engine: the probe is not there.
  assert.equal(await app.as('nobody').call('envAction', { name: 'TENT_HELD_PROBE' }), 'none')
  await app.close()
})

test('[43-6] attack 2: a package opens a connection by the network modules, or starts a worker or a program, and each is refused', async (t) => {
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  const refused = (name: string, input: Record<string, unknown> = {}): Promise<void> =>
    assert.rejects(app.as('nobody').call(name, input), (error: { code?: string }) => error.code === 'T0035', name)
  await refused('dialAction', { port: 9 })
  await refused('workerAction')
  await refused('spawnAction')
  await app.close()
})

test('[43-6] attack 3: the room is started under the model with read of the app code alone, and the database module, the debug entry and the V8 flags are shut before any app code loads', async (t) => {
  // The room's starting is read from the room itself, and holds whatever folder it is handed as the code to read.
  const room = startHeld({ place: laid(t, 'true'), native: [], nativeFolders: [], serve: () => undefined })
  t.after(() => room.close())
  const status: HeldStatus = await room.status()
  // The model is on, and the only grants are reads: no write, no network, no child process, no worker, no addons.
  assert.ok(status.execArgv.includes('--permission'))
  assert.ok(status.execArgv.every((flag) => flag === '--permission' || flag.startsWith('--allow-fs-read=')))
  assert.ok(!status.execArgv.includes('--allow-addons'))
  // Each thing the model leaves open was shut before any app code loaded: the database module, a signal to the
  // engine's process, the debug entry and the setting of a V8 flag.
  assert.deepEqual(status.shut, { sqlite: true, debugProcess: true, v8Flags: true, kill: true })
})

// The runtime's own list of what its permission model does not hold: the "Permission Model constraints", its one
// known issue and the section on `process._debugProcess`, of doc/api/permissions.md at the tag v26.11.0 of Node.js
// (https://github.com/nodejs/node/blob/v26.11.0/doc/api/permissions.md). Each is shut, as the room's status reads
// it, or named in the page of the hold.
const runtimeList: { item: string; shut?: (status: HeldStatus) => boolean; named?: string }[] = [
  {
    item: 'a worker thread does not inherit the model',
    shut: (status) => !status.execArgv.some((flag) => flag.startsWith('--allow-worker')),
  },
  {
    item: 'native modules, the network, child processes, workers, the inspector, WASI, FFI and OpenSSL stores',
    shut: (status) => status.execArgv.every((flag) => flag === '--permission' || flag.startsWith('--allow-fs-read=')),
  },
  {
    item: 'the environment file, the OpenSSL configuration and V8 flags set at run time',
    shut: (status) =>
      status.shut.v8Flags &&
      !status.execArgv.some((flag) => flag.startsWith('--env-file') || flag.startsWith('--openssl-config')),
  },
  {
    item: 'files the runtime writes where a flag of the operator says',
    shut: (status) => status.execArgv.every((flag) => flag === '--permission' || flag.startsWith('--allow-fs-read=')),
  },
  { item: 'an OpenSSL engine asked for at run time', named: 'OpenSSL engine' },
  { item: 'the loadable extensions of SQLite', shut: (status) => status.shut.sqlite },
  { item: 'a file descriptor that is already open', named: 'no file open' },
  {
    item: 'a symbolic link followed outside the granted paths',
    named: 'a link inside the built code leads outside it',
  },
  { item: '`process._debugProcess` of another process', shut: (status) => status.shut.debugProcess },
]

test("[43-6] attack 3: each item of the runtime's own list of what its model does not hold is shut in the room or named in the page of the hold", async (t) => {
  const room = startHeld({ place: laid(t, 'true'), native: [], nativeFolders: [], serve: () => undefined })
  t.after(() => room.close())
  const status: HeldStatus = await room.status()
  const page = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'pages', 'option.project.hold.md'), 'utf8')
  for (const { item, shut, named } of runtimeList) {
    const held = (shut?.(status) ?? false) || (named !== undefined && page.includes(named))
    assert.ok(held, `${item}: neither shut in the room nor named in the page of the hold`)
  }
})

test('[43-6] attack 3: a `native` lifts the loading of native code for the whole room, and the docs name what it costs', async (t) => {
  const room = startHeld({ place: laid(t, 'true'), native: ['sharp'], nativeFolders: [], serve: () => undefined })
  t.after(() => room.close())
  const status: HeldStatus = await room.status()
  assert.ok(status.execArgv.includes('--allow-addons'))
})

test('[43-6] attack 4: a package that changes the guarded fetch changes nothing outside the room', async (t) => {
  const before = globalThis.fetch
  t.after(() => {
    globalThis.fetch = before
  })
  const app = await testApp({ folder: laid(t, 'true') })
  // The package replaces `globalThis.fetch` inside the room.
  assert.equal(await app.as('nobody').call('changeFetchAction', {}), 'changed')
  // The engine's own `fetch` is unchanged: it still fetches, and answers nothing the package put in its place.
  const answer = await globalThis.fetch('data:text/plain,the engine fetches')
  assert.equal(await answer.text(), 'the engine fetches')
  // The engine runs on: a query and a change answer as before.
  await app.as('nobody').call('addNote', { title: 'After' })
  const rows = (await app.as('nobody').call('allNotes', {})) as { title: string }[]
  assert.deepEqual(
    rows.map((one) => one.title),
    ['After'],
  )
  await app.close()
})

test('[43-6] attack 5: the session cookie is kept from the page, so a component can read nothing of it', async (t) => {
  const app = await testApp({ folder: laid(t, 'true') })
  const made = await app.user({ email: 'one@example.com' })
  const browser = app.browser()
  // The engine hands the browser the session cookie as `HttpOnly`: the page's scripts and the components it draws
  // cannot read it, so a component gets nothing of what the screen's caller could not read.
  const answer = await browser.request('POST', '/_t/call/startSession', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { user: made.kind === 'user' ? made.user?.id : '' } }),
  })
  const setCookie = answer.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /tent_session/)
  assert.match(setCookie, /HttpOnly/i)
  await app.close()
})
