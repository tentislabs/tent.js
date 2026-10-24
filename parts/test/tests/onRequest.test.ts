import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { EngineOptions } from '../../engine/index.ts'
import { closing, copyOf } from './projects.ts'
import type { Siege } from './sieges.ts'
import { besieged, wire } from './sieges.ts'

/** The project whose `onRequest` says what it was handed, opened in an engine with what the test gives it. */
async function opened(t: TestContext, onRequest: NonNullable<EngineOptions['onRequest']>): Promise<Siege> {
  const project = copyOf(t, 'handed')
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  return besieged(t, { bundle: made.bundleFolder, engine: { onRequest }, open: { address: '*' } })
}

/** Asks for the opening of `/_t/live` over a real connection, and answers the status that it was answered. */
function liveStatus(t: TestContext, siege: Siege, headers: Record<string, string>): Promise<number> {
  return new Promise((done, failed) => {
    const asking = request({
      host: '127.0.0.1',
      port: siege.port,
      path: '/_t/live',
      headers: {
        host: `localhost:${siege.port}`,
        origin: siege.origin,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
        ...headers,
      },
    })
    asking.on('upgrade', (answer, socket) => {
      closing(t, () => socket.destroy())
      done(answer.statusCode ?? 0)
    })
    asking.on('response', (answer) => {
      answer.resume()
      done(answer.statusCode ?? 0)
    })
    asking.on('error', failed)
    asking.end()
  })
}

test('[22-18] createEngine({ onRequest }) is called before the onRequest of the app, answers a request itself or hands it on, and its error is the general error', async (t) => {
  const siege = await opened(t, async (asked, next, about) => {
    const url = new URL(asked.url)
    assert.deepEqual(Object.keys(about).sort(), ['from', 'origin'])
    if (url.pathname === '/host-only') return new Response('answered by the program')
    if (url.pathname === '/host-fails') throw new Error('the code of the program failed')
    const headers = new Headers(asked.headers)
    headers.set('x-seen', 'by the program')
    const answer = await next(
      new Request(asked.url, { method: asked.method, headers, body: (await asked.text()) || null }),
    )
    answer.headers.set('x-program', 'first')
    return answer
  })
  // The program answers itself: the app is never asked, so its header is not there.
  const own = await wire(siege, { method: 'GET', path: '/host-only' })
  assert.deepEqual([own.status, own.text, own.headers['x-app']], [200, 'answered by the program', undefined])
  // What it hands on is handed to the function of the app next, which sees what the program added.
  const who = await wire(siege, { method: 'GET', path: '/who' })
  assert.deepEqual([who.body, who.headers['x-program']], [{ seen: 'by the program' }, 'first'])
  // And the function of the app hands it on to the door: both have added their header to the answer.
  const call = await wire(siege, { path: '/_t/call/hello' })
  assert.deepEqual(
    [call.body, call.headers['x-app'], call.headers['x-program']],
    [{ ok: true, value: 'hello' }, 'handed', 'first'],
  )
  const failed = await wire(siege, { method: 'GET', path: '/host-fails' })
  assert.deepEqual([failed.status, failed.error.code], [500, 'T0009'])
  assert.equal(failed.text.includes('the code of the program failed'), false)
  assert.equal((await wire(siege, { method: 'GET', path: '/who' })).status, 200)
})

test('[21-12] onRequest is never handed a command of this computer, and refuses the opening of the live connection by answering itself', async (t) => {
  const seen: string[] = []
  const siege = await opened(t, (asked, next) => {
    seen.push(new URL(asked.url).pathname)
    return next(asked)
  })
  // A command of this computer is answered by the engine: neither function is handed it.
  const command = await wire(siege, {
    path: '/_t/admin/status',
    headers: { authorization: `Bearer ${siege.token}` },
    body: '{"args":{}}',
  })
  assert.notEqual(command.status, 418)
  assert.equal(command.text.includes('never'), false)
  assert.deepEqual(seen, [])
  // The live connection: the function of the app lets one visitor in, and refuses another by answering itself.
  assert.equal(await liveStatus(t, siege, {}), 101)
  assert.equal(await liveStatus(t, siege, { 'x-visitor': 'unwelcome' }), 403)
  // The function of the program is asked for the opening too, before that of the app.
  assert.deepEqual(seen, ['/_t/live', '/_t/live'])
})
