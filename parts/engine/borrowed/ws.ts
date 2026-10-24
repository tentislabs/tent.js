import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { RawData } from 'ws'
import { WebSocket, WebSocketServer } from 'ws'
import type { Frame, Link } from '../copy/link.ts'

// The most bytes that one message of a link may hold: a record of a commit is held whole in memory.
const largest = 1_073_741_824

// How long the other side is given to answer a closing, in milliseconds: then the connection is ended.
const closeTime = 1000

// How long an opening is given, in milliseconds: one that is taken and never answered is then told as closed.
const openTime = 30_000

// A message is sent as it is: the records of a store pack badly, and packing costs a write its time.
const plain = { perMessageDeflate: false, maxPayload: largest }

/** The bytes of a message as the borrowed part hands them: one buffer, or the pieces of one. */
const bytesOf = (data: RawData): Buffer =>
  Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data

/**
 * Makes a link of a WebSocket of the borrowed part. `opened` says that its opening has passed: what is sent
 * before waits for it. What arrives before anybody listens waits too, and a closing by either side is told once.
 */
function linkOf(socket: WebSocket, opened: boolean): Link & { waiting(): number } {
  let handler: ((frame: Frame) => void) | undefined
  let closed: (() => void) | undefined
  let open = true
  let ready = opened
  const before: Frame[] = []
  const waiting: Frame[] = []
  const end = (): void => {
    if (!open) return
    open = false
    closed?.()
  }
  const out = (frame: Frame): void => socket.send(frame, { binary: typeof frame !== 'string' })
  socket.on('open', () => {
    ready = true
    for (const frame of before.splice(0)) out(frame)
  })
  socket.on('message', (data, isBinary) => {
    if (!open) return
    const frame: Frame = isBinary ? new Uint8Array(bytesOf(data)) : bytesOf(data).toString('utf8')
    if (handler) handler(frame)
    else waiting.push(frame)
  })
  socket.on('close', end)
  // An opening that is refused, and a connection that breaks, end the link: the borrowed part closes it itself.
  socket.on('error', () => {
    socket.terminate()
    end()
  })
  return {
    send(frame) {
      if (!open) return
      if (ready) out(frame)
      else before.push(frame)
    },
    each(fn, whenClosed) {
      handler = fn
      closed = whenClosed
      for (const frame of waiting.splice(0)) if (open) fn(frame)
      if (!open) whenClosed?.()
    },
    close() {
      if (!open) return
      if (ready) {
        // What was sent leaves before the closing does. A side that does not answer the closing is ended.
        socket.close()
        const timer = setTimeout(() => socket.terminate(), closeTime)
        timer.unref()
        socket.once('close', () => clearTimeout(timer))
      } else socket.terminate()
      end()
    },
    // The bytes that were sent and that the other side has not taken yet.
    waiting: () => socket.bufferedAmount,
  }
}

// The servers of the borrowed part, by the most bytes that one message may hold there: each listens on nothing,
// and takes the openings that the web side hands it.
const servers = new Map<number, WebSocketServer>()

/**
 * Takes a request that asks for the opening of a WebSocket, its connection, and what was read past its head.
 * Answers the opening, and answers a promise of the link over that connection. The promise is refused for a
 * request that is no such opening: the borrowed part has answered it and closed the connection. `most` is the
 * most bytes that one message which arrives may hold, as a live connection bounds it: one more closes the link.
 */
export function accept(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  most: number = largest,
): Promise<Link & { waiting(): number }> {
  const taking =
    servers.get(most) ?? new WebSocketServer({ noServer: true, clientTracking: false, ...plain, maxPayload: most })
  servers.set(most, taking)
  return new Promise((done, failed) => {
    const refused = (): void => failed(new Error('The opening of a WebSocket was refused.'))
    socket.once('close', refused)
    taking.handleUpgrade(request, socket, head, (opened) => {
      socket.off('close', refused)
      done(linkOf(opened, true))
    })
  })
}

/**
 * Takes an address and the headers of the opening. Opens a WebSocket to that address, and answers the link at
 * once: what is sent before the opening has passed waits for it, and a link that cannot be opened, or whose
 * opening is not answered in its time, is told as closed.
 */
export function dial(address: string, headers: Record<string, string>): Link {
  return linkOf(new WebSocket(address.replace(/^http/, 'ws'), { headers, handshakeTimeout: openTime, ...plain }), false)
}
