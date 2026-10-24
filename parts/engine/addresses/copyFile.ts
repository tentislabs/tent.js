import type { Address } from '../door/address.ts'
import { keyed } from '../door/keyed.ts'
import { noLink } from '../noLink.ts'
import { firstRead } from './file.ts'

const prefix = '/_t/copy/file/'

/**
 * `GET /_t/copy/file/<fingerprint>`: the bytes of one file, as the `FileStore` holds them, with its length. Not found
 * for a fingerprint that no row of `_t_files` names, and for anything that is no fingerprint. A writer that is asked
 * for bytes it does not hold, as a far reader that took over is, answers not found, and its log names the file.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(prefix) && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(reached, 'copy/file', async () => {
      const { app: o, request } = reached
      const asked = new URL(request.url).pathname.slice(prefix.length)
      if (!/^[0-9a-f]{64}$/.test(asked)) throw noLink()
      const [{ fileStore }, { table }] = await Promise.all([import('../stored/files.ts'), import('../tables/files.ts')])
      const named: unknown = o.store.read(
        { from: table.name, where: { col: 'fingerprint', is: asked }, limit: 1 },
        { kind: 'system' },
      ).value
      const [row] = Array.isArray(named) ? named : []
      if (!row) throw noLink()
      // The bytes are handed on as they are read, as a download is: a file is never whole in memory.
      let bytes: ReadableStream<Uint8Array>
      try {
        bytes = await firstRead(fileStore(o).get(asked))
      } catch {
        o.log.write('lines', {
          at: o.clock.now(),
          level: 'error',
          message: 'A reader asked for the bytes of a file that this writer does not hold.',
          data: JSON.stringify({ fingerprint: asked }),
        })
        throw noLink()
      }
      return new Response(bytes, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(Number(row.size)),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      })
    }),
}
