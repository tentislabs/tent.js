import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dial } from '../borrowed/ws.ts'
import type { Frame, Link } from '../index.ts'
import { bundled, engineOf, portOf, system, workFolder } from './apps.ts'

const key = 'k'.repeat(40)

const moment = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function until(what: string, holds: () => boolean, tries = 600): Promise<void> {
  for (let i = 0; i < tries && !holds(); i++) await moment()
  assert.equal(holds(), true, `never: ${what}`)
}

/** Takes one end of a link, and answers what it was sent and whether it was closed. */
function heard(link: Link): { texts: Record<string, unknown>[]; bytes: Uint8Array[]; closed: () => boolean } {
  const texts: Record<string, unknown>[] = []
  const bytes: Uint8Array[] = []
  let closed = false
  link.each(
    (frame: Frame) => void (typeof frame === 'string' ? texts.push(JSON.parse(frame)) : bytes.push(frame)),
    () => {
      closed = true
    },
  )
  return { texts, bytes, closed: () => closed }
}

test('[29-2] the link over the network is a WebSocket of the borrowed part: a text and the bytes of a record cross it whole and in order, a key that is none is not found, and a link that the writer closes is told closed', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const dataFolder = join(work, 'writer')
  const app = await engineOf(t).open(bundle.folder, { dataFolder, mode: 'test', readers: [key], insecure: true })
  const address = `http://127.0.0.1:${portOf(dataFolder)}/_t/copy`
  // A write whose record is larger than one frame of 64 kB holds, so that its bytes cross in more than one piece.
  const long = 'x'.repeat(300_000)
  await app.write([{ add: 'tags', values: { name: 'first' } }], { as: system })
  const place = { n: app.at().n, epoch: app.at().epoch, sum: app.at().sum }
  await app.write([{ add: 'tags', values: { name: long } }], { as: system })

  // What is sent before the opening has passed waits for it: the place of the reader is the first frame.
  const link = dial(address, { authorization: `Bearer ${key}` })
  link.send(JSON.stringify({ t: 'from', id: 'machine-one', ...place, far: false, engine: '3', layout: 1 }))
  const got = heard(link)
  await until('the record of the long write arrived', () => got.bytes.length === 1)
  // Everything on a link arrives in the order it was sent: the place is taken, then the versions, then the write.
  assert.deepEqual(got.texts.map((one) => one.t).slice(0, 3), ['go', 'versions', 'wrote'])
  assert.ok(got.bytes[0].length > 300_000, `the record holds ${got.bytes[0].length} bytes`)
  assert.ok(Buffer.from(got.bytes[0]).includes(long), 'the bytes of the record arrived whole')
  assert.ok(got.bytes[0] instanceof Uint8Array)
  // A frame that is no message closes the link, and the reader's end is told.
  link.send(new Uint8Array([1, 2, 3]))
  await until('the link was closed by the writer', () => got.closed())

  // With a key that is none the opening is refused, and the link is told closed; so is one to a port nobody holds.
  const refused = heard(dial(address, { authorization: `Bearer ${'x'.repeat(40)}` }))
  await until('a link with no key of a reader was closed', () => refused.closed())
  assert.deepEqual(refused.texts, [])
  const nobody = heard(dial('http://127.0.0.1:9/_t/copy', { authorization: `Bearer ${key}` }))
  await until('a link to nobody was closed', () => nobody.closed())

  // A link that its opener closes is told closed at once, and the writer hears that the reader left.
  const second = dial(address, { authorization: `Bearer ${key}` })
  const mine = heard(second)
  second.send(JSON.stringify({ t: 'from', id: 'machine-two', ...place, far: false, engine: '3', layout: 1 }))
  await until('the second link was taken', () => mine.texts.some((one) => one.t === 'go'))
  second.close()
  assert.equal(mine.closed(), true)
  await until('the writer lost the reader', () => app.machines().length === 1)
})

test('[29-2] one file of the engine imports the borrowed WebSocket part, and the engine holds no WebSocket of its own', () => {
  const engine = fileURLToPath(new URL('..', import.meta.url))
  const importing: string[] = []
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'tests') walk(path)
      } else if (entry.name.endsWith('.ts') && /from 'ws'|import\('ws'\)/.test(readFileSync(path, 'utf8')))
        importing.push(path.slice(engine.length).replaceAll('\\', '/'))
    }
  }
  walk(engine)
  assert.deepEqual(importing, ['borrowed/ws.ts'])
  assert.equal(existsSync(join(engine, 'web', 'socket.ts')), false)
})
