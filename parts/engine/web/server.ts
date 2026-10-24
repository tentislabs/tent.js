import type { Server } from 'node:http'
import { createServer } from 'node:http'
import type { Link } from '../copy/link.ts'
import { bytesOf, msOf } from '../words.ts'
import { webSide } from './answering.ts'

/** What a request asks for, as far as the size of its body hangs on it: its method, and its path with what follows. */
export interface Addressed {
  method: string
  path: string
}

/** What the web side of an engine holds a connection to. A time and a size are written in words. */
export interface WebOptions {
  closeAfter?: string
  open?: number
  openPerAddress?: number
  atOnce?: number
  headSize?: string
  headTime?: string
  bodyCloseAfter?: string
  bodySpeed?: string
  stopTime?: string
  openTime?: string
}

/** What the server asks of the engine it serves. */
export interface Serving {
  port: number
  host: string
  web: WebOptions
  // Whether an address is a named proxy, whose connections count for no single sender.
  isProxy(address: string): boolean
  // The most bytes that the body of a request may hold, by its host, where it came from and its headers.
  bodySize(host: string, from: string, headers: Headers, asked: Addressed): number
  // Whether the body of what is asked is handed on as it arrives, and never held whole: the bytes of an upload.
  streamed(asked: Addressed): boolean
  // Answers a request that arrived over a connection from that address.
  answer(request: Request, from: string): Promise<Response>
  // Answers a body that passed its size, for the same three.
  tooLarge(host: string, from: string, headers: Headers, asked: Addressed): Response
  // Opens the link of a reader for a request that asks for a WebSocket, or throws what refuses it.
  link(request: Request, from: string): Link
  // The other end of a connection that a part above the engine joins for a request that asks for a WebSocket, or nothing.
  joined?(request: Request, from: string): Promise<Link | undefined>
  // Takes the opening of the live connection for a request that asks for a WebSocket, or throws what refuses it.
  live(request: Request, from: string): LiveTaking | Promise<LiveTaking>
  // The status that a refused opening of the live connection is answered with.
  refused(error: unknown): number
}

/**
 * An opening of the live connection that passed the door. `most` is the most bytes that one message of it may
 * hold. `attach` is handed the connection once its opening has passed, and `drop` is told where it never did.
 */
export interface LiveTaking {
  most: number
  attach(socket: Link & { waiting(): number }): void
  drop(): void
}

/** The web side as it runs: the port it listens on, and what closes it. */
export interface Serves {
  port: number
  close(): Promise<void>
}

/** Ends a server: calls in flight get `stopTime`, and then what is still open is closed. */
export function closedIn(server: Server, stopTime: number): Promise<void> {
  return new Promise<void>((closed) => {
    const timer = setTimeout(() => server.closeAllConnections(), stopTime)
    server.close(() => {
      clearTimeout(timer)
      closed()
    })
    server.closeIdleConnections()
  })
}

/** The options of the runtime's server of the older form of the web, held to the bounds of `web`. */
export const plainOptions = (o: Serving): Parameters<typeof createServer>[0] => ({
  maxHeaderSize: bytesOf('web.headSize', o.web.headSize, 16 * 1024),
  headersTimeout: msOf('web.headTime', o.web.headTime, 10_000),
  requestTimeout: 0,
  keepAliveTimeout: msOf('web.closeAfter', o.web.closeAfter, 5000),
  connectionsCheckingInterval: 1000,
})

/**
 * Takes what the server asks of its engine. Starts the web side on its port, HTTP/1.1 with compression, held to
 * the bounds of `web`: the size and the time of the headers, the connections an engine and one address may hold
 * open, the time a connection may send nothing, and the speed of a body. Answers a promise of the port it listens
 * on, which is a free one where 0 was asked for, and of what closes it: calls in flight get `stopTime`.
 */
export function serve(o: Serving): Promise<Serves> {
  const stopTime = msOf('web.stopTime', o.web.stopTime, 10_000)
  const side = webSide(o)
  const server: Server = createServer(plainOptions(o))
  server.maxConnections = o.web.open ?? 10_000
  server.on('connection', side.connection)
  server.on('request', (request, answer) => side.request(request, answer, false))
  server.on('upgrade', (request, socket, head) => side.upgrade(request, socket, head, false))
  return new Promise((done, failed) => {
    server.once('error', failed)
    server.listen(o.port, o.host, () => {
      const at = server.address()
      server.off('error', failed)
      done({
        port: typeof at === 'object' && at ? at.port : o.port,
        close: () => {
          side.closeLinks()
          return closedIn(server, stopTime)
        },
      })
    })
  })
}
