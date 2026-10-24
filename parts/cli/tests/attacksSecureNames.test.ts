import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { connect as connectTwo, constants } from 'node:http2'
import { request as secureRequest } from 'node:https'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { connect } from 'node:tls'
import type { EngineOptions } from '../../engine/index.ts'
import { createEngine, keptAlone } from '../../engine/index.ts'
import type { Authority } from './authority.ts'
import { startAuthority } from './authority.ts'
import { builtShop, endedBeforeFolders, freePort, plainly, rootsIn, served, workOf } from './secured.ts'

// The attacks of the reviewer on an app that serves secure names itself.

/** The ports of one test, its authority, and the file of its root. */
async function standing(
  t: TestContext,
  folder: string,
): Promise<{ port: number; plain: number; authority: Authority; roots: string }> {
  const [port, plain] = [await freePort(), await freePort()]
  const authority = await startAuthority(t, { plainPort: plain, securePort: port })
  return { port, plain, authority, roots: rootsIn(folder, authority.root) }
}

/** Opens the shop in an engine of the test's own, ended with the test. */
async function secureEngine(
  t: TestContext,
  bundle: string,
  dataFolder: string,
  o: EngineOptions & { address?: string | string[] },
): Promise<void> {
  const { address, ...options } = o
  const engine = createEngine({ notices: false, ...options })
  endedBeforeFolders(t, () => engine.close())
  await engine.open(bundle, { dataFolder, ...(address === undefined ? {} : { address }) })
}

/** Asks the secure port with one name at the start of the connection, and another in `Host`. */
function crossed(port: number, name: string, host: string, roots: string): Promise<{ status: number; body: string }> {
  return new Promise((done, failed) => {
    const asked = secureRequest(
      { host: '127.0.0.1', port, path: '/hello', servername: name, headers: { host }, ca: roots, agent: false },
      (answer) => {
        const parts: Buffer[] = []
        answer.on('data', (part: Buffer) => parts.push(part))
        answer.on('end', () => done({ status: answer.statusCode ?? 0, body: Buffer.concat(parts).toString('utf8') }))
      },
    )
    asked.on('error', failed)
    asked.end()
  })
}

test('[41-12.30] certs/ is read by no other user; the proof address with a path that climbs, and with a token the engine was not given, answers no proof; a route of the app on that path does not win over the engine', async (t) => {
  const folder = workOf(t, 'review-proof')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  await secureEngine(t, bundle, data, {
    secure: { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain },
    address: `shop.test:${s.port}`,
  })
  await served(s.port, 'shop.test', s.authority.root)
  // Every file in it, whatever it holds.
  const held = readdirSync(join(data, 'certs')).map(
    (file) => `${file}: ${keptAlone(join(data, 'certs', file)).why ?? 'the current user alone'}`,
  )
  assert.deepEqual(
    held,
    held.map((line) => `${line.split(': ')[0]}: the current user alone`),
  )
  for (const path of [
    '/.well-known/acme-challenge/../../x',
    '/.well-known/acme-challenge/..%2f..%2fx',
    '/.well-known/acme-challenge/not-given',
  ]) {
    const answer = await plainly(s.plain, 'shop.test', path)
    assert.notEqual(answer.status, 200, path)
    assert.notEqual(answer.body, 'the route', path)
  }
  // An address of the proof that names no listed name is T0017, and the route of the app is not asked.
  const other = await plainly(s.plain, 'elsewhere.test', '/.well-known/acme-challenge/not-given')
  assert.equal(JSON.parse(other.body).error.code, 'T0017')
})

test('[41-12.31] a secure connection that names a listed name at its start and another Host inside is T0017', async (t) => {
  const folder = workOf(t, 'review-crossed')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  await secureEngine(t, bundle, join(folder, 'data'), {
    secure: { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain },
    address: `shop.test:${s.port}`,
  })
  await served(s.port, 'shop.test', s.authority.root)
  assert.equal((await crossed(s.port, 'shop.test', `shop.test:${s.port}`, s.authority.root)).body, 'hello')
  for (const host of ['elsewhere.test', `127.0.0.1:${s.port}`, `localhost:${s.port}`]) {
    const answer = await crossed(s.port, 'shop.test', host, s.authority.root)
    assert.equal(answer.status, 421, host)
    assert.equal(JSON.parse(answer.body).error.code, 'T0017', host)
  }
})

test('[41-12.32] over the newer form of the web, a connection that opens and drops requests without end is closed, whatever code it drops them with', async (t) => {
  const folder = workOf(t, 'review-drops')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  await secureEngine(t, bundle, join(folder, 'data'), {
    secure: { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain },
    web: { atOnce: 3 },
    address: `shop.test:${s.port}`,
  })
  await served(s.port, 'shop.test', s.authority.root)
  const seen: string[] = []
  for (const [name, code] of [
    ['cancel', constants.NGHTTP2_CANCEL],
    ['no error', constants.NGHTTP2_NO_ERROR],
    ['refused stream', constants.NGHTTP2_REFUSED_STREAM],
    ['internal error', constants.NGHTTP2_INTERNAL_ERROR],
  ] as const) {
    const session = connectTwo(`https://shop.test:${s.port}`, {
      createConnection: () =>
        connect({
          host: '127.0.0.1',
          port: s.port,
          servername: 'shop.test',
          ALPNProtocols: ['h2'],
          ca: s.authority.root,
        }),
    })
    session.on('error', () => undefined)
    t.after(() => session.destroy())
    await new Promise((done) => session.once('remoteSettings', done))
    const closed = new Promise<boolean>((done) => session.once('close', () => done(true)))
    // The runtime sends nothing of a request that is closed in the turn it was made: each is dropped a turn after.
    const turn = (): Promise<void> => new Promise((done) => setImmediate(done))
    for (let k = 0; k < 40 && !session.closed && !session.destroyed; k++) {
      const stream = session.request({ ':path': '/slow', ':authority': `shop.test:${s.port}` })
      stream.on('error', () => undefined)
      await turn()
      stream.close(code)
      await turn()
    }
    // Well within `web.closeAfter` (5 seconds), after which an idle connection is closed for its own reason.
    const ended = await Promise.race([closed, new Promise<boolean>((done) => setTimeout(() => done(false), 2000))])
    seen.push(`${name}: ${ended ? 'closed' : 'open'}`)
    session.destroy()
  }
  assert.deepEqual(seen, ['cancel: closed', 'no error: closed', 'refused stream: closed', 'internal error: closed'])
})

test('[41-12.37] --secure from= an address over plain http is refused: nothing is asked of it', async (t) => {
  const folder = workOf(t, 'review-from')
  const { bundle } = await builtShop(folder)
  const [port, plain] = [await freePort(), await freePort()]
  const asked: string[] = []
  const stand = createServer((request, response) => {
    asked.push(String(request.url))
    response.writeHead(404).end()
  })
  await new Promise<void>((done) => stand.listen(0, '127.0.0.1', done))
  endedBeforeFolders(t, () => new Promise((done) => stand.close(done)))
  const at = stand.address()
  const from = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}/directory`
  await secureEngine(t, bundle, join(folder, 'data'), {
    secure: { names: ['shop.test'], from, port, plainPort: plain },
    address: `shop.test:${port}`,
  })
  await new Promise((done) => setTimeout(done, 4000))
  assert.deepEqual(asked, [])
})
