import { noLink } from '../noLink.ts'
import type { Address } from '../door/address.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `/_t/copy`: the link of a reader. It is opened as a WebSocket, which the web side of the engine hands to the
 * app, and by `app.link` with no network. A plain request for it is not found.
 */
export const address: Address = {
  order: 1,
  match: (request) => new URL(request.url).pathname === '/_t/copy' && {},
  steps: [1, 2, 3, 10],
  handle: async ({ app }) => errorAnswer(app, 'copy', noLink()),
}
