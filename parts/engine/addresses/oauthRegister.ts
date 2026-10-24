import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { countedFor } from '../door/rate.ts'
import { fairReturns, registeredId, registers } from '../grants/clients.ts'
import { programsAt, refusedAs, standardJson } from '../grants/door.ts'
import { limitOf, storedLimit } from '../limits.ts'
import { visit } from '../visit.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { countedAs } from '../web/names.ts'
import { errorAnswer } from '../wire.ts'

/**
 * `POST /_t/oauth/register`: where a client registers itself, in a project whose `mcp.clients` holds
 * `anyone(...)`, and is found in no other. It takes a name and return addresses held to the rule of a return, and
 * answers an id that is itself the name, the return addresses and the time, sealed with the key of the secrets: so
 * nothing is kept. One address registers `registerPerMinute` clients a minute. It passes steps 1, 2 and 4 of the door.
 */
export const address: Address = {
  order: 2,
  match(request) {
    const o = visit()?.app
    return (
      request.method === 'POST' &&
      programsAt(request, '/_t/oauth/register') &&
      o !== undefined &&
      registers(o) && { name: 'oauth-register' }
    )
  },
  steps: [1, 2],
  async handle({ app: o, request, about }) {
    try {
      const limit = storedLimit(o.description, 'registerPerMinute')
      if (!countedFor(o, `register:${countedAs(about.from)}`, limit))
        throw new TentError('T0005', `More than ${limit} clients registered themselves in a minute from one address.`, {
          fix: 'Register fewer clients, or raise `registerPerMinute` in `project.limits`.',
        })
      const asked = readJson(await bodyOf(request, limitOf(o.description, 'callSize')))
      const name = isStored(asked) && typeof asked.client_name === 'string' ? asked.client_name.slice(0, 200) : ''
      const redirects =
        isStored(asked) && Array.isArray(asked.redirect_uris)
          ? asked.redirect_uris.filter((one): one is string => typeof one === 'string')
          : []
      if (name === '' || !fairReturns(redirects))
        return refusedAs(
          'invalid_redirect_uri',
          'A client names itself and its return addresses, each https or of this computer.',
        )
      return standardJson(201, {
        client_id: registeredId(o, name, redirects),
        client_name: name,
        redirect_uris: redirects,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: Math.floor(o.clock.now() / 1000),
      })
    } catch (error) {
      return errorAnswer(o, 'oauth-register', error)
    }
  },
}
