import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Siege } from './sieges.ts'
import { besieged, byWire, wire } from './sieges.ts'

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** The head of an upload of some length, of which no byte is sent yet. */
const headOf = (siege: Siege, name: string, length: number): string =>
  `POST /_t/files?name=${name} HTTP/1.1\r\nHost: localhost:${siege.port}\r\nContent-Type: text/plain\r\nContent-Length: ${length}\r\n\r\n`

/** An app in which a visitor may upload, with the times of the engine set short, so that a test ends in seconds. */
const opened = (t: Parameters<typeof besieged>[0]): Promise<Siege> =>
  besieged(t, {
    engine: { web: { bodyCloseAfter: '1 second', closeAfter: '1 second', bodySpeed: '1 MB' } },
    open: { address: '*' },
    change: (description) => {
      description.project.uploads = { rule: 'anyone', why: 'a test uploads as a visitor' }
    },
  })

test('[22-17] an upload that keeps arriving for far longer than a connection may send nothing is taken, however slowly, and its bytes are those that were sent', async (t) => {
  const siege = await opened(t)
  const sender = await byWire(t, siege)
  const pieces = 16
  sender.write(headOf(siege, 'slow.txt', pieces * 10))
  // A piece every 250 ms: four seconds in all, each wait shorter than the second that a silent sender is given.
  for (let k = 0; k < pieces; k++) {
    await pause(250)
    sender.write(`piece ${String(k).padStart(2, '0')}\r\n`)
  }
  let text = ''
  for (let tries = 0; tries < 100 && !text.includes('"ok"'); tries++) {
    await pause(50)
    text = sender.arrived()
  }
  assert.match(text, /^HTTP\/1\.1 200 /)
  const value = Object(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)).value)
  assert.deepEqual([value.name, value.kind, value.size], ['slow.txt', 'text/plain', pieces * 10])
  sender.socket.destroy()
})

test('[22-17] an upload that sends nothing for as long as a connection may send nothing is closed, and leaves no file', async (t) => {
  const siege = await opened(t)
  const sender = await byWire(t, siege)
  sender.write(`${headOf(siege, 'stalled.txt', 1000)}the first bytes, and then nothing`)
  const closed = await sender.closed(6000)
  assert.ok(closed, 'the connection was closed')
  assert.equal(closed.text.includes('"ok":true'), false)
  // The app answers others, and what arrived of the upload is no file.
  const next = await wire(siege, {
    path: '/_t/files?name=next.txt',
    body: 'whole',
    headers: { 'content-type': 'text/plain' },
  })
  assert.equal(next.status, 200, next.text)
  const { existsSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const incoming = join(siege.dataFolder, 'files', '.incoming')
  for (let tries = 0; tries < 40 && existsSync(incoming) && readdirSync(incoming).length; tries++) await pause(50)
  assert.deepEqual(existsSync(incoming) ? readdirSync(incoming) : [], [])
})
