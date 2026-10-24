import assert from 'node:assert/strict'
import type { Socket } from 'node:net'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import type { App } from '../index.ts'
import type { Bundle } from './apps.ts'
import { bundled, engineOf, logRows, portOf, send, workFolder } from './apps.ts'
import { current, readerIn, worldOf, writerIn } from './machines.ts'

// Five requests a minute from one address, so that the sixth is one too many.
const few = {
  change: (description: Bundle['description']) => {
    description.project.limits = { ...Object(description.project.limits), anyonePerMinute: 5 }
  },
}

const addWord = (app: App, text: string, headers: Record<string, string> = {}) =>
  send(app, 'https://far.test/_t/call/addWord', { input: { text }, headers, from: '203.0.113.9' })

test('[29-3] a reader passes steps 2 to 4 of the door itself before it hands a request on: a request from another site, and one request too many, are refused by the reader, counted in its own _t_rate, and never cross to the writer', async (t) => {
  const world = worldOf(t)
  await writerIn(world, await bundled(t, few, world.work))
  const far = await readerIn(world, 'far')
  await current(world, far)
  const [writerData, farData] = [join(world.work, 'writer'), join(world.work, 'far')]
  const crossed = (): number => world.asked['/_t/call/addWord'] ?? 0
  const handed = (): number => logRows(farData, 'calls').filter((row) => row.kind === 'handed').length
  // Step 2: a change that another site sent is refused where it arrived.
  const other = await addWord(far, 'from another site', { origin: 'https://evil.example' })
  assert.equal(other.error.code, 'T0004')
  assert.deepEqual([crossed(), handed()], [0, 0])
  assert.equal(logRows(writerData, 'lines').filter((row) => row.message === 'A reader handed a request on.').length, 0)
  // Step 4: the reader counts what passed step 2. Five requests pass, and cross; the next one is one too many.
  for (let i = 0; i < 5; i++) assert.equal((await addWord(far, `word ${i}`)).status, 200)
  assert.deepEqual([crossed(), handed()], [5, 5])
  const over = await addWord(far, 'one too many')
  assert.equal(over.error.code, 'T0005')
  assert.deepEqual([crossed(), handed()], [5, 5])
  // Each refusal is a row of the reader's own log, as step 10 writes one.
  const refused = logRows(farData, 'calls').filter((row) => row.ok === 0 && row.kind !== 'handed')
  assert.deepEqual(
    refused.map((row) => row.code),
    ['T0004', 'T0005'],
  )
})

// The machines beat five times a second, so that a reader knows within a second that its writer is gone.
const quick = {
  change: (description: Bundle['description']) => {
    description.project.limits = { ...Object(description.project.limits), beat: 200, behind: 1000 }
  },
}

const key = 'f'.repeat(40)

async function until(what: string, holds: () => boolean, ms = 30_000): Promise<void> {
  for (const ends = performance.now() + ms; performance.now() < ends; ) {
    if (holds()) return
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.fail(`never: ${what}`)
}

/** Something on a port that takes each connection, reads what it is sent, and ends the connection with half an answer. */
function halfAnswers(t: TestContext, port: number): Promise<{ taken: () => number }> {
  const sockets: Socket[] = []
  const server = createServer((socket) => {
    sockets.push(socket)
    socket.on('error', () => undefined)
    socket.once('data', () => {
      socket.write('HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 500\r\n\r\n{"ok":true,"val')
      setTimeout(() => socket.destroy(), 50)
    })
  })
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done({ taken: () => sockets.length })))
}

test('[29-3] a request that a reader could not send says so with T0029 and no sent, and one that left the reader and whose answer did not arrive whole says sent', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, quick, work)
  const [writerData, farData] = [join(work, 'writer'), join(work, 'far')]
  const readers = [{ key, far: true as const }]
  const first = engineOf(t)
  await first.open(bundle.folder, { dataFolder: writerData, mode: 'test', readers, insecure: true })
  const writerPort = portOf(writerData)
  const far = await engineOf(t).read({
    from: `http://127.0.0.1:${writerPort}`,
    key,
    far: true,
    dataFolder: farData,
    insecure: true,
  })
  await until('the far reader is current', () => far.at().current)
  const asked = () =>
    send(far, `http://127.0.0.1:${portOf(farData)}/_t/call/addWord`, { input: { text: 'through the reader' } })
  // The writer is gone and its port refuses: the request could not be sent.
  await first.close()
  const unsent = await asked()
  assert.deepEqual([unsent.error.code, Object(unsent.error.fields).sent], ['T0029', undefined])
  // Something takes the connection and the request, and breaks its answer off: the request left this machine.
  const listener = await halfAnswers(t, writerPort)
  const broken = await asked()
  assert.ok(listener.taken() >= 1)
  assert.deepEqual([broken.error.code, Object(broken.error.fields).sent], ['T0029', 'true'])
})

test('[21-1] [05-2.1] step 1 of the door: a request that comes in with headers that start with x-tent- is handed on to the writer with none of them, and with every other header it carried', async (t) => {
  const world = worldOf(t)
  await writerIn(world, await bundled(t, {}, world.work))
  // The far reader reaches its writer through the test, which keeps each request as the reader sent it.
  const crossed: Request[] = []
  const far = await readerIn(world, 'far', world.engine(), (to) => {
    const inner = world.reach(to)
    if (!inner) return undefined
    return {
      link: (request) => inner.link(request),
      request(request, o) {
        crossed.push(request.clone())
        return inner.request(request, o)
      },
    }
  })
  await current(world, far)
  crossed.length = 0
  const forged = { 'x-tent-user': 'the-id-of-an-admin', 'X-Tent-Roles': 'admin', 'x-tent-': 'x', 'x-other': 'stays' }
  const answered = await send(far, 'https://far.test/_t/call/addWord', { input: { text: 'a word' }, headers: forged })
  assert.equal(answered.status, 200)
  assert.equal(crossed.length, 1)
  const names = [...crossed[0].headers.keys()]
  assert.deepEqual(
    names.filter((name) => name.startsWith('x-tent-')),
    [],
  )
  assert.equal(crossed[0].headers.get('x-other'), 'stays')
})
