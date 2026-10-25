import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'

const kinds: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
}

export type Files = { origin: string; serve: (folder: string) => void; close: () => Promise<void> }

/**
 * A plain server of files, as a host of a static site is: a path is its file, or the `index.html` of its folder, and
 * anything else is `404.html` with 404. It listens before it knows its folder, so that an export can name its origin.
 */
export function files(): Promise<Files> {
  let root = ''
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
    const inside = normalize(join(root, path))
    const found = [inside, join(inside, 'index.html')].find(
      (one) => one.startsWith(root) && existsSync(one) && statSync(one).isFile(),
    )
    const file = found ?? join(root, '404.html')
    response.writeHead(found ? 200 : 404, { 'content-type': kinds[extname(file)] ?? 'application/octet-stream' })
    response.end(existsSync(file) ? readFileSync(file) : '')
  })
  return new Promise((done, failed) => {
    server.listen(0, '127.0.0.1', () => {
      const address: AddressInfo | string | null = server.address()
      if (!address || typeof address === 'string') return failed(new Error('the server of files has no port'))
      done({
        origin: `http://127.0.0.1:${address.port}`,
        serve: (folder) => {
          root = normalize(folder)
        },
        close: () => new Promise((closed) => server.close(() => closed())),
      })
    })
  })
}
