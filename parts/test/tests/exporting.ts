import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import { after } from 'node:test'

// Each host of files that a test started is closed when the file ends, also where a test failed.
const hosts: (() => Promise<void>)[] = []
after(async () => {
  for (const close of hosts) await close()
})

/** The kind of a file by its ending, as a plain server of files names it. */
const kinds: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/** The file of the folder that a path names, as a host of files finds it: a folder by its `index.html`. */
function fileAt(folder: string, path: string): string | undefined {
  const inside = normalize(join(folder, decodeURIComponent(path)))
  if (inside !== folder && !inside.startsWith(folder + sep)) return undefined
  for (const one of [inside, join(inside, 'index.html')]) if (existsSync(one) && statSync(one).isFile()) return one
  return undefined
}

/** Hands a request on to the engine at a port, with the base taken off and its own name as the host. */
function handedOn(asked: IncomingMessage, answer: ServerResponse, port: number, path: string): void {
  const headers = { ...asked.headers, host: `localhost:${port}` }
  if (headers.origin) headers.origin = `http://localhost:${port}`
  const on = request({ host: '127.0.0.1', port, path, method: asked.method, headers }, (back) => {
    answer.writeHead(back.statusCode ?? 502, back.headers)
    back.pipe(answer)
  })
  on.on('error', () => answer.destroy())
  asked.pipe(on)
}

/**
 * Takes the folder of an export, the base it was made for, and the port of an engine behind the same address, if
 * any. Serves the folder as a plain host of files does, on a port of this computer: a path under the base is the
 * file it names. With no engine an unknown address is answered with a page of the host's own and the status 200;
 * with one, it is handed on to the engine without the base, the live connection too. Answers the address.
 */
export async function hostOf(folder: string, base: string, engine?: number): Promise<string> {
  // The live connections that were handed on, which closing the server does not end.
  const held = new Set<{ destroy(): void }>()
  const server = createServer((asked, answer) => {
    const url = new URL(asked.url ?? '/', 'http://localhost')
    const path = url.pathname.startsWith(`${base}/`) || url.pathname === base ? url.pathname.slice(base.length) : ''
    const file = asked.method === 'GET' && path !== '' ? fileAt(folder, path) : undefined
    if (file) {
      answer.writeHead(200, { 'content-type': kinds[extname(file)] ?? 'application/octet-stream' })
      answer.end(readFileSync(file))
      return
    }
    if (engine !== undefined && path !== '') return handedOn(asked, answer, engine, `${path || '/'}${url.search}`)
    answer.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    answer.end('<!doctype html><html><body><p>A page of the host of files.</p></body></html>')
  })
  // The live connection is handed on as it stands: its first lines with the base taken off, then every byte.
  server.on('upgrade', (asked, socket, head) => {
    const url = new URL(asked.url ?? '/', 'http://localhost')
    if (engine === undefined || !url.pathname.startsWith(`${base}/`)) return socket.destroy()
    const inner = connect(engine, '127.0.0.1', () => {
      held.add(inner)
      held.add(socket)
      const lines = [`${asked.method} ${url.pathname.slice(base.length)}${url.search} HTTP/1.1`]
      for (let at = 0; at < asked.rawHeaders.length; at += 2) {
        const name = asked.rawHeaders[at]
        const value = name.toLowerCase() === 'host' || name.toLowerCase() === 'origin' ? null : asked.rawHeaders[at + 1]
        if (value !== null) lines.push(`${name}: ${value}`)
      }
      lines.push(`Host: localhost:${engine}`, `Origin: http://localhost:${engine}`)
      inner.write(`${lines.join('\r\n')}\r\n\r\n`)
      inner.write(head)
      inner.pipe(socket)
      socket.pipe(inner)
    })
    inner.on('error', () => socket.destroy())
    socket.on('error', () => inner.destroy())
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const where = server.address()
  const port = typeof where === 'object' && where !== null ? where.port : 0
  hosts.push(
    () =>
      new Promise((done) => {
        for (const one of held) one.destroy()
        server.closeAllConnections()
        server.close(() => done())
      }),
  )
  return `http://localhost:${port}`
}
