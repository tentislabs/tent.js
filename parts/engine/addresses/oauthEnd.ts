import type { Address } from '../door/address.ts'
import { countedHere, formOf, programsAt, standardJson } from '../grants/door.ts'
import { endedBy } from '../grants/issued.ts'
import { limitOf } from '../limits.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `POST /_t/oauth/end`: ends the grant of the renewal token it is handed, in the field `token` of a form. It is
 * what `logout` calls. Whether a grant was ended is told to nobody: the answer is the same either way.
 */
export const address: Address = {
  order: 2,
  match: (request) => request.method === 'POST' && programsAt(request, '/_t/oauth/end') && { name: 'oauth-end' },
  steps: [1, 2],
  async handle({ app: o, request, about }) {
    try {
      countedHere(o, about.from)
      endedBy(o, (await formOf(request, limitOf(o.description, 'callSize'))).get('token') ?? '')
      return standardJson(200, {})
    } catch (error) {
      return errorAnswer(o, 'oauth-end', error)
    }
  },
}
