import type { Address } from '../door/address.ts'

/** `GET /_t/work/versions`: the mode of the app and its loadable versions, each with its files, for a worker. */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname === '/_t/work/versions' && {},
  steps: [1, 2, 3, 10],
  // The key check of a worker is loaded by the first request for it: an app with no workers loads none of it.
  handle: async (reached) =>
    (await import('../work/keyedWork.ts')).workKeyed(reached, 'work/versions', async () =>
      (await import('../copy/versionsAnswered.ts')).versionsAnswer(reached.app),
    ),
}
