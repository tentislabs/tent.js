import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import type { ByWire, Siege } from './sieges.ts'
import { asked, besieged, byWire, callOf, logOf, wire } from './sieges.ts'

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** The head of a call that states a body of some length, and sends none of it yet. */
const headOf = (siege: Siege, name: string, length: number): string =>
  `POST ${callOf(name)} HTTP/1.1\r\nHost: localhost:${siege.port}\r\nContent-Type: application/json\r\nContent-Length: ${length}\r\n\r\n`

/** Sends a piece on a connection every so often, for as long as the connection stands. Answers what stops it. */
function trickled(sender: ByWire, everyMs: number, piece: string): () => void {
  const timer = setInterval(() => sender.write(piece), everyMs)
  timer.unref()
  return () => clearInterval(timer)
}

/** Opens connections that send nothing, fifty at a time, and answers them with how many the engine kept open. */
async function flooded(t: TestContext, siege: Siege, count: number): Promise<{ kept: number; all: ByWire[] }> {
  const all: ByWire[] = []
  for (let at = 0; at < count; at += 50) {
    // A connection that the system itself refuses, since the engine has not taken the ones before it yet, is none.
    const some = Array.from({ length: Math.min(50, count - at) }, () => byWire(t, siege).catch(() => undefined))
    all.push(...(await Promise.all(some)).filter((one) => one !== undefined))
  }
  // A connection that the engine does not take is closed at once, and one that it takes stays open.
  await pause(400)
  return { kept: all.filter((one) => !one.socket.destroyed && !one.socket.closed).length, all }
}

/** Answers the app on the other address of this computer, where the engine listens there, and with no network otherwise. */
async function othersAnswered(siege: Siege, wide: boolean): Promise<number> {
  if (wide) return (await wire(siege, { path: callOf('whoAmI'), via: '::1', host: `[::1]:${siege.port}` })).status
  return (await asked(siege.app, siege.origin, { path: callOf('whoAmI'), from: '203.0.113.50' })).status
}

/** Opens the app on both kinds of address of this computer, so that a second sender has an address of its own, where the system gives both. */
async function onBothAddresses(t: TestContext, web: Record<string, string | number>): Promise<[Siege, boolean]> {
  try {
    const siege = await besieged(t, { engine: { host: '::', web }, open: { address: '*' } })
    const reached = await wire(siege, { method: 'GET', path: '/_t/health', via: '::1' }).then(
      (answer) => answer.status === 200,
      () => false,
    )
    if (reached) return [siege, true]
    await siege.engine.close()
  } catch {
    // A system with no address of the newer kind: the second sender then asks with no network.
  }
  return [await besieged(t, { engine: { web }, open: { address: '*' } }), false]
}

test('[05-2.11] headers that never end, a body that stops, and a thousand connections that send nothing are each closed, the address holds no more than its share, and the app keeps answering others', async (t) => {
  // The times are those of the engine, set short so that the attack ends within some seconds.
  const web = { headTime: '1 second', bodyCloseAfter: '1 second', closeAfter: '2 seconds', openPerAddress: 100 }
  const [siege, wide] = await onBothAddresses(t, web)

  // Headers that never end: a line more every 100 ms.
  const endless = await byWire(t, siege)
  endless.write(`POST ${callOf('whoAmI')} HTTP/1.1\r\nHost: localhost:${siege.port}\r\n`)
  const stopHeaders = trickled(endless, 100, 'X-More: of the same\r\n')
  // A body of which a part arrives, and then nothing.
  const stalled = await byWire(t, siege)
  stalled.write(`${headOf(siege, 'echo', 1000)}{"input":{"text":"`)
  // Headers larger than the head may be, all at once.
  const large = await byWire(t, siege)
  large.write(`GET /_t/health HTTP/1.1\r\nHost: localhost:${siege.port}\r\nX-Large: ${'x'.repeat(20_000)}\r\n\r\n`)
  // While they stand, others are answered.
  assert.equal(await othersAnswered(siege, wide), 200)
  for (const [what, sender] of Object.entries({ endless, stalled, large })) {
    const closed = await sender.closed(6000)
    assert.ok(closed, `${what}: the connection was closed`)
    assert.equal(closed.text.includes('"ok":true'), false, what)
  }
  stopHeaders()

  // A thousand connections from one address that are opened and send nothing.
  const { kept, all } = await flooded(t, siege, 1000)
  assert.ok(kept <= 100, `the address holds ${kept} connections, and its share is 100`)
  // The first of them may be closed already, by the time a connection may send nothing.
  assert.ok(kept > 0, 'the address was let hold connections')
  assert.equal(await othersAnswered(siege, wide), 200)
  // Each is closed by the time a connection may send nothing.
  for (const one of all) assert.ok(await one.closed(6000), 'a connection that sent nothing was closed')
  // The address is taken again once they are gone.
  let status = 0
  for (let tries = 0; tries < 100 && status !== 200; tries++) {
    if (tries) await pause(50)
    status = await wire(siege, { path: callOf('whoAmI') }).then(
      (answer) => answer.status,
      () => 0,
    )
  }
  assert.equal(status, 200)
  // No function ran for any of it, but for the calls of the others.
  assert.deepEqual([...new Set(logOf(siege.dataFolder, 'calls').map((row) => row.name))], ['whoAmI'])
})

test('[05-2.11] through a named proxy the connections do not count for the proxy', async (t) => {
  const web = { closeAfter: '30 seconds', openPerAddress: 100 }
  const siege = await besieged(t, { engine: { web, proxy: { from: ['127.0.0.1'] } }, open: { address: '*' } })
  const { kept, all } = await flooded(t, siege, 300)
  assert.equal(kept, 300)
  // And a visitor behind it is answered while they stand.
  const answer = await wire(siege, { path: callOf('whoAmI'), headers: { 'x-forwarded-for': '198.51.100.7' } })
  assert.equal(answer.status, 200)
  for (const one of all) one.end()
})

test('[05-2.11] [night] by the times of the engine itself: headers that never end, a body sent one byte a second, and one byte every 29 seconds, are each closed', async (t) => {
  const siege = await besieged(t)
  const endless = await byWire(t, siege)
  endless.write(`POST ${callOf('whoAmI')} HTTP/1.1\r\nHost: localhost:${siege.port}\r\n`)
  const stopHeaders = trickled(endless, 1000, 'X-More: of the same\r\n')
  const slow = await byWire(t, siege)
  slow.write(headOf(siege, 'echo', 100_000))
  const stopBody = trickled(slow, 1000, 'x')
  const slower = await byWire(t, siege)
  slower.write(`${headOf(siege, 'echo', 100_000)}x`)
  const stopSlower = trickled(slower, 29_000, 'x')
  t.after(() => [stopHeaders, stopBody, stopSlower].forEach((stop) => void stop()))
  // The headers have ten seconds, and a body that arrives slower than 1 kB a second, taken over ten, is closed.
  const [headers, body, rare] = await Promise.all([endless.closed(14_000), slow.closed(24_000), slower.closed(24_000)])
  assert.ok(headers && headers.ms > 8000, `the headers were closed after ${headers?.ms} ms`)
  assert.ok(body && body.ms > 8000, `the slow body was closed after ${body?.ms} ms`)
  assert.ok(rare, 'the body of one byte every 29 seconds was closed')
  for (const one of [headers, body, rare]) assert.equal(one.text.includes('"ok":true'), false)
  // A large body over a slow line is taken: 2 kB a second.
  const steady = await byWire(t, siege)
  const whole = JSON.stringify({ input: { text: 'x'.repeat(30_000) } })
  steady.write(headOf(siege, 'echo', whole.length))
  for (let at = 0; at < whole.length; at += 1000) {
    steady.write(whole.slice(at, at + 1000))
    await pause(500)
  }
  await pause(500)
  assert.match(steady.arrived(), /^HTTP\/1\.1 200 /)
  assert.equal((await wire(siege, { path: callOf('whoAmI') })).status, 200)
})

test('[05-2.17] a body that states a Content-Encoding is T0003 and nothing is opened, and a request with two lengths is closed by the reader of the runtime', async (t) => {
  const siege = await besieged(t, { limits: { callSize: 100_000 } })
  const ran = (): number => logOf(siege.dataFolder, 'lines').length
  // A packed body that would open to a whole call a thousand times its size.
  const plain = JSON.stringify({ input: { text: 'x'.repeat(5_000_000) } })
  const packed = new Uint8Array(gzipSync(plain))
  assert.ok(packed.length < 10_000)
  for (const encoding of ['gzip', 'br', 'deflate', 'zstd', 'identity', 'gzip, gzip', 'x-gzip', 'GZIP', 'none', '']) {
    for (const body of [packed, '{"input":{"text":"not packed at all"}}']) {
      const began = performance.now()
      const answer = await wire(siege, { path: callOf('echo'), body, headers: { 'content-encoding': encoding } })
      assert.deepEqual([answer.status, answer.error.code], [413, 'T0003'], encoding)
      assert.ok(performance.now() - began < 2000, encoding)
    }
  }
  assert.equal(ran(), 0)

  // Two lengths: the second request rides behind the first, for a reader that takes the other length.
  const hidden = `POST ${callOf('addWord')} HTTP/1.1\r\nHost: localhost:${siege.port}\r\nContent-Type: application/json\r\nContent-Length: 28\r\n\r\n{"input":{"text":"hidden"}}  `
  const first = '{"input":{"text":"first"}}'
  const start = `POST ${callOf('echo')} HTTP/1.1\r\nHost: localhost:${siege.port}\r\nContent-Type: application/json\r\n`
  const attacks = {
    'two lengths that differ': `${start}Content-Length: ${first.length}\r\nContent-Length: ${first.length + hidden.length}\r\n\r\n${first}${hidden}`,
    'two lengths in one line': `${start}Content-Length: ${first.length}, ${first.length + hidden.length}\r\n\r\n${first}${hidden}`,
    'a length beside a body in pieces': `${start}Content-Length: ${first.length}\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n${hidden}`,
    'a body in pieces beside a length': `${start}Transfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n0\r\n\r\n${hidden}`,
    'pieces that are named oddly': `${start}Transfer-Encoding: xchunked\r\nContent-Length: ${first.length}\r\n\r\n${first}${hidden}`,
    'a length that is no number': `${start}Content-Length: ${first.length}abc\r\n\r\n${first}${hidden}`,
    'a length below zero': `${start}Content-Length: -1\r\n\r\n${first}${hidden}`,
    'a length with a sign': `${start}Content-Length: +${first.length}\r\n\r\n${first}${hidden}`,
    'a header with a space before its colon': `${start}Content-Length : ${first.length + hidden.length}\r\nContent-Length: ${first.length}\r\n\r\n${first}${hidden}`,
  }
  for (const [what, text] of Object.entries(attacks)) {
    const sender = await byWire(t, siege)
    sender.write(text)
    const closed = await sender.closed(4000)
    assert.ok(closed, `${what}: the connection was closed`)
    assert.match(closed.text, /^HTTP\/1\.1 400 /, what)
    assert.equal(closed.text.includes('"ok":true'), false, what)
  }
  assert.deepEqual(await siege.app.read({ from: 'words', count: true }, { as: 'system' }), 0)
  assert.equal(ran(), 0)
})

/** How many counts of the rate limits the data file of a siege holds, read beside the engine that has it open. */
function rates(siege: Siege): number {
  const db = new DatabaseSync(join(siege.dataFolder, 'data.db'), { readOnly: true })
  try {
    return Number(db.prepare('SELECT count(*) AS n FROM "_t_rate"').get()?.n)
  } finally {
    db.close()
  }
}

/** Sends one call from each of many made-up addresses behind a named proxy, and answers how long the first and the last five hundred took. */
async function fromMany(siege: Siege, count: number): Promise<{ first: number; last: number }> {
  const times: number[] = []
  let began = performance.now()
  for (let i = 0; i < count; i++) {
    const address = `${11 + (i >>> 24)}.${(i >>> 16) & 255}.${(i >>> 8) & 255}.${i & 255}`
    const answer = await asked(siege.app, siege.origin, {
      path: callOf('whoAmI'),
      from: '10.1.1.1',
      headers: { 'x-forwarded-for': `203.0.113.9, ${address}` },
    })
    assert.equal(answer.status, 200, `the call of ${address}`)
    if (i % 500 === 499) {
      times.push(performance.now() - began)
      began = performance.now()
    }
  }
  return { first: times[0], last: times[times.length - 1] }
}

/** Row 19, with as many addresses as the test can send in its time. */
async function manyAddresses(t: TestContext, count: number): Promise<void> {
  const siege = await besieged(t, { engine: { proxy: { from: ['10.0.0.0/8'] } }, open: { address: '*' } })
  const { first, last } = await fromMany(siege, count)
  // The app keeps answering: the last calls take what the first took, and a visitor who comes then is answered.
  assert.ok(last < first * 5 + 500, `the first five hundred calls took ${first} ms, and the last ${last} ms`)
  assert.equal(rates(siege), count)
  const visitor = { path: callOf('whoAmI'), from: '10.1.1.1', headers: { 'x-forwarded-for': '198.51.100.99' } }
  assert.equal((await asked(siege.app, siege.origin, visitor)).status, 200)
  // A minute later the counts hold none of them, and taking them away held the app up for a moment at most.
  const began = performance.now()
  siege.clock.advance(61_000)
  const took = performance.now() - began
  assert.equal(rates(siege), 0)
  assert.ok(took < 2000 + count / 10, `the counts of ${count} addresses were removed in ${Math.round(took)} ms`)
  assert.equal((await asked(siege.app, siege.origin, visitor)).status, 200)
}

test('[05-2.19] two thousand made-up addresses behind a named proxy, one call each: the app keeps answering, and a minute later _t_rate holds none of them', async (t) => {
  await manyAddresses(t, 2000)
})

test('[05-2.19] [night] a hundred thousand made-up addresses behind a named proxy, one call each: the app keeps answering, and a minute later _t_rate holds none of them', async (t) => {
  await manyAddresses(t, 100_000)
})
