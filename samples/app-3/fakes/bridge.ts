import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer } from 'ws'
import type { App } from './fakes'

/** An address of this computer that hands every request to a test app, its live connection among them. */
export type Bridge = { address: string; close: () => Promise<void> }

async function bodyOf(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const parts: Buffer[] = []
  for await (const part of request) parts.push(Buffer.from(part))
  return Buffer.concat(parts)
}

function headersOf(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const one of value) headers.append(name, one)
    else if (value !== undefined) headers.set(name, value)
  }
  return headers
}

/**
 * Opens a port of this computer for a browser that a test drives itself: a test app answers on no port, and
 * `app.request` and `app.live` take each request with no network.
 */
export async function bridge(app: App): Promise<Bridge> {
  let origin = ''
  const server = createServer((request, response) => {
    void (async () => {
      const body = await bodyOf(request)
      const answer = await app.request(
        new Request(origin + (request.url ?? '/'), {
          method: request.method,
          headers: headersOf(request),
          body: body && body.length > 0 ? new Uint8Array(body) : undefined,
        }),
        { from: '127.0.0.1' },
      )
      const headers: Record<string, string | string[]> = {}
      answer.headers.forEach((value, name) => {
        if (name !== 'set-cookie') headers[name] = value
      })
      const cookies = answer.headers.getSetCookie()
      if (cookies.length > 0) headers['set-cookie'] = cookies
      response.writeHead(answer.status, headers)
      response.end(Buffer.from(await answer.arrayBuffer()))
    })().catch((error: unknown) => {
      response.writeHead(500)
      response.end(String(error))
    })
  })
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    let live: ReturnType<App['live']>
    try {
      live = app.live(new Request(origin + (request.url ?? '/'), { headers: headersOf(request) }))
    } catch {
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, (open) => {
      live.each(
        (message) => open.send(JSON.stringify(message)),
        () => open.close(),
      )
      open.on('message', (data) => live.send(JSON.parse(String(data))))
      open.on('close', () => live.close())
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const where = server.address()
  origin = `http://localhost:${typeof where === 'object' && where ? where.port : 0}`
  return {
    address: origin,
    close: () =>
      new Promise((done) => {
        // A live connection outlives `closeAllConnections`, and the server closes only once none is left.
        for (const open of sockets.clients) open.terminate()
        sockets.close()
        server.closeAllConnections()
        server.close(() => done())
      }),
  }
}
