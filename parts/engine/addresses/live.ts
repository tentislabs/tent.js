import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `/_t/live`: the live connection. It is opened as a WebSocket, which the web side of the engine hands to the
 * app, and by `app.live` with no network. A plain request for it is not found.
 */
export const address: Address = {
  order: 1,
  match: (request) => new URL(request.url).pathname === '/_t/live' && {},
  steps: [1],
  handle: async ({ app }) =>
    errorAnswer(
      app,
      '/_t/live',
      new TentError('T0001', 'The live connection is opened as a WebSocket, and this request asks for none.', {
        fix: 'Open `/_t/live` as a WebSocket, from a page of the app.',
      }),
    ),
}
