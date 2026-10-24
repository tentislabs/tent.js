import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import type { TestContext } from 'node:test'

/** A server of the test that stands where a browser's channel would: it takes a connection and never answers. */
export interface StillChannel {
  // Where a channel is opened: `ws://127.0.0.1:<port>/session`.
  address: string
  // Closes every connection it took, as a browser that ended.
  drop(): void
}

/**
 * Starts a server on a free port of this computer that opens a WebSocket by the handshake of the protocol
 * (https://www.rfc-editor.org/rfc/rfc6455#section-4.2.2) and then reads nothing and sends nothing. With `opens`
 * false it takes the request of the handshake and never answers it. It ends with the test.
 */
export async function stillChannel(t: TestContext, o: { opens?: boolean } = {}): Promise<StillChannel> {
  const taken = new Set<Socket>()
  const server = createServer()
  server.on('upgrade', (request, socket: Socket) => {
    taken.add(socket)
    socket.on('error', () => undefined)
    if (o.opens === false) return
    const key = String(request.headers['sec-websocket-key'] ?? '')
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const drop = (): void => {
    for (const socket of taken) socket.destroy()
    taken.clear()
  }
  t.after(
    () =>
      new Promise<void>((done) => {
        drop()
        server.close(() => done())
      }),
  )
  const at = server.address()
  return { address: `ws://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}/session`, drop }
}
