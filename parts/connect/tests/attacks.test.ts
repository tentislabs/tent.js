import assert from 'node:assert/strict'
import type { ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { brotliCompressSync, deflateSync, gzipSync, zstdCompressSync } from 'node:zlib'
import { TentError } from '../../core/index.ts'
import { addressWith, settled } from '../guardedAddress.ts'
import { fetchWith } from '../guardedFetch.ts'
import { failure, names, refused, standIn } from './servers.ts'

// An address of the open internet, which no test connects to: it is named only where the rule answers before
// any connection, or where nothing but the rule is asked.
const far = '93.184.216.34'

/** Holds that a promise is refused with T0022, by whichever rule. */
async function refusedAtAll(work: Promise<unknown>, what: string): Promise<void> {
  const error = await failure(work)
  assert.ok(error instanceof TentError && error.code === 'T0022', `${what}: ${error.name}: ${error.message}`)
}

/** Holds that a promise is refused with T0022 by one rule, and says what was tried where it is not. */
async function refusedBy(work: Promise<unknown>, rule: string, what: string): Promise<void> {
  const error = await failure(work)
  assert.ok(error instanceof TentError, `${what}: ${error.name}: ${error.message}`)
  assert.equal(`${error.code} ${error.fields?.rule}`, `T0022 ${rule}`, what)
}

/** Holds that a promise is refused with T0023 by one cap. */
async function cutBy(work: Promise<unknown>, cap: 'size' | 'time', what: string): Promise<void> {
  const error = await failure(work)
  assert.ok(error instanceof TentError, `${what}: ${error.name}: ${error.message}`)
  assert.equal(`${error.code} ${error.fields?.cap}`, `T0023 ${cap}`, what)
}

const hex = (high: number, low: number): string => ((high << 8) | low).toString(16)

/**
 * Answers the ways to write one IPv4 address that a reader of addresses may read otherwise than a connection
 * does: each means that address and no other.
 */
function formsOf(a: number, b: number, c: number, d: number): string[] {
  const number = a * 16_777_216 + b * 65_536 + c * 256 + d
  const wide = (text: string): string => text.replace(/\d/g, (digit) => String.fromCharCode(0xff10 + Number(digit)))
  const dotted = `${a}.${b}.${c}.${d}`
  return [
    dotted,
    String(number),
    `0x${number.toString(16)}`,
    `0X${number.toString(16).toUpperCase()}`,
    `0${number.toString(8)}`,
    [a, b, c, d].map((one) => `0${one.toString(8)}`).join('.'),
    [a, b, c, d].map((one) => `0x${one.toString(16)}`).join('.'),
    [a, b, c, d].map((one) => `0000${one.toString(8)}`).join('.'),
    `${a}.${b}.${c * 256 + d}`,
    `${a}.${b * 65_536 + c * 256 + d}`,
    `0x${a.toString(16)}.${b * 65_536 + c * 256 + d}`,
    `${dotted}.`,
    wide(dotted),
    dotted.replaceAll('.', '。'),
    dotted.replace(/\d/g, (digit) => `%3${digit}`),
    `${a}.${b}.${c}.%3${String(d).slice(0, 1)}${String(d).slice(1)}`,
    `[::ffff:${dotted}]`,
    `[::ffff:${hex(a, b)}:${hex(c, d)}]`,
    `[::FFFF:${hex(a, b).toUpperCase()}:${hex(c, d).toUpperCase()}]`,
    `[0:0:0:0:0:ffff:${hex(a, b)}:${hex(c, d)}]`,
    `[0000:0000:0000:0000:0000:ffff:${dotted}]`,
    `[::${dotted}]`,
    `[::${hex(a, b)}:${hex(c, d)}]`,
    `[64:ff9b::${dotted}]`,
    `[64:ff9b::${hex(a, b)}:${hex(c, d)}]`,
    `[2002:${hex(a, b)}:${hex(c, d)}::]`,
    `[2002:${hex(a, b)}:${hex(c, d)}:1::1]`,
  ]
}

test('[05-7.1] an address of this computer, of a private network and of the cloud, in every form it is written in, is refused', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const none = names({})
  const own = [
    ...formsOf(127, 0, 0, 1),
    ...formsOf(127, 255, 255, 254),
    '[::1]',
    '[0:0:0:0:0:0:0:1]',
    '[0000:0000:0000:0000:0000:0000:0000:0001]',
  ]
  const others = [
    ...formsOf(10, 0, 0, 5),
    ...formsOf(192, 168, 1, 1),
    ...formsOf(172, 16, 0, 1),
    ...formsOf(169, 254, 169, 254),
    ...formsOf(100, 64, 0, 1),
    ...formsOf(0, 0, 0, 0),
    '[::]',
    '[fe80::1]',
    '[FE80::1]',
    '[fe80::5efe:127.0.0.1]',
    '[febf::1]',
    '[fc00::1]',
    '[fd00:ec2::254]',
    '[fec0::1]',
    '[ff02::1]',
    '[64:ff9b:1::a9fe:a9fe]',
    '[2001::1]',
    '[2001:db8::1]',
    // An address with a zone, which the standard reader takes in no form.
    '[fe80::1%25eth0]',
    '[fe80::1%eth0]',
    '[::1%25lo]',
  ]

  for (const mode of ['test', 'live'] as const) {
    const fetch = fetchWith({ mode }, none.lookup)
    for (const host of [...own, ...others]) {
      await refusedBy(fetch(`https://${host}/`), 'private', `${mode} ${host}`)
      await refusedBy(fetch(`https://${host}:${inner.port}/latest/meta-data?key=1#part`), 'private', `${mode} ${host}`)
      await refusedAtAll(fetch(`http://${host}:${inner.port}/`), `${mode} http://${host}`)
    }
    // What a reader of addresses takes out before it reads: a tab and a line feed inside, and spaces around.
    for (const written of [
      `https://127.0.\t0.1:${inner.port}/`,
      `https://127.0.0\n.1:${inner.port}/`,
      `ht\ttps://127.0.0.1:${inner.port}/`,
      `  https://127.0.0.1:${inner.port}/  `,
      `https:\\\\127.0.0.1:${inner.port}\\`,
      `https://127.0.0.1:${inner.port}\\@outer.test/`,
      `HTTPS://127.0.0.1:${inner.port}/`,
      `https:127.0.0.1:${inner.port}`,
      `https:/127.0.0.1:${inner.port}/`,
      `https:///127.0.0.1:${inner.port}/`,
    ])
      await refusedAtAll(fetch(written), `${mode} ${JSON.stringify(written)}`)
    // The same forms as a host that a connection is opened to with no fetch.
    for (const host of [...own, ...others]) {
      const error = await failure(addressWith(host, { mode }, none.lookup))
      assert.ok(error instanceof TentError && error.code === 'T0022', `${mode} ${host}: ${error.message}`)
    }
  }
  // An address of a private network is refused in development too, in every form.
  const development = fetchWith({ mode: 'development' }, none.lookup)
  for (const host of others) await refusedBy(development(`https://${host}/`), 'private', `development ${host}`)

  // No name was looked up, and nothing was connected to.
  assert.deepEqual(none.asked, [])
  assert.deepEqual(inner.asked, [])

  // What a look-up answers is held the same, in every form that a resolver may hand over.
  for (const answer of [...own, ...others].filter((one) => !one.includes('%'))) {
    const bare = answer.replace(/^\[|\]$/g, '')
    const held = names({ 'inner.test': [[bare]] })
    const error = await failure(fetchWith({ mode: 'live' }, held.lookup)(`https://inner.test:${inner.port}/`))
    // A form that only a reader of typed addresses takes is no address from a resolver: it is no answer at all.
    assert.ok(error instanceof TentError ? error.code === 'T0022' : error instanceof TypeError, `${bare}: ${error}`)
  }
  assert.deepEqual(inner.asked, [])
})

/** Starts a server on the IPv6 address of this computer, on a given port, or answers nothing where it has none. */
async function sixOn(t: TestContext, port: number, asked: string[]): Promise<boolean> {
  const server = createServer((request, response) => {
    asked.push(request.url ?? '')
    response.end('the second answer')
  })
  const stands = await new Promise<boolean>((done) => {
    server.once('error', () => done(false))
    server.listen(port, '::1', () => done(true))
  })
  if (stands)
    t.after(async () => {
      server.closeAllConnections()
      await new Promise((done) => server.close(done))
    })
  return stands
}

test('[05-7.2] a name that answers one address when it is looked up and another when the connection is made is reached at the first, or refused', async (t) => {
  const first = await standIn(t, (_request, response) => response.end('the first answer'))
  // A second server of this computer, at another address and the same port, which a second look-up would lead to.
  const second: string[] = []
  const six = await sixOn(t, first.port, second)

  // The project lists both addresses of this computer, so a second look-up would be followed. A name that only
  // answers this computer is no local address, in development either: so it is listed here, on live data.
  const turns = names({ 'turns.test': [['127.0.0.1'], ['::1']] })
  const fetch = fetchWith({ mode: 'live', privateHosts: ['http://127.0.0.1', 'http://[::1]'] }, turns.lookup)
  const answer = await fetch(`http://turns.test:${first.port}/one`)
  assert.equal(await answer.text(), 'the first answer')
  assert.deepEqual(turns.asked, ['turns.test'])
  assert.deepEqual(second, [])
  if (six) {
    // The next fetch is a new look-up, and is led to the second server: the stand-in tells the two apart.
    assert.equal(await (await fetch(`http://turns.test:${first.port}/two`)).text(), 'the second answer')
    assert.deepEqual(second, ['/two'])
  }

  // A resolver that answers by the clock: the first address for a moment, a private one from then on, slowly.
  const started = performance.now()
  let lookups = 0
  const byClock = async (): Promise<string[]> => {
    lookups++
    const answer = performance.now() - started < 150 ? ['127.0.0.1'] : ['10.0.0.9']
    await new Promise((done) => setTimeout(done, 100))
    return answer
  }
  const slow = await standIn(t, (_request, response) => setTimeout(() => response.end('in time'), 300))
  const live = fetchWith({ mode: 'live', privateHosts: [`http://127.0.0.1:${slow.port}`] }, byClock)
  // Ten at once are each looked up once, while the address still stands, and are connected after it changed.
  const answers = await Promise.all(
    Array.from({ length: 10 }, async (_, k) => (await live(`http://clock.test:${slow.port}/${k}`)).text()),
  )
  assert.deepEqual(answers, new Array(10).fill('in time'))
  assert.equal(lookups, 10)
  assert.equal(slow.asked.length, 10)
  // Once the name answers the private address, the fetch is refused, and nothing is connected to.
  await refusedAtAll(live(`http://clock.test:${slow.port}/late`), 'the private answer')
  await refused(live(`https://clock.test:${slow.port}/late`), 'private')
  assert.equal(slow.asked.length, 10)

  // A redirect to the same name is a new look-up, which is held anew.
  const again = await standIn(t, (_request, response, asked) =>
    asked.path === '/start' ? response.writeHead(302, { location: '/landed' }).end() : response.end('landed'),
  )
  const moving = names({ 'moves.test': [['127.0.0.1'], ['192.168.1.1']] })
  const held = fetchWith({ mode: 'live', privateHosts: [`http://127.0.0.1:${again.port}`] }, moving.lookup)
  await refusedAtAll(held(`http://moves.test:${again.port}/start`), 'a redirect to a name that now answers inside')
  assert.deepEqual(
    again.asked.map((one) => one.path),
    ['/start'],
  )
  assert.deepEqual(moving.asked, ['moves.test', 'moves.test'])
})

/** A stand-in that sends each request on to the address its question names, by the status its path names. */
const sendsOn = (t: TestContext) =>
  standIn(t, (_request, response, asked) => {
    const url = new URL(asked.path, 'http://outer.test')
    const to = url.searchParams.get('to')
    const hop = /^\/hop\/(\d+)$/.exec(url.pathname)
    const status = Number(url.searchParams.get('by') ?? 302)
    if (to !== null) response.writeHead(status, { location: to }).end()
    else if (hop && Number(hop[1]) > 0) {
      const last = url.searchParams.get('last')
      const next = Number(hop[1]) === 1 && last !== null ? last : `/hop/${Number(hop[1]) - 1}${url.search}`
      response.writeHead(status, { location: next }).end()
    } else response.end('landed')
  })

test('[05-7.3] an address that sends the fetch on to a private one is refused, and so is a chain of four', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const outer = await sendsOn(t)
  const held = names({ 'inner.test': [['127.0.0.1']], 'cloud.test': [['169.254.169.254']], 'six.test': [['::1']] })
  // On live data the first server is the one host the project lists: it stands for an address of the internet.
  const o = { mode: 'live' as const, privateHosts: [`http://127.0.0.1:${outer.port}`] }
  const targets = [
    `http://127.0.0.1:${inner.port}/secret`,
    `https://127.0.0.1:${inner.port}/secret`,
    `http://localhost:${inner.port}/secret`,
    `http://2130706433:${inner.port}/secret`,
    `http://0x7f.1:${inner.port}/secret`,
    `http://[::ffff:127.0.0.1]:${inner.port}/secret`,
    `http://[::1]:${inner.port}/secret`,
    `http://inner.test:${inner.port}/secret`,
    `https://inner.test:${inner.port}/secret`,
    `https://six.test:${inner.port}/secret`,
    `//127.0.0.1:${inner.port}/secret`,
    `http:\\\\127.0.0.1:${inner.port}\\secret`,
    `\thttp://127.0.0.1:${inner.port}/secret`,
    `http://127.0.0.1:${outer.port}@127.0.0.1:${inner.port}/secret`,
    `http://127.0.0.1:${inner.port}\\@127.0.0.1:${outer.port}/secret`,
    'https://10.0.0.5/',
    'https://192.168.1.1/admin',
    'https://169.254.169.254/latest/meta-data',
    'https://cloud.test/latest/meta-data',
    'https://[fd00:ec2::254]/latest',
  ]
  for (const fetch of [fetchWith(o, held.lookup), fetchWith({ ...o, plain: true }, held.lookup)])
    for (const by of [301, 302, 303, 307, 308])
      for (const to of targets) {
        const address = `${outer.origin}/?by=${by}&to=${encodeURIComponent(to)}`
        await refusedAtAll(fetch(address), `${by} to ${to}`)
        await refusedAtAll(fetch(address, { method: 'POST', body: 'a body' }), `POST, ${by} to ${to}`)
      }
  // A redirect to an address that no reader of addresses takes fails, and is followed nowhere.
  for (const to of ['https://[fe80::1%25eth0]/', 'http://', 'http://[', 'https://[::1', 'http://a b/'])
    await failure(fetchWith(o, held.lookup)(`${outer.origin}/?to=${encodeURIComponent(to)}`))
  assert.deepEqual(inner.asked, [])

  // A chain of four: three are followed, the fourth is refused, and what it names is not asked.
  const fetch = fetchWith(o, held.lookup)
  for (const by of [301, 302, 303, 307, 308]) {
    outer.asked.length = 0
    assert.equal(await (await fetch(`${outer.origin}/hop/3?by=${by}`)).text(), 'landed')
    outer.asked.length = 0
    await refused(fetch(`${outer.origin}/hop/4?by=${by}`), 'redirects')
    assert.equal(outer.asked.length, 4)
  }
  // A chain inside the three that ends at a private address is refused at its end.
  for (const hops of [1, 2, 3]) {
    const last = encodeURIComponent(`http://127.0.0.1:${inner.port}/secret`)
    await refusedAtAll(fetch(`${outer.origin}/hop/${hops}?last=${last}`), `a chain of ${hops}`)
  }
  assert.deepEqual(inner.asked, [])
  // A circle of redirects ends, in the guarded form and in the plain one.
  const circle = await standIn(t, (_request, response) => response.writeHead(302, { location: '/again' }).end())
  const round = { mode: 'live' as const, privateHosts: [`http://127.0.0.1:${circle.port}`] }
  await refused(fetchWith(round, held.lookup)(`${circle.origin}/`), 'redirects')
  assert.equal(circle.asked.length, 4)
  await refused(fetchWith({ ...round, plain: true }, held.lookup)(`${circle.origin}/`), 'redirects')
  assert.equal(circle.asked.length, 4 + 21)
})

test('[05-7.4] an address with a user name and a password, and one that is not https, is refused, but for a local address in the mode development', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const none = names({})
  const listed = [`http://127.0.0.1:${inner.port}`]
  for (const mode of ['development', 'test', 'live'] as const)
    for (const fetch of [
      fetchWith({ mode, privateHosts: listed }, none.lookup),
      fetchWith({ mode, privateHosts: listed, plain: true }, none.lookup),
    ])
      for (const who of ['user:password@', 'user@', ':password@', 'user:@', 'a%40b:c%3Ad@', 'user:pass:word@'])
        for (const host of [`127.0.0.1:${inner.port}`, 'outer.test', far, `[::1]:${inner.port}`])
          for (const scheme of ['http', 'https']) {
            const error = await refused(fetch(`${scheme}://${who}${host}/path?key=1`), 'password')
            // Neither the name nor the password is told again by the error.
            assert.ok(!/@|a%40b|pass:word/.test(`${error.message} ${error.fields?.address}`), error.message)
          }
  assert.deepEqual(inner.asked, [])
  assert.deepEqual(none.asked, [])

  // Not https: refused on test and live data before a name is looked up, for an address of this computer too.
  for (const mode of ['test', 'live'] as const) {
    const fetch = fetchWith({ mode }, none.lookup)
    for (const address of [
      'http://outer.test/',
      `http://${far}/`,
      `http://127.0.0.1:${inner.port}/`,
      `http://localhost:${inner.port}/`,
      `HTTP://127.0.0.1:${inner.port}/`,
      `http://[::1]:${inner.port}/`,
    ])
      await refusedAtAll(fetch(address), `${mode} ${address}`)
    for (const address of ['ftp://outer.test/file', 'ws://outer.test/', 'wss://outer.test/', 'gopher://outer.test/'])
      await refused(fetch(address), 'secure')
    for (const address of ['file:///etc/passwd', 'data:text/plain,inside', 'about:blank', 'javascript:1', 'outer.test'])
      await failure(fetch(address))
  }
  assert.deepEqual(inner.asked, [])
  assert.deepEqual(none.asked, [])

  // The one way through: an address of this computer, in the mode development.
  const local = names({
    localhost: [['127.0.0.1']],
    'both.test': [['127.0.0.1', far]],
    'wide.test': [['10.0.0.5']],
    'outer.test': [[far]],
  })
  const development = fetchWith({ mode: 'development' }, local.lookup)
  for (const host of ['127.0.0.1', 'localhost', '2130706433', '[::ffff:127.0.0.1]'])
    assert.equal(await (await development(`http://${host}:${inner.port}/`)).text(), 'what lies inside', host)
  inner.asked.length = 0
  // In development too: a private network, a name that answers an address of the internet beside this computer.
  for (const address of ['http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/', 'http://wide.test/'])
    await refusedAtAll(development(address), address)
  await refused(development(`http://both.test:${inner.port}/`), 'secure')
  await refused(development(`http://${far}/`), 'secure')
  await refused(development('http://outer.test/'), 'secure')
  assert.deepEqual(inner.asked, [])
})

/** Sends a body in pieces without end, until the connection is closed. */
function pours(response: ServerResponse, piece: Uint8Array, every: number): void {
  const timer = setInterval(() => response.write(piece), every)
  response.once('close', () => clearInterval(timer))
}

test('[05-7.5] an answer larger than the cap, one that sends a byte at a time, and a packed one that opens larger, is cut off at the cap and at the time', async (t) => {
  const zeros = new Uint8Array(8 * 1_048_576)
  const packed: Record<string, [packing: string | string[], bytes: Uint8Array]> = {
    gzip: ['gzip', gzipSync(zeros)],
    'x-gzip': ['x-gzip', gzipSync(zeros)],
    capitals: ['GZip', gzipSync(zeros)],
    deflate: ['deflate', deflateSync(zeros)],
    br: ['br', brotliCompressSync(zeros)],
    zstd: ['zstd', zstdCompressSync(zeros)],
    twice: ['gzip, gzip', gzipSync(gzipSync(zeros))],
    mixed: ['br, gzip, zstd', zstdCompressSync(gzipSync(brotliCompressSync(zeros)))],
    five: ['gzip,gzip,gzip,gzip,gzip', gzipSync(gzipSync(gzipSync(gzipSync(gzipSync(zeros)))))],
    'two-headers': [['gzip', 'gzip'], gzipSync(gzipSync(zeros))],
  }
  const server = await standIn(t, (_request, response, asked) => {
    const [, kind = '', name = ''] = asked.path.split('/')
    const one = packed[name]
    if (kind === 'packed' && one) response.setHeader('content-encoding', one[0]).writeHead(200).end(one[1])
    else if (kind === 'said') response.writeHead(200, { 'content-length': String(zeros.length) }).end(zeros)
    else if (kind === 'unsaid') response.writeHead(200).end(zeros)
    else if (kind === 'more') {
      response.writeHead(200, { 'content-length': '10' })
      response.write(new Uint8Array(5000).fill(97))
      response.end()
    } else if (kind === 'endless') pours(response.writeHead(200), new Uint8Array(65_536), 1)
    else if (kind === 'drips') pours(response.writeHead(200), new Uint8Array(1), 100)
    else if (kind === 'members') {
      // Packed pieces that each open to nothing: no byte is ever counted, so the time is what ends it.
      response.writeHead(200, { 'content-encoding': 'gzip' })
      pours(response, Buffer.concat(new Array<Uint8Array>(500).fill(gzipSync(new Uint8Array(0)))), 1)
    } else if (kind === 'slowly') setTimeout(() => response.writeHead(302, { location: `/slowly/${name}x` }).end(), 250)
    else if (kind !== 'silent') response.end('small')
  })
  const fetch = fetchWith({ mode: 'development' }, names({}).lookup)
  const size = 100_000

  /** Reads an answer piece by piece, and answers how many bytes were handed over before the reading failed. */
  const readTo = async (address: string, init: { size?: number; time?: number }): Promise<[number, Error]> => {
    let seen = 0
    try {
      const answer = await fetch(address, init)
      for await (const piece of answer.body ?? []) seen += piece.length
    } catch (error) {
      assert.ok(error instanceof Error)
      return [seen, error]
    }
    throw new assert.AssertionError({ message: `${address} was read to its end, ${seen} bytes` })
  }
  for (const path of ['said', 'unsaid', 'endless', ...Object.keys(packed).map((name) => `packed/${name}`)]) {
    const [seen, error] = await readTo(`${server.origin}/${path}`, { size })
    assert.ok(error instanceof TentError, `${path}: ${error.name}: ${error.message}`)
    assert.equal(`${error.code} ${error.fields?.cap}`, 'T0023 size', path)
    // No more is handed to the reader than the cap and the one piece that passed it.
    assert.ok(seen <= size + 262_144, `${path}: ${seen} bytes were handed over`)
  }
  // Six packings are opened by nobody: the answer fails, and nothing of it is handed over.
  const six = await standIn(t, (_request, response) =>
    response.writeHead(200, { 'content-encoding': 'gzip,gzip,gzip,gzip,gzip,gzip' }).end(gzipSync(zeros)),
  )
  await failure(fetch(`${six.origin}/`, { size }))
  // An answer that sends more than it said is read as far as it said.
  assert.equal((await (await fetch(`${server.origin}/more`, { size })).text()).length, 10)

  // The time: a byte at a time, a head that never comes, pieces that open to nothing, and redirects that each
  // come inside the time.
  for (const path of ['drips', 'silent', 'members', 'slowly/']) {
    const started = performance.now()
    const [, error] = await readTo(`${server.origin}/${path}`, { size, time: 600 })
    assert.ok(error instanceof TentError, `${path}: ${error.name}: ${error.message}`)
    assert.equal(`${error.code} ${error.fields?.cap}`, 'T0023 time', path)
    assert.ok(performance.now() - started < 5000, `${path} was cut after ${performance.now() - started} ms`)
  }
  // A name whose look-up never answers is cut at the time too.
  const never = fetchWith({ mode: 'development' }, () => new Promise<string[]>(() => undefined))
  await cutBy(never('https://slow.test/', { time: 300 }), 'time', 'a look-up that never answers')
})

test('[05-7.8] a name that answers a public and a private address at once is refused', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const answers: string[][] = [
    [far, '10.0.0.5'],
    ['10.0.0.5', far],
    [far, '192.168.1.1', '93.184.216.35'],
    [far, '169.254.169.254'],
    [far, '127.0.0.1'],
    ['127.0.0.1', far],
    [far, '::1'],
    [far, 'fd00::5'],
    ['2606:2800:220:1::1', '10.0.0.5'],
    [far, '::ffff:10.0.0.5'],
    [far, '::ffff:a00:5'],
    [far, '64:ff9b::a00:5'],
    [far, '2002:a00:5::'],
    [far, '::10.0.0.5'],
    [far, '0.0.0.0'],
    [far, 'fe80::1'],
    [...new Array<string>(40).fill(far), '10.0.0.5'],
  ]
  for (const [at, answer] of answers.entries()) {
    const held = names({ 'both.test': [answer] })
    for (const mode of ['test', 'live'] as const) {
      await refused(fetchWith({ mode }, held.lookup)(`https://both.test:${inner.port}/`), 'private')
      await refused(addressWith('both.test', { mode }, held.lookup), 'private')
      await refused(fetchWith({ mode, plain: true }, held.lookup)(`http://both.test:${inner.port}/`), 'private')
      // An address that the project lists lets no other private address of the name through.
      const o = { mode, privateHosts: ['10.99.0.1', 'http://10.99.0.2'] }
      await refused(fetchWith(o, held.lookup)(`https://both.test:${inner.port}/`), 'private')
    }
    assert.equal(held.asked.length, 8, `the answers ${at}`)
    // In development an address of this computer is no private one. Every other is refused there too.
    if (!answer.includes('127.0.0.1') && !answer.includes('::1'))
      await refused(addressWith('both.test', { mode: 'development' }, held.lookup), 'private')
  }
  assert.deepEqual(inner.asked, [])
})

test('[05-7.4] an address that is not https is refused where its name answers an address of the internet beside a listed one', async () => {
  // The project lists one host of its own network that is reached without a secure connection.
  const guard = { mode: 'live' as const, privateHosts: ['http://10.0.0.5'] }
  const asked = { host: 'outer.test', port: 80, shown: 'http://outer.test/', secure: false }
  // The name of another answers that address, and one of the internet before it, which the connection would go to.
  const both = names({ 'outer.test': [[far, '10.0.0.5']] })
  // Nothing lists the address of the internet, so nothing lets it be reached without a secure connection.
  await refused(settled(asked, guard, both.lookup), 'secure')
})
