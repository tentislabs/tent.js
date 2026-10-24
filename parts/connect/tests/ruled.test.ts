import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import { addressWith, settled } from '../guardedAddress.ts'
import { fetchWith } from '../guardedFetch.ts'
import { failure, names, refused, standIn } from './servers.ts'

// An address of the open internet, which no test connects to: it is named only where the rule answers before
// any connection, or where nothing but the rule is asked.
const far = '93.184.216.34'

/** Everything an error tells: its message, its fields and its fix, and the same of each cause under it. */
function toldBy(error: unknown): string {
  const told: string[] = []
  for (let one = error, depth = 0; one instanceof Error && depth < 10; one = one.cause, depth++)
    told.push(one.message, JSON.stringify(Object.entries(one)), String(Reflect.get(one, 'input') ?? ''))
  return told.join(' ')
}

test('[05-7.10] a name with more than one dot at its end is held as the name without them, and a name with an empty piece is refused', async () => {
  for (const dots of ['..', '...', '.....', '%2e%2e', '。。', '.%2E。'])
    for (const name of ['localhost', 'app.localhost', 'printer.local', 'db.internal', 'metadata.google.internal']) {
      const asks = names({})
      for (const mode of ['test', 'live'] as const) {
        await refused(fetchWith({ mode }, asks.lookup)(`https://${name}${dots}/`), 'private')
        await refused(fetchWith({ mode, plain: true }, asks.lookup)(`http://${name}${dots}:8080/`), 'private')
        if (!/[%。]/.test(dots)) await refused(addressWith(`${name}${dots}`, { mode }, asks.lookup), 'private')
      }
      if (!name.includes('localhost'))
        await refused(fetchWith({ mode: 'development' }, asks.lookup)(`https://${name}${dots}/`), 'private')
      assert.deepEqual(asks.asked, [], `${name}${dots}`)
    }

  // A name of the internet with dots at its end is the name without them: it is looked up so, and listed so.
  const held = names({ 'far.test': [[far]], 'intra.test': [['10.0.0.5']] })
  assert.equal(await addressWith('far.test...', { mode: 'live' }, held.lookup), far)
  assert.equal(
    await addressWith('intra.test..', { mode: 'live', privateHosts: ['intra.test'] }, held.lookup),
    '10.0.0.5',
  )
  assert.equal(
    await addressWith('intra.test', { mode: 'live', privateHosts: ['intra.test...'] }, held.lookup),
    '10.0.0.5',
  )
  assert.deepEqual(held.asked, ['far.test', 'intra.test', 'intra.test'])

  // An empty piece between two dots, and before the first: no such name is looked up, in any mode.
  const none = names({})
  for (const name of ['db..internal', 'far..test', '.internal', '.far.test', 'a...b.test', 'local..host', '..', '.'])
    for (const mode of ['development', 'test', 'live'] as const) {
      await refused(fetchWith({ mode }, none.lookup)(`https://${name}/`), 'private')
      await refused(fetchWith({ mode, plain: true }, none.lookup)(`http://${name}/`), 'private')
      await refused(addressWith(name, { mode }, none.lookup), 'private', name)
    }
  // A line of a list with an empty piece lists nothing.
  await refused(
    addressWith('10.0.0.5', { mode: 'live', privateHosts: ['a..b', '10.0.0.5..x'] }, none.lookup),
    'private',
  )
  assert.deepEqual(none.asked, [])
})

test('[05-7.11] without a secure connection every address that a name answers is held by itself', async (t) => {
  const server = await standIn(t, (_request, response) => response.end('listed'))
  const asked = (host: string) => ({ host, port: 80, shown: `http://${host}/`, secure: false })
  const live = { mode: 'live' as const, privateHosts: ['http://10.0.0.5', 'http://10.0.0.6:80', '10.0.0.7'] }

  for (const answer of [
    [far, '10.0.0.5'],
    ['10.0.0.5', far],
    ['10.0.0.5', '10.0.0.6', far],
    ['10.0.0.5', '2606:2800:220:1::1'],
    // Listed, and with no http:// in front: reached by a secure connection alone.
    ['10.0.0.5', '10.0.0.7'],
    // An address of this computer, which nothing lists.
    ['10.0.0.5', '127.0.0.1'],
  ]) {
    const held = names({ 'outer.test': [answer] })
    await refused(settled(asked('outer.test'), live, held.lookup), 'secure')
    await refused(fetchWith(live, held.lookup)('http://outer.test/'), 'secure', 'http://outer.test/')
    assert.deepEqual(held.asked, ['outer.test', 'outer.test'])
  }
  // Every address is listed with http:// in front: each may be connected to.
  const both = names({ 'outer.test': [['10.0.0.5', '10.0.0.6']] })
  assert.deepEqual(await settled(asked('outer.test'), live, both.lookup), ['10.0.0.5', '10.0.0.6'])
  // The name itself is listed with http:// in front: what it answers is the project's own word.
  const named = { mode: 'live' as const, privateHosts: ['http://outer.test'] }
  assert.deepEqual(await settled(asked('outer.test'), named, both.lookup), ['10.0.0.5', '10.0.0.6'])

  // In development, a local name: each address it answers is of this computer, or the name is refused.
  const local = names({ localhost: [['127.0.0.1', far]], 'app.localhost': [['127.0.0.1', '::1']] })
  await refused(settled(asked('localhost'), { mode: 'development' }, local.lookup), 'secure')
  assert.deepEqual(await settled(asked('app.localhost'), { mode: 'development' }, local.lookup), ['127.0.0.1', '::1'])
  // One address of this computer and one that the project lists.
  const mixed = names({ localhost: [['127.0.0.1', '10.0.0.5']] })
  assert.deepEqual(
    await settled(asked('localhost'), { mode: 'development', privateHosts: ['http://10.0.0.5'] }, mixed.lookup),
    ['127.0.0.1', '10.0.0.5'],
  )
  assert.equal(server.asked.length, 0)
})

test('[05-7.14] an error tells no name, no password and nothing after a question mark, in each way an address is refused', async (t) => {
  const other = await standIn(t, (_request, response) => response.end('other'))
  const server = await standIn(t, (_request, response, asked) => {
    if (asked.path.startsWith('/on')) response.writeHead(302, { location: '/on?key=the-key' }).end()
    else if (asked.path.startsWith('/out'))
      response.writeHead(302, { location: `https://user:the-password@10.0.0.5/x?key=the-key` }).end()
    else if (asked.path.startsWith('/broken'))
      response.writeHead(302, { location: 'https://user:the-password@[::1/x?key=the-key' }).end()
    else if (asked.path.startsWith('/never')) return
    else response.end(new Uint8Array(5000))
  })
  const held = names({ 'far.test': [[far]], 'inner.test': [['10.0.0.5']] })
  const o = { mode: 'live' as const, privateHosts: [`http://127.0.0.1:${server.port}`] }
  const fetch = fetchWith(o, held.lookup)
  const here = `127.0.0.1:${server.port}`
  const secret = /the-user|the-password|the-key/
  const tries: [what: string, work: () => Promise<unknown>][] = [
    ['a zone', () => fetch('https://the-user:the-password@[fe80::1%25eth0]/x?key=the-key#the-key')],
    ['a zone, with no path', () => fetch('https://the-user:the-password@[fe80::1%25eth0]?key=the-key')],
    ['a zone, plain', () => fetchWith({ ...o, plain: true }, held.lookup)('http://the-user@[fe80::1%eth0]/?the-key')],
    ['a password', () => fetch('https://the-user:the-password@far.test/x?key=the-key')],
    ['not secure', () => fetch('http://far.test/x?key=the-key#the-key')],
    ['another scheme', () => fetch('ftp://far.test/x?key=the-key')],
    ['private', () => fetch('https://inner.test/x?key=the-key')],
    ['a private name', () => fetch('https://db.internal/x?key=the-key')],
    ['an empty piece', () => fetch('https://db..internal/x?key=the-key')],
    ['a fourth redirect', () => fetch(`http://${here}/on?key=the-key`)],
    ['a redirect that is refused', () => fetch(`http://${here}/out?key=the-key`)],
    ['a redirect that no reader takes', () => fetch(`http://${here}/broken?key=the-key`)],
    ['a redirect, where none is taken', () => fetch(`http://${here}/on?key=the-key`, { redirect: 'error' })],
    ['no address', () => fetch('https://the-user:the-password@[::1/x?key=the-key')],
    ['no host', () => fetch('https://the-user:the-password@/x?key=the-key')],
    ['the time', () => fetch(`http://${here}/never?key=the-key`, { time: 200 })],
    ['the size', async () => (await fetch(`http://${here}/large?key=the-key`, { size: 10 })).text()],
    [
      'nothing listens',
      () => fetchWith({ ...o, privateHosts: ['http://127.0.0.1'] }, held.lookup)('http://127.0.0.1:9/x?key=the-key'),
    ],
    ['a name with no address', () => fetch('https://gone.test/x?key=the-key')],
  ]
  for (const [what, work] of tries) {
    const error = await failure(work())
    assert.ok(!secret.test(toldBy(error)), `${what}: ${toldBy(error)}`)
  }
  // Each that is a refusal of ours still names its address, without them.
  const zone = await refused(fetch('https://the-user:the-password@[fe80::1%25eth0]/x?key=the-key'), 'private')
  assert.equal(zone.fields?.address, 'https://[fe80::1%25eth0]/x')
  assert.equal(other.asked.length, 0)
})

test('[05-7.15] a redirect that would send the body of a request on to another host is refused, unless who asks states that the body may travel', async (t) => {
  const other = await standIn(t, (_request, response) => response.end('the other host'))
  const first = await standIn(t, (_request, response, asked) => {
    const [, status, where] = /^\/(\d+)\/(same|other)$/.exec(asked.path) ?? []
    if (!status) return void response.end('the first host')
    response.writeHead(Number(status), { location: where === 'same' ? '/landed' : `${other.origin}/landed` }).end()
  })
  const none = names({})
  const o = {
    mode: 'live' as const,
    privateHosts: [`http://127.0.0.1:${first.port}`, `http://127.0.0.1:${other.port}`],
  }
  const sent = {
    method: 'POST',
    body: 'what is sent, with a sign-in inside',
    headers: { 'content-type': 'text/plain' },
  }

  for (const fetch of [fetchWith(o, none.lookup), fetchWith({ ...o, plain: true }, none.lookup)]) {
    // A 307 and a 308 keep the method and the body, and so does a 301 and a 302 of a method that is no POST.
    for (const [status, method] of [
      [307, 'POST'],
      [308, 'POST'],
      [307, 'PUT'],
      [308, 'DELETE'],
      [301, 'PUT'],
      [302, 'PATCH'],
    ] as const) {
      const error = await refused(fetch(`${first.origin}/${status}/other`, { ...sent, method }), 'body')
      assert.equal(error.fields?.address, `${other.origin}/landed`)
      // To the same host the body goes on.
      first.asked.length = 0
      assert.equal(await (await fetch(`${first.origin}/${status}/same`, { ...sent, method })).text(), 'the first host')
      assert.equal(`${first.asked[1]?.method} ${first.asked[1]?.body}`, `${method} ${sent.body}`)
    }
    assert.equal(other.asked.length, 0)
    // A redirect that drops the body, and a request with none, goes on to the other host.
    for (const [status, method] of [
      [301, 'POST'],
      [302, 'POST'],
      [303, 'POST'],
      [303, 'PUT'],
    ] as const) {
      assert.equal(await (await fetch(`${first.origin}/${status}/other`, { ...sent, method })).text(), 'the other host')
      assert.equal(`${other.asked.at(-1)?.method} ${other.asked.at(-1)?.body}`, 'GET ')
    }
    for (const status of [307, 308]) {
      assert.equal(await (await fetch(`${first.origin}/${status}/other`)).text(), 'the other host')
      assert.equal(
        await (await fetch(`${first.origin}/${status}/other`, { method: 'DELETE' })).text(),
        'the other host',
      )
    }
    other.asked.length = 0
  }

  // Who asks states that the body may travel: it does, and the sign-in of a header still stays.
  const travels = fetchWith({ ...o, bodyTravels: true }, none.lookup)
  const headers = { ...sent.headers, authorization: 'Bearer the-sign-in' }
  assert.equal(await (await travels(`${first.origin}/307/other`, { ...sent, headers })).text(), 'the other host')
  assert.equal(`${other.asked[0]?.method} ${other.asked[0]?.body}`, `POST ${sent.body}`)
  assert.equal(other.asked[0]?.headers['content-type'], 'text/plain')
  assert.equal(other.asked[0]?.headers.authorization, undefined)
})

test('[05-7.16] in development a name of the internet that answers this computer is refused, as on live data', async (t) => {
  const server = await standIn(t, (_request, response) => response.end('this computer'))
  const held = names({
    'outer.test': [['127.0.0.1']],
    'six.test': [['::1']],
    'both.test': [[far, '127.0.0.1']],
    'local.example': [['127.0.0.1']],
    'localhost.test': [['127.0.0.1']],
    localhost: [['127.0.0.1']],
    'app.localhost': [['127.0.0.1']],
    'far.localhost': [[far]],
  })
  for (const mode of ['development', 'live'] as const) {
    const fetch = fetchWith({ mode }, held.lookup)
    for (const name of ['outer.test', 'six.test', 'both.test', 'local.example', 'localhost.test']) {
      await refused(fetch(`http://${name}:${server.port}/`), 'secure')
      await refused(fetch(`https://${name}:${server.port}/`), 'private')
      await refused(addressWith(name, { mode }, held.lookup), 'private', name)
      await refused(fetchWith({ mode, plain: true }, held.lookup)(`http://${name}:${server.port}/`), 'private')
    }
  }
  assert.deepEqual(server.asked, [])

  // What is written as this computer is reached in development: an address, `localhost`, and a name under it.
  const development = fetchWith({ mode: 'development' }, held.lookup)
  for (const host of ['127.0.0.1', '127.1', '[::ffff:127.0.0.1]', 'localhost', 'LOCALHOST.', 'app.localhost'])
    assert.equal(await (await development(`http://${host}:${server.port}/`)).text(), 'this computer', host)
  // A local name is held to what it answers: an address of the internet behind it is none of this computer.
  await refused(development(`http://far.localhost:${server.port}/`), 'secure')
  // A builder lists another name that answers this computer, and it is reached, in development as on live data.
  for (const mode of ['development', 'live'] as const) {
    const listed = fetchWith({ mode, privateHosts: ['http://outer.test'] }, held.lookup)
    assert.equal(await (await listed(`http://outer.test:${server.port}/`)).text(), 'this computer')
  }
})

test('[05-7.1] an IPv4 address inside the form ::ffff:0:0:0/96 is opened and held to the IPv4 list', async () => {
  const none = names({})
  for (const [written, meant] of [
    ['[::ffff:0:10.0.0.1]', '10.0.0.1'],
    ['[::ffff:0:a00:1]', '10.0.0.1'],
    ['[0:0:0:0:ffff:0:7f00:1]', '127.0.0.1'],
    ['[::FFFF:0:169.254.169.254]', '169.254.169.254'],
    ['[::ffff:0:c0a8:101]', '192.168.1.1'],
    ['[::ffff:0:0.0.0.0]', '0.0.0.0'],
  ] as const) {
    for (const mode of ['development', 'test', 'live'] as const) {
      await refused(fetchWith({ mode }, none.lookup)(`https://${written}/`), 'private')
      await refused(fetchWith({ mode, plain: true }, none.lookup)(`http://${written}/`), 'private')
      await refused(addressWith(written, { mode }, none.lookup), 'private', written)
    }
    // The project lists the address it carries, and the form is reached: so it was opened to that address.
    assert.notEqual(await addressWith(written, { mode: 'live', privateHosts: [meant] }, none.lookup), '')
  }
  // A public address inside it passes, and is connected to as the address that was written.
  assert.equal(await addressWith(`[::ffff:0:${far}]`, { mode: 'live' }, none.lookup), '::ffff:0:5db8:d822')
  // What a look-up answers is held the same.
  const held = names({ 'inside.test': [['::ffff:0:10.0.0.1']], 'both.test': [[far, '::ffff:0:a00:1']] })
  await refused(addressWith('inside.test', { mode: 'live' }, held.lookup), 'private')
  await refused(addressWith('both.test', { mode: 'live' }, held.lookup), 'private')
  assert.deepEqual(none.asked, [])
})

test('[22-19] who asks states how many redirects are followed, and three are followed where none is stated', async (t) => {
  const server = await standIn(t, (_request, response, asked) => {
    const hop = /^\/hop\/(\d+)$/.exec(asked.path)
    if (hop && Number(hop[1]) > 0) response.writeHead(302, { location: `/hop/${Number(hop[1]) - 1}` }).end()
    else response.end('landed')
  })
  const none = names({})
  const o = { mode: 'live' as const, privateHosts: [`http://127.0.0.1:${server.port}`] }
  const fetch = fetchWith(o, none.lookup)
  const lands = async (hops: number, init: { redirects?: number }): Promise<string> =>
    (await fetch(`${server.origin}/hop/${hops}`, init)).text()

  assert.equal(await lands(3, {}), 'landed')
  await refused(fetch(`${server.origin}/hop/4`), 'redirects')
  for (const redirects of [0, 1, 2, 5, 8]) {
    assert.equal(await lands(redirects, { redirects }), 'landed')
    server.asked.length = 0
    await refused(fetch(`${server.origin}/hop/${redirects + 1}`, { redirects }), 'redirects')
    // The one redirect too many is not followed.
    assert.equal(server.asked.length, redirects + 1)
  }
  // The plain form follows as many as the runtime's own `fetch`, and as many as who asks states.
  const plain = fetchWith({ ...o, plain: true }, none.lookup)
  assert.equal(await (await plain(`${server.origin}/hop/20`)).text(), 'landed')
  await refused(plain(`${server.origin}/hop/21`), 'redirects')
  await refused(plain(`${server.origin}/hop/3`, { redirects: 2 }), 'redirects')
})

test('[22-19] a size, a time or a number of redirects that is no number, or a negative one, is refused before a connection', async (t) => {
  const server = await standIn(t, (_request, response) => response.end(new Uint8Array(5000)))
  const asks = names({ 'far.test': [[far]] })
  const o = { mode: 'live' as const, privateHosts: [`http://127.0.0.1:${server.port}`] }
  const none: unknown[] = [-1, -0.5, Number.NaN, Number.NEGATIVE_INFINITY, '100', null, {}, true]
  for (const fetch of [fetchWith(o, asks.lookup), fetchWith({ ...o, plain: true }, asks.lookup)])
    for (const name of ['size', 'time', 'redirects'])
      for (const stated of none) {
        const init: { size?: number; time?: number; redirects?: number } = {}
        Reflect.set(init, name, stated)
        for (const address of [`${server.origin}/`, 'https://far.test/']) {
          const error = await failure(fetch(address, init))
          assert.ok(error instanceof TypeError && !(error instanceof TentError), `${name} ${String(stated)}: ${error}`)
          assert.match(error.message, new RegExp(name))
        }
      }
  // Nothing was asked, and no name was looked up.
  assert.equal(server.asked.length, 0)
  assert.deepEqual(asks.asked, [])

  // Zero is a number that is not negative: it is held as it is stated.
  const fetch = fetchWith(o, asks.lookup)
  const cut = await failure((async () => (await fetch(`${server.origin}/`, { size: 0 })).text())())
  assert.ok(cut instanceof TentError && cut.code === 'T0023', cut.message)
  const whole = await fetch(`${server.origin}/`, { size: 5000, time: 60_000, redirects: 0 })
  assert.equal((await whole.arrayBuffer()).byteLength, 5000)
})

test('[05-7.14] an error of guardedAddress tells no name, no password and nothing after a question mark, and none tells a text that is no host', async () => {
  const held = names({ 'mail.test': [['10.0.0.5']] })
  const secret = /the-user|the-password|the-key/
  for (const host of [
    'the-user:the-password@[fe80::1%25eth0]',
    'the-user:the-password@fe80::1%eth0',
    'the-user%40x:the-password@mail.test',
    'the-user:the-password@mail.test',
    'the-user:the-password@mail.test:25',
    'mail.test/x?key=the-key',
    'mail.test?key=the-key',
    'mail.test#the-key',
    'smtp://the-user:the-password@mail.test:25/x?key=the-key',
    'the-user:the-password@10.0.0.5',
    'the-user:the-password@db.internal',
    'the-user:the-password@db..internal',
    'the-key the-key',
    'the-user:the-password@',
    '?the-key',
    '',
  ])
    for (const mode of ['development', 'live'] as const) {
      const error = await failure(addressWith(host, { mode }, held.lookup))
      assert.ok(!secret.test(toldBy(error)), `${JSON.stringify(host)}: ${toldBy(error)}`)
    }
  // What is refused still names its host, without them, and what is no host is told as none.
  const error = await refused(addressWith('mail.test:25/x?key=the-key', { mode: 'live' }, held.lookup), 'private')
  assert.equal(error.fields?.address, 'mail.test:25')
  const zone = await refused(addressWith('[fe80::1%25eth0]/x?key=the-key', { mode: 'live' }, held.lookup), 'private')
  assert.equal(zone.fields?.address, '[fe80::1%25eth0]')
  assert.ok((await failure(addressWith('the-key the-key', { mode: 'live' }, held.lookup))) instanceof TypeError)
})

test('[05-7.4] a host with a name and a password in front that is handed to guardedAddress is refused, as an address with them is', async () => {
  const held = names({ 'mail.test': [[far]], 'inner.test': [['10.0.0.5']] })
  for (const mode of ['development', 'test', 'live'] as const)
    for (const [host, shown] of [
      ['the-user:the-password@mail.test:25', 'mail.test:25'],
      ['the-user:the-password@mail.test', 'mail.test'],
      ['the-user@mail.test', 'mail.test'],
      [':the-password@mail.test', 'mail.test'],
      ['the-user:@mail.test', 'mail.test'],
      ['the-user%40x:the-password@mail.test', 'mail.test'],
      ['the-user:the-password@inner.test:25', 'inner.test:25'],
      ['the-user:the-password@10.0.0.5', '10.0.0.5'],
      ['the-user:the-password@127.0.0.1:25', '127.0.0.1:25'],
      ['the-user:the-password@[::1]:25', '[::1]:25'],
      ['the-user:the-password@[fe80::1%25eth0]', '[fe80::1%25eth0]'],
      ['the-user:the-password@db.internal', 'db.internal'],
      ['smtp://the-user:the-password@mail.test:25/x?key=the-key', 'mail.test:25'],
      ['a@b@mail.test', 'mail.test'],
    ] as const) {
      // Listed or not, private or not: the name and the password are what refuses it.
      for (const o of [
        { mode },
        { mode, privateHosts: ['inner.test', '10.0.0.5', '127.0.0.1', '[::1]', 'db.internal'] },
      ]) {
        const error = await refused(addressWith(host, o, held.lookup), 'password', shown)
        assert.ok(!/the-user|the-password|the-key/.test(toldBy(error)), toldBy(error))
      }
    }
  // No name was looked up for any of them.
  assert.deepEqual(held.asked, [])
  // The same host with nothing in front is held as before.
  assert.equal(await addressWith('mail.test:25', { mode: 'live' }, held.lookup), far)
})
