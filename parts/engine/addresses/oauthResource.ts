import type { Address } from '../door/address.ts'
import { resourceDocument } from '../grants/described.ts'
import { countedHere, programsAt, standardJson } from '../grants/door.ts'
import { errorAnswer } from '../wire.ts'

const paths = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']

/**
 * `GET /.well-known/oauth-protected-resource` and `.../mcp`: tells a client that `/mcp` is guarded and by whom. The
 * 401 of `/mcp` points here. It passes steps 1 and 2 of the door and is counted like a request for a screen.
 */
export const address: Address = {
  order: 2,
  match: (request) =>
    request.method === 'GET' && paths.some((path) => programsAt(request, path)) && { name: 'oauth-protected-resource' },
  steps: [1, 2],
  async handle({ app, about }) {
    try {
      countedHere(app, about.from)
    } catch (error) {
      return errorAnswer(app, 'oauth-protected-resource', error)
    }
    return standardJson(200, resourceDocument(app.description, about.origin))
  },
}
