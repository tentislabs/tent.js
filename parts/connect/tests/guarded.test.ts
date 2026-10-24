import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { TentError } from '../../core/index.ts'
import type { Mode } from '../../data/index.ts'
import { addressWith } from '../guardedAddress.ts'
import { fetchWith } from '../guardedFetch.ts'
import { guardedAddress, guardedFetch } from '../index.ts'
import { certificateFor } from './certificate.ts'
import { failure, names, refused, standIn } from './servers.ts'

const modes: Mode[] = ['development', 'test', 'live']

// An address of the open internet, which no test connects to: a test names it only where the rule answers
// before any connection.
const far = '93.184.216.34'

/** Reads an answer to its end, whether the fetch itself or the reading of its body is what fails. */
const whole = async (work: Promise<Response>): Promise<Uint8Array> => new Uint8Array(await (await work).arrayBuffer())

test('[22-19] the guarded fetch refuses a private address, as it is written and as a name answers it', async () => {
  const none = names({})
  for (const mode of modes) {
    const fetch = fetchWith({ mode }, none.lookup)
    for (const address of [
      'https://10.0.0.5/',
      'https://172.16.0.1/',
      'https://192.168.1.1/x',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.0.1/',
      'https://0.0.0.0/',
      'https://224.0.0.1/',
      'https://[fc00::1]/',
      'https://[fe80::1]/',
      'https://[ff02::1]/',
    ])
      await refused(fetch(address), 'private', address)
  }
  assert.deepEqual(none.asked, [])

  const held = names({
    'inner.test': [['10.0.0.5']],
    'both.test': [[far, '192.168.1.1']],
    'six.test': [['fd00::5']],
  })
  for (const mode of modes) {
    const fetch = fetchWith({ mode }, held.lookup)
    await refused(fetch('https://inner.test/'), 'private', 'https://inner.test/')
    // A name that answers several addresses is refused when one of them is private.
    await refused(fetch('https://both.test/a?key=1'), 'private', 'https://both.test/a')
    await refused(fetch('https://six.test/'), 'private')
  }
  // Each fetch looked its name up once.
  assert.equal(held.asked.length, 9)

  // A name of this computer or of a private network is refused before any look-up.
  for (const name of ['localhost', 'app.localhost', 'printer.local', 'db.internal', 'LOCALHOST', 'localhost.']) {
    const asks = names({})
    await refused(fetchWith({ mode: 'live' }, asks.lookup)(`https://${name}/`), 'private')
    await refused(addressWith(name, { mode: 'test' }, asks.lookup), 'private', name)
    assert.deepEqual(asks.asked, [])
  }
})

test('[22-19] a name that changes its answer between look-up and connection is reached at the address that was looked up', async (t) => {
  const server = await standIn(t, (_request, response) => response.end('the first answer'))
  // The second answer is a private address, which a second look-up would be handed.
  const moving = names({ 'moves.test': [['127.0.0.1'], ['10.0.0.9']] })
  // The project lists the address of the server: a name that only answers this computer is no local address.
  const fetch = fetchWith({ mode: 'live', privateHosts: [`http://127.0.0.1:${server.port}`] }, moving.lookup)

  const answer = await fetch(`http://moves.test:${server.port}/page`)
  assert.equal(answer.status, 200)
  assert.equal(await answer.text(), 'the first answer')
  // The name was looked up once, and the connection was made to that answer under the name that was asked.
  assert.deepEqual(moving.asked, ['moves.test'])
  assert.equal(server.asked.length, 1)
  assert.equal(server.asked[0]?.headers.host, `moves.test:${server.port}`)

  // The next fetch looks the name up anew, is handed the private address, and is refused: nothing is connected to.
  // Without a secure connection it is refused as not secure, since nothing lists it, and with one as private.
  await refused(fetch(`http://moves.test:${server.port}/page`), 'secure')
  await refused(fetch(`https://moves.test:${server.port}/page`), 'private')
  assert.deepEqual(moving.asked, ['moves.test', 'moves.test', 'moves.test'])
  assert.equal(server.asked.length, 1)
})

test('[22-19] a redirect to a local address is refused, and so is a fourth redirect', async (t) => {
  const inner = await standIn(t, (_request, response) => response.end('what lies inside'))
  const outer = await standIn(t, (_request, response, asked) => {
    const to = new URL(asked.path, 'http://outer.test').searchParams.get('to')
    const hop = /^\/hop\/(\d+)$/.exec(asked.path)
    if (to !== null) response.writeHead(302, { location: to }).end()
    else if (hop && Number(hop[1]) > 0) response.writeHead(302, { location: `/hop/${Number(hop[1]) - 1}` }).end()
    else response.end('landed')
  })
  const none = names({})

  // On live data the first server is one the project lists, and nothing else of this computer is.
  const live = fetchWith({ mode: 'live', privateHosts: [`http://127.0.0.1:${outer.port}`] }, none.lookup)
  assert.equal(await (await live(`${outer.origin}/`)).text(), 'landed')
  for (const [to, rule] of [
    [`https://127.0.0.1:${inner.port}/secret`, 'private'],
    [`${inner.origin}/secret`, 'secure'],
    ['https://localhost/', 'private'],
    ['https://[::1]/', 'private'],
    ['https://10.0.0.1/', 'private'],
    ['https://169.254.169.254/latest', 'private'],
  ])
    await refused(
      live(`${outer.origin}/?to=${encodeURIComponent(to)}`),
      rule,
      new URL(to).origin + new URL(to).pathname,
    )
  assert.deepEqual(inner.asked, [])

  // In development a local address is reached through a redirect, and a private one still is not.
  const development = fetchWith({ mode: 'development' }, none.lookup)
  const through = await development(`${outer.origin}/?to=${encodeURIComponent(`${inner.origin}/open`)}`)
  assert.equal(await through.text(), 'what lies inside')
  assert.equal(through.redirected, true)
  assert.equal(through.url, `${inner.origin}/open`)
  await refused(development(`${outer.origin}/?to=${encodeURIComponent('https://192.168.0.1/')}`), 'private')

  // Three redirects are followed, each checked again. The fourth is refused, and what it names is not asked.
  outer.asked.length = 0
  assert.equal(await (await development(`${outer.origin}/hop/3`)).text(), 'landed')
  assert.deepEqual(
    outer.asked.map((one) => one.path),
    ['/hop/3', '/hop/2', '/hop/1', '/hop/0'],
  )
  outer.asked.length = 0
  await refused(development(`${outer.origin}/hop/4`), 'redirects')
  assert.deepEqual(
    outer.asked.map((one) => one.path),
    ['/hop/4', '/hop/3', '/hop/2', '/hop/1'],
  )
  assert.deepEqual(none.asked, [])
})

test('[22-19] an answer over the size cap is cut off, also one that is packed and opens larger', async (t) => {
  const mb = 1_048_576
  const packed = gzipSync(new Uint8Array(11 * mb))
  const server = await standIn(t, (_request, response, asked) => {
    if (asked.path === '/exact') response.end(new Uint8Array(1000))
    else if (asked.path === '/over') response.end(new Uint8Array(1001))
    else if (asked.path === '/stream') {
      // No length is said ahead: the bytes are counted as they arrive.
      response.writeHead(200)
      for (let k = 0; k < 40; k++) response.write(new Uint8Array(100))
      response.end()
    } else if (asked.path === '/packed') response.writeHead(200, { 'content-encoding': 'gzip' }).end(packed)
    else if (asked.path === '/packed-small')
      response.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync(new Uint8Array(mb)))
    else response.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync(new Uint8Array(10 * mb)))
  })
  const fetch = guardedFetch({ mode: 'development' })
  const cut = async (work: Promise<Response>): Promise<void> => {
    const error = await failure(whole(work))
    assert.ok(error instanceof TentError, `${error.name}: ${error.message}`)
    assert.equal(error.code, 'T0023')
    assert.match(error.message, /size/)
  }

  assert.equal((await whole(fetch(`${server.origin}/exact`, { size: 1000 }))).length, 1000)
  await cut(fetch(`${server.origin}/over`, { size: 1000 }))
  await cut(fetch(`${server.origin}/stream`, { size: 3999 }))
  assert.equal((await whole(fetch(`${server.origin}/stream`, { size: 4000 }))).length, 4000)

  // With no size stated an answer is cut at 10 MB, counted as it is opened.
  assert.ok(packed.length < mb / 10)
  await cut(fetch(`${server.origin}/packed`))
  assert.equal((await whole(fetch(`${server.origin}/packed-ten`))).length, 10 * mb)
  assert.equal((await whole(fetch(`${server.origin}/packed-small`))).length, mb)
  await cut(fetch(`${server.origin}/packed-small`, { size: mb - 1 }))
})

test('[21-16@6b] a local address in the guarded fetch is allowed in the mode development and refused in test and live', async (t) => {
  const server = await standIn(t, (_request, response) => response.end('this computer'))
  const here = names({
    localhost: [['::1', '127.0.0.1']],
    'app.localhost': [['127.0.0.1']],
    'mine.test': [['127.0.0.1']],
  })
  const addresses = [
    server.origin,
    `http://localhost:${server.port}`,
    `http://app.localhost:${server.port}`,
    `http://127.1:${server.port}`,
    `http://[::ffff:127.0.0.1]:${server.port}`,
  ]

  const development = fetchWith({ mode: 'development' }, here.lookup)
  for (const address of addresses)
    assert.equal(await (await development(`${address}/`)).text(), 'this computer', address)
  assert.equal(server.asked.length, addresses.length)
  assert.equal(await addressWith('localhost', { mode: 'development' }, here.lookup), '127.0.0.1')
  assert.equal(await guardedAddress('127.0.0.1', { mode: 'development' }), '127.0.0.1')
  assert.equal(await guardedAddress('[::1]', { mode: 'development' }), '::1')

  for (const mode of ['test', 'live'] as const) {
    const fetch = fetchWith({ mode }, here.lookup)
    for (const address of addresses) {
      // Without a secure connection it is refused as not secure, and with one as local.
      await refused(fetch(`${address}/`), 'secure')
      await refused(fetch(`${address.replace('http:', 'https:')}/`), 'private')
    }
    await refused(guardedAddress('127.0.0.1', { mode }), 'private', '127.0.0.1')
    await refused(guardedAddress('::1', { mode }), 'private')
    await refused(addressWith('mine.test', { mode }, here.lookup), 'private', 'mine.test')
  }
  assert.equal(server.asked.length, addresses.length)

  // A name that is written as no name of this computer is no local address, though it answers this computer.
  await refused(development(`http://mine.test:${server.port}/`), 'secure')
  await refused(development(`https://mine.test:${server.port}/`), 'private')
  await refused(addressWith('mine.test', { mode: 'development' }, here.lookup), 'private', 'mine.test')
  assert.equal(server.asked.length, addresses.length)

  // An address of a private network is no local address: development does not open it.
  await refused(development('https://192.168.1.20/'), 'private')
  await refused(development('http://192.168.1.20/'), 'secure')
})

test('[16-2@6b] T0022: each rule refuses with the address and the rule named', async () => {
  const held = names({ 'far.test': [[far]] })
  for (const mode of modes) {
    const fetch = fetchWith({ mode }, held.lookup)

    // Not secure: refused before the name is looked up, where nothing could make it local.
    const plainly = await refused(fetch(`http://${far}/path?token=abc`), 'secure', `http://${far}/path`)
    assert.ok(!plainly.message.includes('abc'), 'what follows the question mark is not told')
    await refused(fetch('ftp://far.test/file'), 'secure')

    // A user name and a password, each alone too. Neither is told.
    for (const address of [`https://ada:lovelace@${far}/`, `https://ada@${far}/`, `https://:lovelace@${far}/`]) {
      const error = await refused(fetch(address), 'password', `https://${far}/`)
      assert.ok(!/ada|lovelace/.test(error.message), error.message)
    }
    // An address with a zone after a percent sign.
    await refused(fetch('https://[fe80::1%25eth0]/'), 'private')
    await refused(addressWith('fe80::1%eth0', { mode }, held.lookup), 'private', 'fe80::1%eth0')
  }
  await refused(fetchWith({ mode: 'live' }, held.lookup)('http://far.test/'), 'secure', 'http://far.test/')
  // What is no rule of the guarded fetch fails as the runtime's own `fetch` does.
  const error = await failure(fetchWith({ mode: 'live' }, held.lookup)('not an address'))
  assert.ok(error instanceof TypeError)

  // A name that answers a public address is answered that address, and nothing is connected to.
  assert.equal(await addressWith('far.test', { mode: 'live' }, held.lookup), far)
  assert.equal(await addressWith(`far.test:8443`, { mode: 'live' }, held.lookup), far)
  assert.equal(await guardedAddress(far, { mode: 'live' }), far)
})

test('[16-2@6b] T0022: an address written in another form is read into the address it means before the ranges are checked', async () => {
  const none = names({})
  const forms = [
    // One number, base eight, base sixteen, and fewer than four numbers.
    ['2130706433', '127.0.0.1'],
    ['017700000001', '127.0.0.1'],
    ['0x7f000001', '127.0.0.1'],
    ['0177.0.0.1', '127.0.0.1'],
    ['0x7f.0.0.1', '127.0.0.1'],
    ['127.1', '127.0.0.1'],
    ['3232235777', '192.168.1.1'],
    ['0300.0250.1.1', '192.168.1.1'],
    ['0xa9fea9fe', '169.254.169.254'],
    ['2852039166', '169.254.169.254'],
    ['0', '0.0.0.0'],
    // An IPv4 address inside an IPv6 one, in each form that carries one.
    ['[::ffff:10.0.0.1]', '10.0.0.1'],
    ['[::ffff:a00:1]', '10.0.0.1'],
    ['[0:0:0:0:0:ffff:c0a8:101]', '192.168.1.1'],
    ['[::10.0.0.1]', '10.0.0.1'],
    ['[64:ff9b::a9fe:a9fe]', '169.254.169.254'],
    ['[64:ff9b::10.0.0.1]', '10.0.0.1'],
    ['[2002:a00:1::1]', '10.0.0.1'],
    ['[2002:7f00:1::]', '127.0.0.1'],
    // The ranges of IPv6 itself.
    ['[::]', '::'],
    ['[0:0:0:0:0:0:0:1]', '::1'],
    ['[64:ff9b:1::1]', '64:ff9b:1::1'],
    ['[100::1]', '100::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['[2001:1::1]', '2001:1::1'],
    ['[3fff::1]', '3fff::1'],
    ['[5f00::1]', '5f00::1'],
    ['[fdab::1]', 'fdab::1'],
    ['[febf::1]', 'febf::1'],
    ['[fec0::1]', 'fec0::1'],
    ['[ff0e::1]', 'ff0e::1'],
  ]
  for (const [written] of forms) {
    await refused(fetchWith({ mode: 'live' }, none.lookup)(`https://${written}/`), 'private')
    await refused(addressWith(written ?? '', { mode: 'test' }, none.lookup), 'private', written)
  }
  // The project lists the address it means, and the form is reached: so the form was read into that address.
  for (const [written, meant] of forms)
    assert.notEqual(await addressWith(written ?? '', { mode: 'live', privateHosts: [meant ?? ''] }, none.lookup), '')

  // A public address inside an IPv6 one passes, and the one that maps it is connected to as the IPv4 address.
  assert.equal(await addressWith(`[::ffff:${far}]`, { mode: 'live' }, none.lookup), far)
  assert.equal(await addressWith('[64:ff9b::5db8:d822]', { mode: 'live' }, none.lookup), '64:ff9b::5db8:d822')
  assert.equal(await addressWith('[2606:4700::1111]', { mode: 'live' }, none.lookup), '2606:4700::1111')
  // A resolver that answers such a form is held to the same reading.
  const mapped = names({ 'mapped.test': [['::ffff:10.0.0.1']], 'nat.test': [['64:ff9b::a00:1']] })
  await refused(addressWith('mapped.test', { mode: 'live' }, mapped.lookup), 'private')
  await refused(addressWith('nat.test', { mode: 'live' }, mapped.lookup), 'private')
  assert.deepEqual(none.asked, [])
})

test('[16-2@6b] T0023: an answer that passes its time is cut off, before its head and inside its body', async (t) => {
  const server = await standIn(t, (_request, response, asked) => {
    if (asked.path === '/never') return
    response.writeHead(200, { 'content-type': 'text/plain' })
    if (asked.path === '/quick') return void response.end('in time')
    // A byte every fifty milliseconds, for as long as the connection stands.
    const timer = setInterval(() => response.write('.'), 50)
    response.on('close', () => clearInterval(timer))
  })
  const fetch = guardedFetch({ mode: 'development' })
  const late = async (work: Promise<unknown>): Promise<void> => {
    const started = performance.now()
    const error = await failure(work)
    assert.ok(error instanceof TentError, `${error.name}: ${error.message}`)
    assert.equal(error.code, 'T0023')
    assert.match(error.message, /time/)
    assert.ok(performance.now() - started < 5000, 'the answer was cut at its time, and not at the 30 seconds')
  }

  await late(fetch(`${server.origin}/never`, { time: 300 }))
  const slow = await fetch(`${server.origin}/slow`, { time: 400 })
  assert.equal(slow.status, 200)
  await late(slow.text())
  assert.equal(await (await fetch(`${server.origin}/quick`, { time: 400 })).text(), 'in time')

  // A caller's own signal ends the fetch with the caller's own reason, and is no cut.
  const ended = await failure(fetch(`${server.origin}/never`, { signal: AbortSignal.abort(new Error('I left')) }))
  assert.equal(ended.message, 'I left')
})

test('[22-19] a redirect to another host is sent on with four headers and without the sign-in of the first', async (t) => {
  const second = await standIn(t, (_request, response) => response.end('second'))
  const first = await standIn(t, (_request, response, asked) => {
    const [, status, where] = /^\/(\d+)\/(same|other)$/.exec(asked.path) ?? []
    if (!status) return void response.end('first')
    response.writeHead(Number(status), { location: where === 'same' ? '/landed' : `${second.origin}/landed` }).end()
  })
  // Who asks states that the body may travel, so that a 307 shows which headers go with it.
  const fetch = fetchWith({ mode: 'development', bodyTravels: true }, names({}).lookup)
  const sent = {
    authorization: 'Bearer abc',
    cookie: 'session=1',
    'x-api-key': 'k-123',
    accept: 'application/json',
    'accept-language': 'tr',
    'content-type': 'application/json',
    'user-agent': 'a test',
  }

  // To another host: the four headers and nothing else of what was sent.
  await fetch(`${first.origin}/307/other`, { method: 'POST', headers: sent, body: '{"n":1}' })
  const there = second.asked.at(-1)
  assert.ok(there)
  assert.equal(there.method, 'POST')
  assert.equal(there.body, '{"n":1}')
  assert.equal(there.headers.authorization, undefined)
  assert.equal(there.headers.cookie, undefined)
  assert.equal(there.headers['x-api-key'], undefined)
  assert.deepEqual(
    [
      there.headers.accept,
      there.headers['accept-language'],
      there.headers['content-type'],
      there.headers['user-agent'],
    ],
    ['application/json', 'tr', 'application/json', 'a test'],
  )

  // To the same host every header stays.
  await fetch(`${first.origin}/307/same`, { method: 'POST', headers: sent, body: '{"n":2}' })
  const here = first.asked.at(-1)
  assert.ok(here)
  assert.equal(`${here.path} ${here.method} ${here.body}`, '/landed POST {"n":2}')
  assert.equal(here.headers.authorization, 'Bearer abc')
  assert.equal(here.headers['x-api-key'], 'k-123')

  // A 303, and a 301 or a 302 of a POST, go on as a GET with no body.
  for (const status of [301, 302, 303]) {
    await fetch(`${first.origin}/${status}/same`, { method: 'POST', headers: sent, body: '{"n":3}' })
    const landed = first.asked.at(-1)
    assert.ok(landed)
    assert.equal(`${status} ${landed.method} ${landed.body}`, `${status} GET `)
    assert.equal(landed.headers['content-type'], undefined)
  }

  // A caller that follows no redirect is handed it as it came, and one that takes none is refused.
  const manual = await fetch(`${first.origin}/302/other`, { redirect: 'manual' })
  assert.equal(manual.status, 302)
  assert.equal(manual.headers.get('location'), `${second.origin}/landed`)
  assert.ok((await failure(fetch(`${first.origin}/302/other`, { redirect: 'error' }))) instanceof TypeError)
})

test('[22-19] `privateHosts` lists what the app may reach: a host or an address, one port of it, and with http:// in front', async (t) => {
  const server = await standIn(t, (_request, response) => response.end('listed'))
  const held = names({ 'intra.test': [['127.0.0.1']], 'other.test': [['127.0.0.1']] })
  const at = `http://127.0.0.1:${server.port}/`
  const reached = async (privateHosts: string[], address: string): Promise<string> =>
    await (await fetchWith({ mode: 'live', privateHosts }, held.lookup)(address)).text()

  for (const listed of [
    `http://127.0.0.1:${server.port}`,
    'http://127.0.0.1',
    `HTTP://127.0.0.1:${server.port}/`,
    'http://2130706433',
  ])
    assert.equal(await reached([listed], at), 'listed', listed)
  assert.equal(await reached(['http://intra.test'], `http://intra.test:${server.port}/`), 'listed')
  assert.equal(await reached([`http://intra.test:${server.port}`], `http://intra.test:${server.port}/`), 'listed')
  // A name that answers a listed address is reached too: the address is one the app may reach.
  assert.equal(await reached(['http://127.0.0.1'], `http://other.test:${server.port}/`), 'listed')

  // Listed without http:// in front, it is reached by a secure connection alone.
  await refused(fetchWith({ mode: 'live', privateHosts: ['127.0.0.1'] }, held.lookup)(at), 'secure')
  assert.equal(await addressWith('127.0.0.1', { mode: 'live', privateHosts: ['127.0.0.1'] }, held.lookup), '127.0.0.1')
  // Another port, another address and another name are not listed.
  await refused(
    fetchWith({ mode: 'live', privateHosts: [`http://127.0.0.1:${server.port + 1}`] }, held.lookup)(at),
    'secure',
  )
  const one = { mode: 'live' as const, privateHosts: ['10.0.0.5:5432', 'db.internal', '[fd00::5]:25'] }
  assert.equal(await addressWith('10.0.0.5:5432', one, held.lookup), '10.0.0.5')
  await refused(addressWith('10.0.0.5:5433', one, held.lookup), 'private')
  await refused(addressWith('10.0.0.5', one, held.lookup), 'private')
  await refused(addressWith('10.0.0.6:5432', one, held.lookup), 'private')
  assert.equal(await addressWith('[fd00::5]:25', one, held.lookup), 'fd00::5')
  await refused(addressWith('[fd00::5]:26', one, held.lookup), 'private')
  // A listed name of a private network is looked up, and what it answers is reached.
  const inner = names({ 'db.internal': [['10.0.0.7']] })
  assert.equal(await addressWith('db.internal', one, inner.lookup), '10.0.0.7')
  assert.deepEqual(inner.asked, ['db.internal'])
  await refused(addressWith('mail.internal', one, inner.lookup), 'private')
})

test('[22-19] the plain form holds the address rule, and neither the secure connection nor the caps', async (t) => {
  const mb = 1_048_576
  const server = await standIn(t, (_request, response, asked) => {
    const hop = /^\/hop\/(\d+)$/.exec(asked.path)
    if (hop && Number(hop[1]) > 0) response.writeHead(302, { location: `/hop/${Number(hop[1]) - 1}` }).end()
    else if (asked.path === '/large')
      response.writeHead(200, { 'content-encoding': 'gzip' }).end(gzipSync(new Uint8Array(11 * mb)))
    else response.end('plain')
  })
  const none = names({})
  // Listed with no http:// in front: the plain form reaches it without a secure connection.
  const plain = fetchWith({ mode: 'live', plain: true, privateHosts: [`127.0.0.1:${server.port}`] }, none.lookup)
  assert.equal(await (await plain(`${server.origin}/`)).text(), 'plain')
  assert.equal((await whole(plain(`${server.origin}/large`, { size: 10 }))).length, 11 * mb)
  // More redirects than the three of the guarded form.
  assert.equal(await (await plain(`${server.origin}/hop/6`)).text(), 'plain')

  // The address rule holds: a private address, a local one that is not listed, one with a password, a redirect.
  await refused(plain('http://10.0.0.5/'), 'private', 'http://10.0.0.5/')
  await refused(plain(`http://127.0.0.1:${server.port + 1}/`), 'private')
  await refused(plain('http://localhost/'), 'private')
  await refused(plain(`http://ada:lovelace@127.0.0.1:${server.port}/`), 'password')
  await refused(fetchWith({ mode: 'test', plain: true }, none.lookup)(`${server.origin}/`), 'private')
  assert.equal(
    await (await fetchWith({ mode: 'development', plain: true }, none.lookup)(`${server.origin}/`)).text(),
    'plain',
  )
})

test('[22-19] over a secure connection the certificate is held to the name that was asked, while the connection goes to the address that was looked up', async (t) => {
  const made = certificateFor('secure.test')
  const server = await standIn(t, (_request, response) => response.end('over a secure connection'), made)
  const held = names({ 'secure.test': [['127.0.0.1'], ['10.0.0.9']], 'other.test': [['127.0.0.1']] })
  const at = `https://secure.test:${server.port}/`

  // The name is answered by this computer, whose address the project lists, and the certificate of the server is
  // the root that was handed in.
  const listed = { mode: 'live' as const, privateHosts: ['127.0.0.1'] }
  const trusting = fetchWith({ ...listed, roots: made.cert }, held.lookup)
  const answer = await trusting(at)
  assert.equal(await answer.text(), 'over a secure connection')
  assert.equal(server.asked[0]?.headers.host, `secure.test:${server.port}`)
  assert.deepEqual(held.asked, ['secure.test'])

  // The same server under a name that its certificate does not hold, and under its address, is not taken.
  for (const other of [`https://other.test:${server.port}/`, `https://127.0.0.1:${server.port}/`]) {
    const error = await failure(trusting(other))
    assert.ok(error instanceof TypeError, `${error.name}: ${error.message}`)
    assert.match(String(Object(error.cause).code), /ALTNAME/, other)
  }
  // With no root handed in, a certificate that nobody known signed is not taken.
  const lone = names({ 'secure.test': [['127.0.0.1']] })
  const error = await failure(fetchWith(listed, lone.lookup)(at))
  assert.ok(error instanceof TypeError, `${error.name}: ${error.message}`)
  assert.equal(server.asked.length, 1)

  // The project lists the name in place of the address, with no http:// in front: it is reached the same.
  const live = fetchWith({ mode: 'live', roots: made.cert, privateHosts: ['secure.test'] }, lone.lookup)
  assert.equal(await (await live(at)).text(), 'over a secure connection')
})
