import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex, Readable, Writable } from 'node:stream'
import { BrotliCompress, brotliCompressSync, constants, createBrotliCompress, createGzip, gzipSync } from 'node:zlib'
import type { Link } from '../copy/link.ts'
import { socketSeen } from '../counts/program.ts'
import { bytesOf, msOf } from '../words.ts'
import { countedAs } from './names.ts'
import { plainAddress } from './proxy.ts'
import type { LiveTaking, Serving } from './server.ts'
import { streamed as streamedFrom } from './streamed.ts'
import { flowsHeader } from './flowing.ts'

/**
 * A request as either form of the web hands it: one connection for each request at a time, or many requests over
 * one connection. `destroy` and `setTimeout` touch this request alone: in the older form its connection, and in
 * the newer one its own stream.
 */
export interface WebAsking extends Readable {
  method?: string
  url?: string
  headers: IncomingHttpHeaders
  complete: boolean
  httpVersionMajor: number
  socket: { remoteAddress?: string | undefined; destroyed?: boolean; setTimeout?(ms: number): unknown }
  setTimeout(ms: number): unknown
}

/** The answer to a request, in either form of the web. */
export interface WebAnswer extends Writable {
  headersSent: boolean
  writeHead(status: number, headers: Record<string, string>): unknown
}

// The headers of a connection, which the newer form of the web does not carry.
const ofConnection = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade']

/** Whether a request came over the newer form of the web, where many requests share one connection. */
const sharesConnection = (request: WebAsking): boolean => request.httpVersionMajor >= 2

/** The host a request names: in the newer form of the web it is the authority. */
const hostOf = (request: WebAsking): string => String(request.headers[':authority'] ?? request.headers.host ?? '')

/** The headers of a request as the standard holds them: the names that start with a colon are of the newer form alone. */
function headersOf(request: WebAsking): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers))
    if (value !== undefined && !name.startsWith(':')) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  if (!headers.has('host') && hostOf(request)) headers.set('host', hostOf(request))
  return headers
}

/** Whether a request asks for the opening of a WebSocket. */
const asksSocket = (request: IncomingMessage): boolean =>
  String(request.headers.upgrade ?? '').toLowerCase() === 'websocket' &&
  typeof request.headers['sec-websocket-key'] === 'string'

/** Refuses the opening of a WebSocket on a connection, with a status and nothing else, and closes it. */
function refuseSocket(socket: Duplex, status: number): void {
  socket.end(`HTTP/1.1 ${status} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

// Over how long the speed of a body is taken, in milliseconds.
const speedWindow = 10_000

// A body of fewer bytes is sent as it is: packing it would save less than it costs.
const packFrom = 1024

/**
 * Holds the body of a request to a speed, taken over each window: a sender whose body arrives slower is closed.
 * Answers what is told of each part that arrived, and what ends the watch once the body is whole.
 */
function heldToSpeed(request: WebAsking, speed: number): { arrived(bytes: number): void; ended(): void } {
  let inWindow = 0
  const watch = setInterval(() => {
    if (inWindow < (speed * speedWindow) / 1000 && !request.complete) request.destroy()
    inWindow = 0
  }, speedWindow)
  watch.unref()
  const ended = (): void => clearInterval(watch)
  request.on('close', ended)
  // A sender whose body is whole has nothing more to send: the time its answer takes is not its silence.
  request.once('end', () => request.setTimeout(0))
  return {
    arrived: (bytes) => {
      inWindow += bytes
    },
    ended,
  }
}

/** Reads the body of a request as it arrives, within its size, its speed and the time it may send nothing. */
function readBody(
  request: WebAsking,
  o: { size: number; speed: number; closeAfter: number },
): Promise<Uint8Array<ArrayBuffer> | 'too large'> {
  return new Promise((done, failed) => {
    const parts: Buffer[] = []
    let size = 0
    request.setTimeout(o.closeAfter)
    const speed = heldToSpeed(request, o.speed)
    request.on('data', (part: Buffer) => {
      size += part.length
      speed.arrived(part.length)
      if (size > o.size) {
        speed.ended()
        request.removeAllListeners('data')
        request.resume()
        done('too large')
      } else parts.push(part)
    })
    request.on('end', () => {
      speed.ended()
      done(new Uint8Array(Buffer.concat(parts)))
    })
    request.on('error', (error) => {
      speed.ended()
      failed(error)
    })
  })
}

/** The body of a request handed on as it arrives, held to the speed as a body that is read whole is. */
function streamedBody(request: WebAsking, speed: number): ReadableStream<Uint8Array> {
  const held = heldToSpeed(request, speed)
  request.on('end', held.ended)
  return streamedFrom(request).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(part, controller) {
        held.arrived(part.length)
        controller.enqueue(part)
      },
    }),
  )
}

/**
 * Waits until what was written has left for its reader, or the answer has closed. A reader that takes nothing of
 * the answer for `stalledAfter` milliseconds is closed, and so the answer with it.
 */
function drained(out: Writable, answer: WebAnswer, stalledAfter: number): Promise<void> {
  return new Promise((go) => {
    // A request whose body is whole outlives its own closing: the answer is what holds the connection.
    const stalled = setTimeout(() => answer.destroy(), stalledAfter)
    const done = (): void => {
      clearTimeout(stalled)
      out.off('drain', done)
      answer.off('close', done)
      go()
    }
    out.once('drain', done)
    answer.once('close', done)
  })
}

/**
 * Writes a standard response to a request, packed where the sender takes it and the body is worth packing. `close`
 * closes the connection after it in the older form of the web; in the newer one, the request's own stream ends.
 * `stalledAfter` is how long a reader may take nothing of an answer that waits for it.
 */
async function send(
  response: Response,
  request: WebAsking,
  answer: WebAnswer,
  o: { close?: boolean; hsts?: string; stalledAfter: number },
): Promise<void> {
  const shares = sharesConnection(request)
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    if (!shares || !ofConnection.includes(name)) headers[name] = value
  })
  if (o.hsts !== undefined) headers['strict-transport-security'] = o.hsts
  const close = o.close === true && !shares
  // An answer that states its own length is sent as it arrives, piece by piece, and is not packed: the bytes of
  // a data file are at no moment whole in memory.
  if (response.body && headers['content-length'] !== undefined) {
    if (close) headers.connection = 'close'
    answer.writeHead(response.status, headers)
    const pieces = response.body.getReader()
    if (request.method === 'HEAD') {
      await pieces.cancel()
      answer.end()
      return
    }
    // A connection that closes before the end gives up what is left of the answer.
    answer.once('close', () => void pieces.cancel().catch(() => undefined))
    let written = 0
    try {
      for (;;) {
        const { done, value } = await pieces.read()
        if (done) break
        written += value.length
        if (!answer.write(value)) await drained(answer, answer, o.stalledAfter)
      }
    } catch {
      // What failed half way is told by the closing below: the answer is shorter than it said.
    }
    // An answer that cannot be ended as long as it stated is ended by closing it, so that whoever reads it takes a
    // short answer for no whole one.
    if (written === Number(headers['content-length'])) answer.end()
    else answer.destroy()
    return
  }
  const takes = String(request.headers['accept-encoding'] ?? '')
  if (response.body && headers[flowsHeader] !== undefined) {
    delete headers[flowsHeader]
    return flow(response.body, request, answer, {
      headers,
      status: response.status,
      takes,
      close,
      stalledAfter: o.stalledAfter,
    })
  }
  let body = Buffer.from(await response.arrayBuffer())
  if (body.length >= packFrom && !headers['content-encoding']) {
    const how = /\bbr\b/.test(takes) ? 'br' : /\bgzip\b/.test(takes) ? 'gzip' : undefined
    if (how === 'br') body = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    if (how === 'gzip') body = gzipSync(body)
    if (how) Object.assign(headers, { 'content-encoding': how, vary: 'Accept-Encoding' })
  }
  if (close) headers.connection = 'close'
  answer.writeHead(response.status, { ...headers, 'content-length': String(body.length) })
  answer.end(request.method === 'HEAD' ? undefined : body)
}

/**
 * Writes an answer whose body comes piece by piece, each piece as it comes and packed on its own where the sender
 * takes it, so that what was sent is shown before the rest has come. While it waits for a piece, the request is
 * not closed for sending nothing; a request that closes gives up what is left, and so does a reader that stalls.
 */
async function flow(
  body: ReadableStream<Uint8Array>,
  request: WebAsking,
  answer: WebAnswer,
  o: { headers: Record<string, string>; status: number; takes: string; close: boolean; stalledAfter: number },
): Promise<void> {
  const how = /\bbr\b/.test(o.takes) ? 'br' : /\bgzip\b/.test(o.takes) ? 'gzip' : undefined
  const headers: Record<string, string> = {
    ...o.headers,
    ...(how ? { 'content-encoding': how, vary: 'Accept-Encoding' } : {}),
  }
  if (o.close) headers.connection = 'close'
  answer.writeHead(o.status, headers)
  const pieces = body.getReader()
  if (request.method === 'HEAD') {
    await pieces.cancel()
    answer.end()
    return
  }
  // The server sets the time of a kept connection anew once the answer has ended.
  request.setTimeout(0)
  answer.once('close', () => void pieces.cancel().catch(() => undefined))
  const packer =
    how === 'br'
      ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : how === 'gzip'
        ? createGzip()
        : undefined
  packer?.pipe(answer)
  const out = packer ?? answer
  try {
    for (;;) {
      const { done, value } = await pieces.read()
      if (done) break
      if (!out.write(value)) await drained(out, answer, o.stalledAfter)
      // Each piece leaves at once, whole: a packer would otherwise hold it until it has more.
      if (packer instanceof BrotliCompress) packer.flush(constants.BROTLI_OPERATION_FLUSH)
      else packer?.flush(constants.Z_SYNC_FLUSH)
    }
  } catch {
    // What failed half way is told by the end below: the document is shorter than it would have been.
  }
  out.end()
}

/** What the web side does with what its servers hand it, and what closes the links it holds. */
export interface WebSide {
  // Counts a new connection for its address, and holds it to the time it may send nothing.
  connection(socket: Socket): void
  // Answers one request, over a plain connection or a secure one.
  request(request: WebAsking, answer: WebAnswer, secure: boolean): void
  // Opens a WebSocket for a request of the older form of the web that asks for one.
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer, secure: boolean): void
  // Closes every link that is open, and every one whose opening passes from now on.
  closeLinks(): void
}

/**
 * Takes what the server asks of its engine, and the header for secure names where the engine holds the
 * certificates. Answers what each of its servers hands a connection, a request and the opening of a WebSocket to.
 */
export function webSide(o: Serving, extra: { hsts?: string } = {}): WebSide {
  const closeAfter = msOf('web.closeAfter', o.web.closeAfter, 5000)
  const bodyCloseAfter = msOf('web.bodyCloseAfter', o.web.bodyCloseAfter, 30_000)
  const bodySpeed = bytesOf('web.bodySpeed', o.web.bodySpeed, 1024)
  const perAddress = o.web.openPerAddress ?? 100
  const open = new Map<string, number>()
  const links = new Set<Link>()
  let closing = false
  // The time a reader may take nothing of an answer is the time a sender may send nothing of a body.
  const sending = (secure: boolean): { hsts?: string; stalledAfter: number } => ({
    stalledAfter: bodyCloseAfter,
    ...(secure && extra.hsts !== undefined ? { hsts: extra.hsts } : {}),
  })
  const connection = (socket: Socket): void => {
    // What every connection reads and writes is the program's, those that belong to no app among them.
    socketSeen(socket)
    const address = plainAddress(socket.remoteAddress ?? '')
    // A proxy carries many visitors over the connections it keeps, so its connections count for no single sender.
    if (!o.isProxy(address)) {
      // A sender with a whole range of the newer kind of address holds one count, as every count by address does.
      const counted = countedAs(address)
      const held = (open.get(counted) ?? 0) + 1
      if (held > perAddress) {
        socket.destroy()
        return
      }
      open.set(counted, held)
      socket.once('close', () => {
        const left = (open.get(counted) ?? 1) - 1
        if (left > 0) open.set(counted, left)
        else open.delete(counted)
      })
    }
    socket.setTimeout(closeAfter)
    socket.on('timeout', () => socket.destroy())
    socket.on('error', () => socket.destroy())
  }
  const request = (request: WebAsking, answer: WebAnswer, secure: boolean): void => {
    const host = hostOf(request)
    const scheme = secure ? 'https' : 'http'
    const from = plainAddress(request.socket.remoteAddress ?? '')
    const work = async (): Promise<void> => {
      const headers = headersOf(request)
      // The size of a body is asked with the headers, as the answer is: a proxy may write the name of the app there.
      // The size of a body is that of its address: an upload may hold more than a call.
      const asked = { method: request.method ?? 'GET', path: request.url ?? '/' }
      const size = o.bodySize(host, from, headers, asked)
      const tooLong = Number(request.headers['content-length'] ?? 0) > size
      if (!tooLong && o.streamed(asked)) {
        // A body that is handed on may take as long as it keeps arriving at the speed: a slower sender is closed.
        request.setTimeout(bodyCloseAfter)
        const arriving = streamedBody(request, bodySpeed)
        // A body that is a stream is sent one way, which a request must be told.
        const how: RequestInit & { duplex: 'half' } = {
          method: request.method ?? 'POST',
          headers,
          body: arriving,
          duplex: 'half',
        }
        const streamed = new Request(`${scheme}://${host}${request.url ?? '/'}`, how)
        // An answer that did not wait for the whole body closes the connection, so that the rest is not read.
        const said = await o.answer(streamed, from)
        return send(said, request, answer, { close: !request.complete, ...sending(secure) })
      }
      const body = tooLong
        ? 'too large'
        : await readBody(request, { size, speed: bodySpeed, closeAfter: bodyCloseAfter })
      // What is left of a body that is too large is not read: the connection is closed once it is answered.
      if (body === 'too large')
        return send(o.tooLarge(host, from, headers, asked), request, answer, { close: true, ...sending(secure) })
      const carries = request.method !== 'GET' && request.method !== 'HEAD' && body.length > 0
      // A caller that closes the connection before it is answered has left: what it asked for is told by the signal.
      const left = new AbortController()
      answer.once('close', () => {
        if (!answer.writableFinished) left.abort()
      })
      const whole = new Request(`${scheme}://${host}${request.url ?? '/'}`, {
        method: request.method ?? 'GET',
        headers,
        signal: left.signal,
        ...(carries ? { body } : {}),
      })
      await send(await o.answer(whole, from), request, answer, sending(secure))
    }
    work()
      .catch(() => {
        // A request that cannot be read, as one whose host is no host, is answered with nothing but its status.
        if (!answer.headersSent)
          answer.writeHead(
            400,
            sharesConnection(request) ? { 'content-length': '0' } : { 'content-length': '0', connection: 'close' },
          )
        answer.end()
      })
      .finally(() => {
        // A body that was handed on and given up has no connection left: one that stays waits as any other.
        if (!sharesConnection(request) && request.socket.destroyed === false) request.socket.setTimeout?.(closeAfter)
      })
  }
  /** Opens the live connection: the opening passes the door before a connection is made, and is refused with its status. */
  const live = async (asked: Request, request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
    let taking: LiveTaking
    try {
      taking = await o.live(asked, plainAddress(request.socket.remoteAddress ?? ''))
    } catch (error) {
      return refuseSocket(socket, o.refused(error))
    }
    // The hub sends its signs of life, and closes a connection that does not answer them.
    request.socket.setTimeout(0)
    try {
      const ours = await (await import('../borrowed/ws.ts')).accept(request, socket, head, taking.most)
      links.add(ours)
      const each: Link['each'] = (fn, closed) =>
        ours.each(fn, () => {
          links.delete(ours)
          closed?.()
        })
      taking.attach({ ...ours, each })
      if (closing) ours.close()
    } catch {
      taking.drop()
      socket.destroy()
    }
  }
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer, secure: boolean): void =>
    void (async (): Promise<void> => {
      if (!asksSocket(request)) return refuseSocket(socket, 400)
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      let theirs: Link
      try {
        const asked = new Request(
          `${secure ? 'https' : 'http'}://${String(request.headers.host ?? '')}${request.url ?? '/'}`,
          { headers },
        )
        const from = plainAddress(request.socket.remoteAddress ?? '')
        // A connection that a part above the engine joins elsewhere, as to the engine in a box, is passed on as it is.
        const joined = await o.joined?.(asked, from)
        if (joined) theirs = joined
        else if (new URL(asked.url).pathname === '/_t/live') return await live(asked, request, socket, head)
        else theirs = o.link(asked, from)
      } catch {
        // What refuses the opening tells nothing of why: the address is not found.
        return refuseSocket(socket, 404)
      }
      // A link sends its beats, and is closed by whoever holds it: the time a connection may send nothing is not its.
      request.socket.setTimeout(0)
      let ours: Link
      try {
        // The borrowed part for live connections is loaded when the first link opens.
        ours = await (await import('../borrowed/ws.ts')).accept(request, socket, head)
      } catch {
        theirs.close()
        socket.destroy()
        return
      }
      links.add(ours)
      ours.each(
        (frame) => theirs.send(frame),
        () => {
          links.delete(ours)
          theirs.close()
        },
      )
      theirs.each(
        (frame) => ours.send(frame),
        () => ours.close(),
      )
      // A link whose opening passed while the server closed is closed with the others.
      if (closing) ours.close()
    })()
  return {
    connection,
    request,
    upgrade,
    closeLinks() {
      closing = true
      for (const one of [...links]) one.close()
    },
  }
}
