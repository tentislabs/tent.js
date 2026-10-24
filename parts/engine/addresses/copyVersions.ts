import type { Address } from '../door/address.ts'
import { keyed } from '../door/keyed.ts'

/**
 * `GET /_t/copy/versions`: the mode of the app and the list of its loadable versions, each with its files, for a
 * reader that starts. It is asked with the key of a reader, and is not found without one.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'GET' && new URL(request.url).pathname === '/_t/copy/versions' && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(reached, 'copy/versions', async () =>
      (await import('../copy/versionsAnswered.ts')).versionsAnswer(reached.app),
    ),
}
