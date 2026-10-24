import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { testApp } from '../../test/index.ts'
import { startHeld } from '../rooms/held/process.ts'
import { workFolder } from './apps.ts'

const codeOf = (error: unknown): unknown => Reflect.get(Object(error), 'code')

// The packages of the held app: each takes one way out by the runtime's own modules. None is written to break the
// room; each takes a documented way and is refused unless the hold names it.
const packages: Record<string, string> = {
  'read-file':
    "import { readFileSync } from 'node:fs'\nexport function readFile(path) { return readFileSync(path).length }",
  'read-env': "export function readEnv(name) { return process.env[name] ?? 'none' }",
  dial: `import { connect } from 'node:net'
export function dial(port) {
  return new Promise((done, failed) => {
    const socket = connect(port, '127.0.0.1', () => { socket.end(); done('open') })
    socket.on('error', failed)
  })
}`,
  'start-worker': `import { Worker } from 'node:worker_threads'
export function startWorker() {
  return new Promise((done, failed) => {
    const worker = new Worker('0', { eval: true, execArgv: [] })
    worker.on('online', () => { worker.terminate(); done('started') })
    worker.on('error', failed)
  })
}`,
  'open-sqlite': "export function openSqlite() { return typeof process.getBuiltinModule('node:sqlite') }",
  'send-out': 'export async function sendOut(url) { const answer = await fetch(url); return String(answer.status) }',
  'change-fetch':
    "export function changeFetch() { globalThis.fetch = () => Promise.resolve(new Response('changed')); return 'changed' }",
}

const functions = `import { action, anyone, number, query, table, text } from 'tentjs'
import { readFile } from 'read-file'
import { readEnv } from 'read-env'
import { dial } from 'dial'
import { startWorker } from 'start-worker'
import { openSqlite } from 'open-sqlite'
import { sendOut } from 'send-out'
import { changeFetch } from 'change-fetch'

const open = anyone('every visitor')

export const notes = table('notes', { columns: { what: text() }, access: { read: open, add: open } })
export const count = query('count', { access: open, output: number(), run: ({ db }) => db.notes.count() })

export const readFileAction = action('readFileAction', { access: open, input: { path: text() }, output: number(), run: async ({ input }) => readFile(input.path) })
export const readEnvAction = action('readEnvAction', { access: open, input: { name: text() }, output: text(), run: async ({ input }) => readEnv(input.name) })
export const dialAction = action('dialAction', { access: open, input: { port: number() }, output: text(), run: async ({ input }) => dial(input.port) })
export const workerAction = action('workerAction', { access: open, output: text(), run: async () => startWorker() })
export const sqliteAction = action('sqliteAction', { access: open, output: text(), run: async () => openSqlite() })
export const killAction = action('killAction', { access: open, output: text(), run: async () => { process.kill(process.ppid, 0); return 'killed' } })
export const sendAction = action('sendAction', { access: open, input: { url: text() }, output: text(), run: async ({ input }) => sendOut(input.url) })
export const changeFetchAction = action('changeFetchAction', { access: open, output: text(), run: async () => changeFetch() })
`

/** Lays the held attack app into a folder of the test, with `hold` as the caller states it, and answers the folder. */
function laid(t: TestContext, hold: string): string {
  const folder = workFolder(t)
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const held = project('held', { title: 'Held', privateHosts: ['127.0.0.1'], hold: ${hold} })\n`,
    'functions/ways.ts': functions,
  }
  for (const [name, code] of Object.entries(packages)) {
    files[`node_modules/${name}/package.json`] = JSON.stringify({
      name,
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    })
    files[`node_modules/${name}/index.js`] = code
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** A server of the test that answers every request, and its port. */
async function served(t: TestContext): Promise<number> {
  const server = createServer((request, response) => {
    request.resume()
    response.end('ok')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  return typeof address === 'object' && address ? address.port : 0
}

// [05-19.11] Code in the held program reads what the permission model leaves open: each is shut before any code loads.
test('[05-19.11] in the held program the runtime SQLite module, process.kill and v8.setFlagsFromString are shut before any app code loads', async (t) => {
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  // The SQLite module is refused by the module hook the program set before any app code loaded.
  await assert.rejects(
    app.as('nobody').call('sqliteAction', {}),
    (error) => codeOf(error) === 'T0035' || /sqlite/i.test(String(Reflect.get(Object(error), 'message'))),
  )
  // A signal to the engine's own process is refused.
  await assert.rejects(app.as('nobody').call('killAction', {}))
})

// [05-19.12] With hold on, a package reads the data folder, a key file or the engine environment and reads nothing.
test('[05-19.12] with hold true a package that reads a file of the engine, or its environment, by the runtime file and process modules is refused and reads nothing', async (t) => {
  process.env.TENT_HELD_PROBE = 'a secret of the engine'
  t.after(() => void delete process.env.TENT_HELD_PROBE)
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  await assert.rejects(
    app.as('nobody').call('readFileAction', { path: join(process.cwd(), 'package.json') }),
    (error) => codeOf(error) === 'T0035',
  )
  assert.equal(
    await app.as('nobody').call('readEnvAction', { name: 'TENT_HELD_PROBE' }),
    'none',
    'the engine environment is not there',
  )
})

// [05-19.13] A package opens a connection by the network modules, or starts a worker or a program: each is refused.
test('[05-19.13] with hold true a package that opens a connection, or starts a worker, by the runtime own modules is refused', async (t) => {
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  const refused = (name: string, input: Record<string, unknown> = {}): Promise<void> =>
    assert.rejects(app.as('nobody').call(name, input), (error) => codeOf(error) === 'T0035', name)
  await refused('dialAction', { port: 9 })
  await refused('workerAction')
})

// [05-19.14] The held program as section 8.1 point 2 starts it: read of the built code alone, each other way shut.
test('[05-19.14] the held program is started under the permission model with reads alone, and the SQLite module, the debug entry, process.kill and v8 flags shut, read from the program itself', async (t) => {
  const room = startHeld({ place: laid(t, 'true'), native: [], nativeFolders: [], serve: () => undefined })
  t.after(() => room.close())
  const status = await room.status()
  assert.ok(status.execArgv.includes('--permission'), 'the model is on')
  assert.ok(
    status.execArgv.every((flag) => flag === '--permission' || flag.startsWith('--allow-fs-read=')),
    'the only grants are reads: no write, network, program, worker or addon',
  )
  assert.deepEqual(status.shut, { sqlite: true, debugProcess: true, v8Flags: true, kill: true })
})

// [05-19.15] A package that changes the guarded fetch changes nothing outside the code that imported it.
test('[05-19.15] with hold true a package that replaces globalThis.fetch changes nothing of the engine own fetch', async (t) => {
  const before = globalThis.fetch
  t.after(() => {
    globalThis.fetch = before
  })
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  assert.equal(
    await app.as('nobody').call('changeFetchAction', {}),
    'changed',
    'the package changed fetch in its own program',
  )
  const answer = await globalThis.fetch('data:text/plain,the engine fetches')
  assert.equal(await answer.text(), 'the engine fetches', "the engine's own fetch is unchanged")
})

// [05-19.9] Code under hold fetches a host `net` does not name, through a room of a host: T0035 at the way out.
test('[05-19.9] with hold stated and the test room as the room, a fetch to a host net names answers, and one to another is T0035 naming what it tried', async (t) => {
  const port = await served(t)
  const app = await testApp({ folder: laid(t, "{ net: ['127.0.0.1'] }"), room: 'apart' })
  t.after(() => app.close())
  assert.equal(await app.as('nobody').call('sendAction', { url: `http://127.0.0.1:${port}/` }), '200')
  const error: unknown = await app
    .as('nobody')
    .call('sendAction', { url: 'http://other.example.com/' })
    .then(
      () => undefined,
      (failed: unknown) => failed,
    )
  assert.equal(codeOf(error), 'T0035')
  // The packages are named by the map, which knows a package by the network modules it imports; what was tried is the host.
  assert.match(String(Reflect.get(Object(error), 'message')), /other\.example\.com/, 'what it tried is named')
})
