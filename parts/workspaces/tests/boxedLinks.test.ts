import assert from 'node:assert/strict'
import { request as sent } from 'node:http'
import { test } from 'node:test'
import { held, identify, nameOf } from './held.ts'
import { apartRoom } from '../../engine/index.ts'
import { testSandbox } from './sandbox.ts'

/**
 * Asks the engine on this computer to open a WebSocket at a path, under a name, as a browser that reached that name
 * would. Answers the status of the answer: 101 where the connection was opened, and holds it open until `close`.
 */
function opening(port: number, name: string, path: string): Promise<{ status: number; close(): void }> {
  return new Promise((done, failed) => {
    const asked = sent({
      host: '127.0.0.1',
      port,
      path,
      headers: {
        host: `${name}:${port}`,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('a test key of 16').toString('base64'),
        origin: `http://${name}:${port}`,
      },
      agent: false,
    })
    asked.on('upgrade', (answer, socket) => done({ status: answer.statusCode ?? 0, close: () => socket.destroy() }))
    asked.on('response', (answer) => {
      answer.resume()
      done({ status: answer.statusCode ?? 0, close: () => undefined })
    })
    asked.on('error', failed)
    asked.end()
  })
}

test('[52-10] [40-20] the live connection of a page of an app of anyone else is opened through the name of its workspace, in the product engine', async (t) => {
  const sandbox = testSandbox(t)
  const at = await held(t, { sandbox, room: apartRoom, identify })
  const made = await at.workspaces.create({ owner: 'ada', from: 'coded' })
  await at.workspaces.run(made.id)
  assert.equal(sandbox.started.length, 1, 'the workspace is built in its box')
  const live = await opening(at.port, nameOf(made.id), '/_t/live')
  assert.equal(live.status, 101, 'the live connection is opened')
  live.close()
  // A name that no workspace has opens nothing.
  const none = await opening(at.port, nameOf('01m0000000000000000000000z'), '/_t/live')
  assert.notEqual(none.status, 101)
})
