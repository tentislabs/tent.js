import type { Address } from '../door/address.ts'
import { keyed } from '../door/keyed.ts'

const prefix = '/_t/copy/blob/'

/**
 * `GET /_t/copy/blob/<fingerprint>`: the bytes of one file of a loadable version, with its length. Not found for
 * a fingerprint that no loadable version names, and for anything that is no fingerprint, as a path.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(prefix) && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(reached, 'copy/blob', async () => {
      const { blobAnswer } = await import('../copy/versionsAnswered.ts')
      return blobAnswer(reached.app, new URL(reached.request.url).pathname.slice(prefix.length))
    }),
}
