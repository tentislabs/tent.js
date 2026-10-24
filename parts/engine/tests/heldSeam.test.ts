import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { testApp } from '../../test/index.ts'
import { heldNative, heldProgram } from '../rooms/hold.ts'
import { workFolder } from './apps.ts'

// A package that sends a request out with the guarded fetch, and imports the module of the network for the words
// of a status, so the map names it as one that reaches the network.
const postOut = `import { STATUS_CODES } from 'node:http'
export async function postOut(url) { const answer = await fetch(url); return STATUS_CODES[answer.status] ?? String(answer.status) }`

const functions = `import { action, anyone, number, query, text } from 'tentjs'
import { postOut } from 'post-out'

const open = anyone('every visitor')

export const queryProcess = query('queryProcess', { access: open, output: number(), run: () => process.pid })

export const actionProcess = action('actionProcess', { access: open, output: number(), run: async () => process.pid })

// An action whose code ends the program it runs in.
export const endProcess = action('endProcess', { access: open, output: number(), run: async () => process.exit(Number('1')) })

export const sendAction = action('sendAction', {
  access: open,
  input: { url: text() },
  output: text(),
  run: async ({ input }) => postOut(input.url),
})
`

/** Lays the held app into a folder of the test, with `hold` as the caller states it, and answers the folder. */
function laid(t: TestContext, hold: string): string {
  const folder = workFolder(t)
  const files: Record<string, string> = {
    'tent.ts': `import { project } from 'tentjs'\nexport const held = project('held', { title: 'Held', privateHosts: ['127.0.0.1'], hold: ${hold} })\n`,
    'functions/ways.ts': functions,
    'node_modules/post-out/package.json': JSON.stringify({
      name: 'post-out',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    }),
    'node_modules/post-out/index.js': postOut,
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

const codeOf = (error: unknown): unknown => Reflect.get(Object(error), 'code')

test('[52-9] a project that states `hold` gets the held room: its actions run in a program of their own, and its queries in the engine', async (t) => {
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  assert.equal(await app.as('nobody').call('queryProcess', {}), process.pid)
  const held = await app.as('nobody').call('actionProcess', {})
  assert.equal(typeof held, 'number')
  assert.notEqual(held, process.pid, 'the action runs in the held program')
})

test('[52-9] an action whose code ends its held program is refused, and the next action runs in a held program made anew', async (t) => {
  const app = await testApp({ folder: laid(t, 'true'), room: 'program' })
  t.after(() => app.close())
  const first = await app.as('nobody').call('actionProcess', {})
  await assert.rejects(app.as('nobody').call('endProcess', {}))
  const next = await app.as('nobody').call('actionProcess', {})
  assert.equal(typeof next, 'number')
  assert.notEqual(next, first, 'the next action ran in a program made anew')
})

test('[52-9] with `hold` stated and the test room as the room, a fetch to a host `net` names answers, and one to another is T0035 naming its package', async (t) => {
  const port = await served(t)
  const app = await testApp({ folder: laid(t, "{ net: ['127.0.0.1'] }"), room: 'apart' })
  t.after(() => app.close())
  // Under a room the program gives, no held program is started: the action runs in the test room.
  assert.equal(await app.as('nobody').call('actionProcess', {}), process.pid)
  assert.equal(await app.as('nobody').call('sendAction', { url: `http://127.0.0.1:${port}/` }), 'OK')
  const error: unknown = await app
    .as('nobody')
    .call('sendAction', { url: 'http://other.example.com/' })
    .then(
      () => undefined,
      (failed: unknown) => failed,
    )
  assert.equal(codeOf(error), 'T0035')
  assert.match(String(Reflect.get(Object(error), 'message')), /post-out/, 'the package is named')
})

/** A description of the test: an app that states `hold`, whose map names the packages that reach each way out. */
const described = (hold: unknown, packages: Record<string, { out: string[] }>): Description =>
  Object({ app: { name: 'held' }, project: { hold }, packages })

test('[52-9] at `load` a package that loads a native module is refused with T0035 unless `native` names it, in every room', () => {
  const packages = { sharp: { out: ['native'] }, 'read-it': { out: ['files'] } }
  assert.throws(
    () => heldNative(described(true, packages)),
    (error: Error) => codeOf(error) === 'T0035' && /sharp/.test(error.message) && !/read-it/.test(error.message),
  )
  heldNative(described({ native: ['sharp'] }, packages))
  // Without the hold, nothing is refused.
  heldNative(described(undefined, packages))
})

test('[52-9] at `program` the program of an outside server is refused with T0035 unless `programs` names it, and a `python` program passes', () => {
  const start = { args: [], folder: '.', env: {} }
  assert.throws(
    () => heldProgram(described(true, {}), { ...start, for: 'mcp', command: 'ffmpeg' }),
    (error: Error) => codeOf(error) === 'T0035' && /ffmpeg/.test(error.message),
  )
  heldProgram(described({ programs: ['ffmpeg'] }, {}), { ...start, for: 'mcp', command: '/usr/bin/ffmpeg' })
  heldProgram(described(true, {}), { ...start, for: 'python', command: 'python3' })
  heldProgram(described(undefined, {}), { ...start, for: 'mcp', command: 'ffmpeg' })
})
