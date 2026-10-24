import assert from 'node:assert/strict'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { connect as connectTwo, constants } from 'node:http2'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { connect } from 'node:tls'
import type { EngineOptions } from '../../engine/index.ts'
import { createEngine, keptAlone } from '../../engine/index.ts'
import type { Authority } from './authority.ts'
import { startAuthority } from './authority.ts'
import {
  builtShop,
  endedBeforeFolders,
  freePort,
  plainly,
  rootsIn,
  securely,
  served,
  startTent,
  untilMinute,
  workOf,
} from './secured.ts'

/** The ports of one test, its authority, which looks for the proofs there, and the file of its root. */
async function standing(
  t: TestContext,
  folder: string,
): Promise<{ port: number; plain: number; authority: Authority; roots: string }> {
  const [port, plain] = [await freePort(), await freePort()]
  const authority = await startAuthority(t, { plainPort: plain, securePort: port })
  return { port, plain, authority, roots: rootsIn(folder, authority.root) }
}

/** The words of `tent start` that serve names with certificates of the test authority. */
const secureWords = (s: { port: number; plain: number; authority: Authority; roots: string }): string[] => [
  // This computer alone: a server reached by its names would listen on every address.
  '--host',
  '127.0.0.1',
  '--port',
  String(s.port),
  '--secure',
  `plainPort=${s.plain}`,
  '--secure',
  `from=${s.authority.from}`,
  '--secure',
  `roots=${s.roots}`,
]

/** Opens the shop in an engine of the test's own, ended with the test, with `secure` as it is handed. */
async function secureEngine(
  t: TestContext,
  bundle: string,
  dataFolder: string,
  o: EngineOptions & { address?: string | string[] },
): Promise<{ close(): Promise<void> }> {
  const { address, ...options } = o
  const engine = createEngine({ notices: false, ...options })
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await engine.close()
  }
  endedBeforeFolders(t, close)
  await engine.open(bundle, { dataFolder, ...(address === undefined ? {} : { address }) })
  return { close }
}

/** The lines of the log of a data folder at a level, as their messages. */
function logLines(dataFolder: string, level: string): string[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT message FROM lines WHERE level = ? ORDER BY rowid')
      .all(level)
      .map((row) => String(row.message))
  } finally {
    log.close()
  }
}

test('[41-9] tent start with a domain serves over a secure connection, by the proof on the plain port, with a test authority whose root --secure roots= names', async (t) => {
  const folder = workOf(t, 'plain-proof')
  const { project, bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  const run = startTent(t, [bundle, '--data', data, '--domain', 'shop.test,www.shop.test', ...secureWords(s)], {
    cwd: project,
  })
  const first = await served(s.port, 'shop.test', s.authority.root)
  assert.equal(first.status, 200)
  assert.equal(first.headers['strict-transport-security'], 'max-age=31536000')
  await served(s.port, 'www.shop.test', s.authority.root)
  assert.deepEqual(s.authority.seen.proofs.map((one) => `${one.name} ${one.kind} ${one.held}`).sort(), [
    'shop.test http-01 true',
    'www.shop.test http-01 true',
  ])
  // Typing --domain agreed to the authority's terms, whose address the command printed the first time.
  await untilMinute(
    () => run.err.join('').includes(`${s.authority.from.replace(/\/dir$/, '')}/terms`),
    'the terms printed',
  )
  assert.equal(s.authority.seen.accounts, 1)
  // The account's key and the certificates lie under certs/ of the data folder, readable only by the current user.
  const certs = join(data, 'certs')
  for (const file of readdirSync(certs).filter((one) => one.endsWith('.key') || one.endsWith('.pem')))
    assert.equal(keptAlone(join(certs, file)).why, undefined, file)
  assert.ok(existsSync(join(certs, 'shop.test.pem')))
  // The plain port sends a listed name to its secure address, and answers T0017 to any other name.
  const moved = await plainly(s.plain, 'shop.test', '/hello?x=1')
  assert.equal(moved.status, 308)
  assert.equal(moved.headers.location, `https://shop.test:${s.port}/hello?x=1`)
  const other = await plainly(s.plain, 'elsewhere.test', '/hello')
  assert.equal(other.status, 421)
  assert.equal(JSON.parse(other.body).error.code, 'T0017')
  assert.equal(other.headers.location, undefined)
  // A secure connection that names no listed name is closed at its start, and no certificate is asked for it.
  await assert.rejects(securely(s.port, 'elsewhere.test', '/hello', s.authority.root))
  assert.equal(s.authority.seen.orders.includes('elsewhere.test'), false)
  // The proof was answered before the route on its path: the route answers over the secure connection, and the
  // plain port answers the authority for no token it was not given.
  assert.equal(
    (await securely(s.port, 'shop.test', '/.well-known/acme-challenge/any', s.authority.root)).body,
    'the route',
  )
  assert.equal((await plainly(s.plain, 'shop.test', '/.well-known/acme-challenge/any')).status, 308)
  assert.equal((await securely(s.port, 'shop.test', '/hello', s.authority.root)).body, 'hello')
  await run.stop()
})

test('[41-9] tent start with a domain and --seed applies the seed to empty data, and serves its names', async (t) => {
  const folder = workOf(t, 'seeded-domain')
  const { project, bundle } = await builtShop(folder, {
    'tables/notes.ts': `import { anyone, table, text } from 'tentjs'\n\nexport const notes = table('notes', {\n  columns: { words: text() },\n  access: { read: anyone('the notes are open') },\n})\n`,
    'seed.ts': `import { seed } from 'tentjs'\nimport { notes } from './tables/notes'\n\nexport default seed([notes.add({ words: 'first' })])\n`,
  })
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  // The command asks the app it opened whether the data is empty, by a name the app serves.
  const run = startTent(t, [bundle, '--data', data, '--seed', '--domain', 'shop.test', ...secureWords(s)], {
    cwd: project,
  })
  assert.equal((await served(s.port, 'shop.test', s.authority.root)).status, 200, run.err.join(''))
  const said = run.err.join('')
  assert.doesNotMatch(said, /T0017|the seed was not applied/)
  await run.stop()
  // Started again on that data, the seed is not applied twice, and the command says so.
  const again = startTent(t, [bundle, '--data', data, '--seed', '--domain', 'shop.test', ...secureWords(s)], {
    cwd: project,
  })
  await untilMinute(() => again.err.join('').includes('the seed was not applied'), 'the seed left alone')
  await again.stop()
})

test('[41-9] where the plain port cannot be listened on, the name is proven inside the secure connection', async (t) => {
  const folder = workOf(t, 'inside-proof')
  const { project, bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  // Another program holds the plain port.
  const holder = createServer((socket) => socket.destroy())
  await new Promise<void>((done) => holder.listen(s.plain, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => holder.close(() => done())))
  const data = join(folder, 'data')
  startTent(t, [bundle, '--data', data, '--domain', 'shop.test', ...secureWords(s)], { cwd: project })
  const first = await served(s.port, 'shop.test', s.authority.root)
  assert.equal(first.status, 200)
  assert.deepEqual(
    s.authority.seen.proofs.map((one) => `${one.name} ${one.kind} ${one.held}`),
    ['shop.test tls-alpn-01 true'],
  )
})

test('[41-9] the sixth try of an hour waits, counted for each name by itself, across starts; a flood after the certificates were removed asks no more', async (t) => {
  const folder = workOf(t, 'rate')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  s.authority.refuseAll = true
  const secure = {
    names: ['shop.test'],
    from: s.authority.from,
    roots: s.roots,
    port: s.port,
    plainPort: s.plain,
  }
  const tries = (): number => s.authority.seen.orders.filter((one) => one === 'shop.test').length
  // Each start of an engine asks once for a name that has no certificate, until the hour's five are used.
  for (let start = 1; start <= 6; start++) {
    const engine = await secureEngine(t, bundle, data, { secure, address: `shop.test:${s.port}` })
    if (start <= 5) await untilMinute(() => tries() === start, `try ${start}`)
    else
      await untilMinute(
        () => logLines(data, 'warning').some((line) => /waits until/.test(line)),
        'the word that the try waits',
      )
    // A flood of first requests for the name asks for no more.
    await Promise.allSettled(
      Array.from({ length: 30 }, () => securely(s.port, 'shop.test', '/hello', s.authority.root)),
    )
    await engine.close()
  }
  assert.equal(tries(), 5)
  const warnings = logLines(data, 'warning')
  assert.ok(warnings.filter((line) => line.includes('shop.test')).length >= 5, warnings.join('\n'))
  // A failed try left nothing that is served: each connection was closed at its start.
  assert.equal(existsSync(join(data, 'certs', 'shop.test.pem')), false)
  // Another name is counted by itself.
  s.authority.refuseAll = false
  const other = await secureEngine(t, bundle, data, {
    secure: { ...secure, names: ['shop.test', 'other.test'] },
    address: [`shop.test:${s.port}`, `other.test:${s.port}`],
  })
  await served(s.port, 'other.test', s.authority.root)
  assert.equal(tries(), 5)
  await other.close()
  // The certificates are removed: the next start asks within the rate, and so does a flood of first requests.
  rmSync(join(data, 'certs', 'other.test.pem'))
  const again = await secureEngine(t, bundle, data, {
    secure: { ...secure, names: ['other.test'] },
    address: `other.test:${s.port}`,
  })
  await Promise.allSettled(Array.from({ length: 50 }, () => securely(s.port, 'other.test', '/hello', s.authority.root)))
  await served(s.port, 'other.test', s.authority.root)
  assert.equal(s.authority.seen.orders.filter((one) => one === 'other.test').length, 2)
  await again.close()
})

test('[41-9] a certificate with less than a third of its life left is renewed at the start, and the one before is served until the new one is there', async (t) => {
  const folder = workOf(t, 'renew')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  const secure = { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain }
  // The first certificate has 20 of its 90 days left.
  s.authority.backdate = 70 * 86_400
  const first = await secureEngine(t, bundle, data, { secure, address: `shop.test:${s.port}` })
  const old = (await served(s.port, 'shop.test', s.authority.root)).fingerprint
  assert.equal(old, s.authority.seen.given[0])
  await first.close()
  s.authority.backdate = 0
  await secureEngine(t, bundle, data, { secure, address: `shop.test:${s.port}` })
  const seen = new Set<string>()
  await untilMinute(async () => {
    const one = await securely(s.port, 'shop.test', '/hello', s.authority.root).catch(() => undefined)
    if (one?.fingerprint) seen.add(one.fingerprint)
    return one?.fingerprint === s.authority.seen.given[1]
  }, 'the renewed certificate')
  assert.equal(s.authority.seen.given.length, 2)
  // No connection was closed or served otherwise meanwhile: each was served the one before or the new one.
  for (const one of seen) assert.ok(s.authority.seen.given.includes(one))
  // A certificate with more than a third left is not renewed.
  assert.equal(s.authority.seen.orders.length, 2)
})

test('[41-9] --secure hsts=off leaves the header out; secure.names as a function serves a name that was added while it ran', async (t) => {
  const folder = workOf(t, 'names')
  const { project, bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const run = startTent(
    t,
    [bundle, '--data', join(folder, 'data'), '--domain', 'shop.test', ...secureWords(s), '--secure', 'hsts=off'],
    { cwd: project },
  )
  const plain = await served(s.port, 'shop.test', s.authority.root)
  assert.equal(plain.headers['strict-transport-security'], undefined)
  await run.stop()
  // In code, the names may be asked of a function: a name it answers yes to is served from then on.
  const allowed = new Set<string>()
  await secureEngine(t, bundle, join(folder, 'more'), {
    secure: {
      names: (name) => allowed.has(name),
      from: s.authority.from,
      roots: s.roots,
      port: s.port,
      plainPort: s.plain,
    },
    address: '*',
  })
  await assert.rejects(securely(s.port, 'late.test', '/hello', s.authority.root))
  assert.equal(s.authority.seen.orders.includes('late.test'), false)
  allowed.add('late.test')
  const late = await served(s.port, 'late.test', s.authority.root)
  assert.equal(late.status, 200)
  assert.equal(late.headers['strict-transport-security'], 'max-age=31536000')
})

test('[41-9] over the newer form of the web a connection is held to atOnce requests under way, and one that drops more than that many within a second is closed', async (t) => {
  const folder = workOf(t, 'newer')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  await secureEngine(t, bundle, join(folder, 'data'), {
    secure: { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain },
    web: { atOnce: 3 },
    address: `shop.test:${s.port}`,
  })
  await served(s.port, 'shop.test', s.authority.root)
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
  t.after(() => session.destroy())
  const settings = await new Promise<{ maxConcurrentStreams?: number }>((done) => session.once('remoteSettings', done))
  assert.equal(settings.maxConcurrentStreams, 3)
  // Three slow requests stand under way at once, each answered over the newer form.
  const asked = (path: string): Promise<{ status: number; body: string }> =>
    new Promise((done, failed) => {
      const stream = session.request({ ':path': path, ':authority': `shop.test:${s.port}` })
      let status = 0
      let body = ''
      stream.on('response', (headers) => {
        status = Number(headers[':status'])
      })
      stream.setEncoding('utf8').on('data', (part: string) => {
        body += part
      })
      stream.on('end', () => done({ status, body }))
      stream.on('error', failed)
    })
  const three = await Promise.all([asked('/slow'), asked('/slow'), asked('/slow')])
  assert.deepEqual(
    three.map((one) => `${one.status} ${one.body}`),
    ['200 slow', '200 slow', '200 slow'],
  )
  // A sender that drops its requests as fast as it opens them is closed.
  const closed = new Promise<void>((done) => session.once('close', () => done()))
  for (let k = 0; k < 20 && !session.closed && !session.destroyed; k++) {
    const stream = session.request({ ':path': '/slow', ':authority': `shop.test:${s.port}` })
    stream.on('error', () => undefined)
    stream.close(constants.NGHTTP2_CANCEL)
  }
  await Promise.race([
    closed,
    new Promise((_, failed) => setTimeout(() => failed(new Error('the connection stayed open')), 5000)),
  ])
})

test('[41-12.32] a sender that opens requests and drops each once it is sent is closed, whatever code it drops them with', async (t) => {
  const folder = workOf(t, 'drops')
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
    // The runtime sends nothing of a request that is closed in the turn it was made, so each is dropped a turn after.
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

test('[41-12.13] a thousand requests for a name that --domain does not list, over the secure port and over the plain one, ask for no certificate: closed, and T0017 with no 308', async (t) => {
  const folder = workOf(t, 'unlisted')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  await secureEngine(t, bundle, join(folder, 'data'), {
    secure: { names: ['shop.test'], from: s.authority.from, roots: s.roots, port: s.port, plainPort: s.plain },
    address: `shop.test:${s.port}`,
  })
  await served(s.port, 'shop.test', s.authority.root)
  const before = s.authority.seen.orders.length
  let refused = 0
  let wrong = 0
  for (let round = 0; round < 50; round++) {
    const secure = await Promise.allSettled(
      Array.from({ length: 10 }, (_, k) => securely(s.port, `x${round}-${k}.test`, '/hello', s.authority.root)),
    )
    refused += secure.filter((one) => one.status === 'rejected').length
    const plain = await Promise.all(
      Array.from({ length: 10 }, (_, k) => plainly(s.plain, `x${round}-${k}.test`, '/hello')),
    )
    wrong += plain.filter((one) => one.status === 421 && one.headers.location === undefined).length
  }
  assert.equal(refused, 500)
  assert.equal(wrong, 500)
  assert.equal(s.authority.seen.orders.length, before)
})

test('[41-12.14] a flood of first requests for listed names after the certificates were removed is held to secure.rate', async (t) => {
  const folder = workOf(t, 'flood')
  const { bundle } = await builtShop(folder)
  const s = await standing(t, folder)
  const data = join(folder, 'data')
  const secure = {
    names: ['shop.test'],
    from: s.authority.from,
    roots: s.roots,
    port: s.port,
    plainPort: s.plain,
    rate: 2,
  }
  s.authority.refuseAll = true
  for (let start = 0; start < 4; start++) {
    const engine = await secureEngine(t, bundle, data, { secure, address: `shop.test:${s.port}` })
    await Promise.allSettled(
      Array.from({ length: 100 }, () => securely(s.port, 'shop.test', '/hello', s.authority.root)),
    )
    await untilMinute(() => s.authority.seen.orders.length >= Math.min(start + 1, 2), `the try of start ${start}`)
    await engine.close()
  }
  assert.equal(s.authority.seen.orders.length, 2)
})
