import assert from 'node:assert/strict'
import { lookup } from 'node:dns/promises'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import test from 'node:test'
import { fetchPart } from '../parts/engine/index.ts'

/** The parts that the engine pins, each by its name with its version. */
function pinned(): Map<string, string> {
  const list: unknown = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'parts', 'engine', 'fetched.json'), 'utf8'),
  )
  return new Map(
    (Array.isArray(list) ? list : []).map((line) => [
      String(Reflect.get(Object(line), 'name')),
      String(Reflect.get(Object(line), 'version')),
    ]),
  )
}

/** Answers once a connection is made, and refuses with its error. */
const connected = (port: number, host: string): Promise<void> =>
  new Promise((done, failed) => {
    const socket = connect(port, host)
    socket.once('connect', () => {
      socket.destroy()
      done()
    })
    socket.once('error', failed)
  })

test("[22-6@7a] every test runs with a runner's folder of its own that holds the stand-ins of the fetched parts; with them taken away a part is T0016, and nothing leaves this computer", async (t) => {
  const own = process.env.TENT_HOME
  assert.ok(own !== undefined && existsSync(own), "the run gave this test a runner's folder")
  // Each part that the engine pins stands there already: asking for it fetches nothing.
  for (const [name, version] of pinned())
    assert.equal(await fetchPart(name, { mode: 'live' }), join(own, 'fetched', `${name}@${version}`), name)

  // With the stand-ins taken away, a part is fetched, which finds no address but one of this computer: T0016.
  mkdirSync(join(process.cwd(), 'results'), { recursive: true })
  const bare = mkdtempSync(join(process.cwd(), 'results', 'bare-'))
  process.env.TENT_HOME = bare
  t.after(() => {
    process.env.TENT_HOME = own
    rmSync(bare, { recursive: true, force: true })
  })
  for (const [name] of pinned())
    await assert.rejects(fetchPart(name, { mode: 'live', time: 5000 }), { code: 'T0016' }, name)
  const fetched = join(bare, 'fetched')
  assert.deepEqual(existsSync(fetched) ? readdirSync(fetched).filter((one) => !one.startsWith('.')) : [], [])

  // Nothing leaves this computer: a name is looked up for nobody, and another computer is reached by nobody,
  // tried on an address that leads nowhere should the rig let it through.
  await assert.rejects(lookup('registry.npmjs.org'), /this computer/)
  await assert.rejects(connected(443, '192.0.2.1'), /this computer/)
  // An address of this computer is reached as ever.
  const server = createServer((socket) => socket.end())
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  await connected(Number(Reflect.get(Object(server.address()), 'port')), '127.0.0.1')
  assert.deepEqual((await lookup('localhost', { all: true })).length > 0, true)
})
