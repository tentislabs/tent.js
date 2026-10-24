import type { Address } from '../door/address.ts'

const prefix = '/_t/work/blob/'

/** `GET /_t/work/blob/<fingerprint>`: the bytes of one file of a loadable version, for a worker. Not found for any other fingerprint. */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname.startsWith(prefix) && {},
  steps: [1, 2, 3, 10],
  // The key check of a worker is loaded by the first request for it: an app with no workers loads none of it.
  handle: async (reached) =>
    (await import('../work/keyedWork.ts')).workKeyed(reached, 'work/blob', async () => {
      const { blobAnswer } = await import('../copy/versionsAnswered.ts')
      return blobAnswer(reached.app, new URL(reached.request.url).pathname.slice(prefix.length))
    }),
}
