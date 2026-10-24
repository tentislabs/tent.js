import assert from 'node:assert/strict'
import { Socket } from 'node:net'
import { test } from 'node:test'
import { webSide } from '../web/answering.ts'
import type { Serving } from '../web/server.ts'
import type { RawLive } from './rawLive.ts'
import { rawLive } from './rawLive.ts'
import { running } from './apps.ts'
import { liveMoment } from './watching.ts'

// Ten thousand addresses of one range: the count of an address shows itself by its 31st and its 101st.
const range = (n: number): string => `2001:db8:5:1:${(n >> 12).toString(16)}:${(n & 4095).toString(16)}:a:7`

test('[05-10.38] live connections, each from another address of one range of the newer kind, that answer every alive, are counted as one address: refused from the 31st', async (t) => {
  // A proxy on this computer names each sender, as the edge of a host does.
  const { port } = await running(t, { project: 'board', engine: { proxy: { from: ['127.0.0.1'] } } })
  // Behind a proxy the scheme is https unless the proxy rule says otherwise.
  const origin = `https://localhost:${port}`
  const held: RawLive[] = []
  t.after(() => {
    for (const one of held) one.end()
  })
  for (let n = 0; n < 40; n++) {
    const one = await rawLive(port, { origin, 'x-forwarded-for': range(n * 101) })
    held.push(one)
    if (n < 30) assert.equal(one.status, 101, `connection ${n + 1}`)
    else assert.equal(one.status, 429, `connection ${n + 1}`)
  }
  // Each that is held answers its signs of life: they are held, and counted, all the while.
  for (const one of held.filter((link) => link.status === 101)) one.text({ t: 'alive' })
  await liveMoment(50)
  assert.equal(held.filter((one) => one.status === 101 && !one.closed()).length, 30)
  // An address of another range is another sender, and one of the older kind stands alone.
  for (const other of ['2001:db8:5:2::1', '198.51.100.7']) {
    const one = await rawLive(port, { origin, 'x-forwarded-for': other })
    held.push(one)
    assert.equal(one.status, 101, other)
  }
})

/** A connection that a server was handed, from an address that a test names. */
function from(at: string): Socket {
  const socket = new Socket()
  Object.defineProperty(socket, 'remoteAddress', { value: at })
  return socket
}

/** The web side of an engine with nothing behind it: only what it does with a new connection is asked of it. */
function sideOf(): ReturnType<typeof webSide> {
  const never = (): never => assert.fail('the web side was asked more than to count a connection')
  const serving: Serving = {
    port: 0,
    host: '127.0.0.1',
    web: {},
    isProxy: () => false,
    bodySize: never,
    streamed: never,
    answer: never,
    tooLarge: never,
    link: never,
    live: never,
    refused: never,
  }
  return webSide(serving)
}

/** Hands the web side one connection from each address, and answers how many of them it closed at once. */
function closedOf(addresses: string[]): number {
  const side = sideOf()
  const sockets = addresses.map(from)
  for (const socket of sockets) side.connection(socket)
  const closed = sockets.filter((one) => one.destroyed).length
  for (const one of sockets) one.destroy()
  return closed
}

test('[05-10.38] open connections, each from another address of one range of the newer kind, are counted as one address: refused from the 101st', () => {
  // One address alone: the hundred and first is closed, so the count is seen to work.
  assert.equal(closedOf(Array.from({ length: 101 }, () => '2001:db8:5:1::1')), 1)
  // A thousand addresses of one range: every one past the hundredth is closed.
  assert.equal(closedOf(Array.from({ length: 1000 }, (_, n) => range(n))), 900)
})
