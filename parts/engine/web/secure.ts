import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { Http2SecureServer, ServerHttp2Session, ServerHttp2Stream } from 'node:http2'
import { constants, createSecureServer } from 'node:http2'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import type { CertKeeper } from '../certs/keeper.ts'
import { wrongName } from '../door/web.ts'
import { jsonAnswer, wireError } from '../wire.ts'
import { bytesOf, msOf } from '../words.ts'
import type { WebAnswer, WebAsking } from './answering.ts'
import { webSide } from './answering.ts'
import type { Serves, Serving } from './server.ts'
import { closedIn, plainOptions } from './server.ts'

// The protocol that a connection of the proof inside the secure connection asks for.
const proofProtocol = 'acme-tls/1'
// The address on the plain port where an authority asks for the proof of a name.
const asked = '/.well-known/acme-challenge/'

/** What the secure side of the web is handed beside what any server is: its ports, its header, and the certificates. */
export interface SecureSide {
  port: number
  plainPort: number
  // The value of `Strict-Transport-Security`, or nothing where it is not sent.
  hsts?: string
  keeper: CertKeeper
  // Says a line in the log of the engine.
  say(level: 'info' | 'warning', message: string): void
}

/** The name of a host, without its port. */
const nameOf = (host: string): string =>
  host
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .toLowerCase()

/** Writes a standard response to a request of the plain port, which holds no body worth packing. */
async function sendPlain(response: Response, answer: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, name) => {
    headers[name] = value
  })
  const body = Buffer.from(await response.arrayBuffer())
  answer.writeHead(response.status, { ...headers, 'content-length': String(body.length) })
  answer.end(body)
}

/**
 * Answers a request of the plain port: the authority's question for a token the engine was given, before anything
 * of an app; for a listed name, 308 to its secure address; and T0017 for any other name.
 */
async function plainAnswer(request: IncomingMessage, s: SecureSide): Promise<Response> {
  const path = request.url ?? '/'
  if (request.method === 'GET' && path.startsWith(asked)) {
    const answer = s.keeper.answerFor(path.slice(asked.length))
    if (answer !== undefined) return new Response(answer, { headers: { 'content-type': 'application/octet-stream' } })
  }
  const host = String(request.headers.host ?? '')
  const name = nameOf(host)
  if (name && (await s.keeper.listed(name)))
    return new Response(null, {
      status: 308,
      headers: { location: `https://${name}${s.port === 443 ? '' : `:${s.port}`}${path.startsWith('/') ? path : '/'}` },
    })
  const { status, error } = wireError(wrongName(host), false)
  return jsonAnswer(status, { ok: false, error })
}

/**
 * Counts the requests a connection of the newer form of the web drops: one that drops more than `atOnce` within
 * a second is closed, so that a sender cannot make the engine start work it gives up at once. A request is dropped
 * when the sender resets it before it ended, whatever code it resets it with.
 */
function heldToDrops(session: ServerHttp2Session, atOnce: number): void {
  const dropped: number[] = []
  session.on('stream', (stream: ServerHttp2Stream) => {
    stream.once('close', () => {
      if (!stream.aborted || session.destroyed) return
      const now = Date.now()
      dropped.push(now)
      while (dropped.length && now - (dropped[0] ?? now) > 1000) dropped.shift()
      if (dropped.length > atOnce && !session.destroyed) {
        session.goaway(constants.NGHTTP2_ENHANCE_YOUR_CALM)
        session.destroy()
      }
    })
  })
}

/**
 * Takes what the server asks of its engine, and the secure side. Starts the web side on two ports: the secure one,
 * which speaks the older and the newer form of the web, each listed name with its certificate and every other
 * connection closed at its start; and the plain one, which answers the authority and sends a listed name on. A
 * plain port that cannot be listened on leaves the proof inside the secure connection. Answers the secure port.
 */
export async function serveSecure(o: Serving, s: SecureSide): Promise<Serves> {
  const stopTime = msOf('web.stopTime', o.web.stopTime, 10_000)
  const atOnce = o.web.atOnce ?? 100
  const side = webSide(o, s.hsts === undefined ? {} : { hsts: s.hsts })
  // The runtime asks which protocol a connection takes before it asks for the certificate of its name, and hands
  // both the connection: one that asked for the protocol of the proof is marked, and gets the proof's certificate.
  const proving = new WeakSet<TLSSocket>()
  const secure: Http2SecureServer = createSecureServer({
    allowHTTP1: true,
    settings: { maxConcurrentStreams: atOnce, maxHeaderListSize: bytesOf('web.headSize', o.web.headSize, 16 * 1024) },
    ALPNCallback(this: TLSSocket, { protocols }: { protocols: string[] }) {
      if (protocols.includes(proofProtocol)) {
        proving.add(this)
        return proofProtocol
      }
      return protocols.includes('h2') ? 'h2' : protocols.includes('http/1.1') ? 'http/1.1' : undefined
    },
    SNICallback(this: TLSSocket, name, back) {
      if (proving.has(this)) {
        const proof = s.keeper.proofFor(name)
        return proof ? back(null, proof) : back(new Error('no proof is asked for this name'))
      }
      s.keeper.contextFor(name).then(
        (context) => (context ? back(null, context) : back(new Error('no certificate is served for this name'))),
        (error: unknown) => back(error instanceof Error ? error : new Error(String(error))),
      )
    },
  })
  // The older form of the web over a secure connection is held to the same bounds as over a plain one.
  const plainBounds = plainOptions(o)
  Object.assign(secure, {
    headersTimeout: plainBounds.headersTimeout,
    requestTimeout: 0,
    keepAliveTimeout: plainBounds.keepAliveTimeout,
    maxHeaderSize: plainBounds.maxHeaderSize,
  })
  secure.maxConnections = o.web.open ?? 10_000
  // What is open is closed by the engine at its end: the server of the newer form knows no connection by itself.
  const sockets = new Set<Socket>()
  const sessions = new Set<ServerHttp2Session>()
  secure.on('connection', (socket: Socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    side.connection(socket)
  })
  secure.on('session', (session: ServerHttp2Session) => {
    sessions.add(session)
    session.once('close', () => sessions.delete(session))
    heldToDrops(session, atOnce)
  })
  secure.on('request', (request: WebAsking, answer: WebAnswer) => side.request(request, answer, true))
  secure.on('upgrade', (request: IncomingMessage, socket, head: Buffer) => side.upgrade(request, socket, head, true))
  // A connection that fails at its start, as one for a name that is served by nothing, ends there.
  secure.on('tlsClientError', () => undefined)
  // A connection of the proof carries no request of the web: once its start is over it is closed.
  secure.on('unknownProtocol', (socket) => socket.destroy())
  await new Promise<void>((done, failed) => {
    secure.once('error', failed)
    secure.listen(s.port, o.host, () => {
      secure.off('error', failed)
      done()
    })
  })
  const plain: Server = createServer(plainOptions(o), (request, answer) => {
    plainAnswer(request, s).then(
      (response) => sendPlain(response, answer),
      () => {
        answer.writeHead(400, { 'content-length': '0', connection: 'close' })
        answer.end()
      },
    )
  })
  plain.on('connection', side.connection)
  const plainListens = await new Promise<boolean>((done) => {
    plain.once('error', (error) => {
      s.say(
        'warning',
        `The plain port ${s.plainPort} could not be listened on (${error.message}): each name is proven inside the secure connection, and nothing sends a plain request on.`,
      )
      done(false)
    })
    plain.listen(s.plainPort, o.host, () => done(true))
  })
  s.keeper.started(plainListens)
  const at = secure.address()
  return {
    port: typeof at === 'object' && at ? at.port : s.port,
    async close() {
      s.keeper.close()
      side.closeLinks()
      const plainClosed = plainListens ? closedIn(plain, stopTime) : Promise.resolve()
      const secureClosed = new Promise<void>((closed) => {
        const timer = setTimeout(() => {
          for (const socket of sockets) socket.destroy()
        }, stopTime)
        secure.close(() => {
          clearTimeout(timer)
          closed()
        })
        // A connection of the newer form ends once its requests in flight are answered.
        for (const session of sessions) session.close()
      })
      await Promise.all([plainClosed, secureClosed])
    },
  }
}
