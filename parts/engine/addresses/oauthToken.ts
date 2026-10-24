import { challengeOf } from '../../core/internal.ts'
import type { Address } from '../door/address.ts'
import { countedFor } from '../door/rate.ts'
import { codeAt, codeUsed } from '../grants/codes.ts'
import { countedHere, formOf, programsAt, refusedAs, standardJson } from '../grants/door.ts'
import { grantEnded, grantMade, renewal } from '../grants/issued.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { errorAnswer } from '../wire.ts'

/** Counts one request of the token address on `callerPerMinute` for its client: a code for the one it was given to. */
function countedAs(o: Opened, key: string): Response | undefined {
  if (countedFor(o, key, limitOf(o.description, 'callerPerMinute'))) return undefined
  return refusedAs('slow_down', 'Too many requests of the token address in a minute.', 429)
}

/** Changes a code for the first pair of tokens: once, within its minute, for this client, this proof and this return. */
function changed(o: Opened, form: URLSearchParams): Response {
  const code = form.get('code') ?? ''
  const client = form.get('client_id') ?? ''
  const held = codeAt(o, code)
  if (!held) return refusedAs('invalid_grant', 'The code is not one that this app gave.')
  const counted = countedAs(o, `oauthClient:${held.allowed.client}`)
  if (counted) return counted
  if (!held.fresh) {
    // A code that is used a second time ends the grant that its first use made.
    if (held.grant) grantEnded(o, held.grant)
    return refusedAs('invalid_grant', 'The code was used before, or its minute is over.')
  }
  const { allowed } = held
  const proof = challengeOf(form.get('code_verifier') ?? '')
  if (client !== allowed.client || form.get('redirect_uri') !== allowed.redirect || proof !== allowed.challenge) {
    codeUsed(o, code)
    return refusedAs('invalid_grant', 'The code was given to another client, return address or proof.')
  }
  const made = grantMade(o, allowed)
  codeUsed(o, code, made.id)
  return standardJson(200, made.pair)
}

/**
 * `POST /_t/oauth/token`: where a client changes a code for tokens, and renews them, with a form as the standard
 * writes it. A client proves itself by the proof of the standard alone, and no secret. A refusal is the standard's
 * form of one. It passes steps 1, 2 and 4 of the door: counted for its address like a request for a screen, and
 * for its client.
 */
export const address: Address = {
  order: 2,
  match: (request) => request.method === 'POST' && programsAt(request, '/_t/oauth/token') && { name: 'oauth-token' },
  steps: [1, 2],
  async handle({ app: o, request, about }) {
    let form: URLSearchParams
    try {
      countedHere(o, about.from)
      form = await formOf(request, limitOf(o.description, 'callSize'))
    } catch (error) {
      return errorAnswer(o, 'oauth-token', error)
    }
    const kind = form.get('grant_type')
    if (kind === 'authorization_code') return changed(o, form)
    if (kind !== 'refresh_token')
      return refusedAs('unsupported_grant_type', 'A code or a renewal token is changed here.')
    const written = form.get('refresh_token') ?? ''
    const client = form.get('client_id') ?? ''
    const counted = countedAs(o, `oauthClient:${client}`)
    if (counted) return counted
    const pair = renewal(o, written, client)
    return pair ? standardJson(200, pair) : refusedAs('invalid_grant', 'The renewal token does not hold.')
  },
}
