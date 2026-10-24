import type { Address } from '../door/address.ts'
import { registers } from '../grants/clients.ts'
import { signInDocument } from '../grants/described.ts'
import { countedHere, programsAt, standardJson } from '../grants/door.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `GET /.well-known/oauth-authorization-server`: tells a client the addresses of sign-in for programs and what
 * the engine takes. It passes steps 1 and 2 of the door and is counted like a request for a screen.
 */
export const address: Address = {
  order: 2,
  match: (request) =>
    request.method === 'GET' &&
    programsAt(request, '/.well-known/oauth-authorization-server') && { name: 'oauth-authorization-server' },
  steps: [1, 2],
  async handle({ app, about }) {
    try {
      countedHere(app, about.from)
    } catch (error) {
      return errorAnswer(app, 'oauth-authorization-server', error)
    }
    return standardJson(200, signInDocument(app.description, about.origin, registers(app)))
  },
}
