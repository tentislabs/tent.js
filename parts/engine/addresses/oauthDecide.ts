import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { backTo, sentBack } from '../grants/back.ts'
import { newCode } from '../grants/codes.ts'
import { countedHere, formOf, personOf, programsAt } from '../grants/door.ts'
import { lives } from '../grants/shown.ts'
import { limitOf } from '../limits.ts'
import { readText, spendOnce } from '../mcp/texts.ts'
import { errorAnswer, okAnswer } from '../wire.ts'

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** The refusal of an answer that grants nothing: a text that does not hold, for this person, once. */
const nothingGranted = (): TentError =>
  new TentError('T0002', 'This answer grants nothing: it was sent by another person, a second time, or too late.', {
    fix: 'Sign in from the program again, and answer on the page it opens.',
  })

/**
 * `POST /_t/oauth/decide`: the person's yes or no, from the engine's page and from a screen of the builder's alike,
 * with the engine's own text, which holds this person and this request, works once and for `askTime`. A yes sends
 * the person back with a code, and a no with the standard's refusal. A `GET` is 405: a look grants nothing. The
 * page code asks for the address as JSON, and loads it whole itself.
 */
export const address: Address = {
  order: 2,
  match: (request) => programsAt(request, '/_t/oauth/decide') && { name: 'oauth-decide' },
  steps: [1, 2, 3],
  async handle({ app: o, request, caller, about }) {
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } })
    try {
      countedHere(o, about.from)
      const form = await formOf(request, limitOf(o.description, 'callSize'))
      const text = form.get('t') ?? ''
      const held = readText(o, 'decide', text, lives(o).decide)
      const person = personOf(caller)
      if (!held || person === undefined || held.user !== person || !spendOnce(o, text, lives(o).decide))
        throw nothingGranted()
      const redirect = String(held.redirect)
      const state = String(held.state)
      const to =
        form.get('answer') === 'allow'
          ? backTo(
              redirect,
              {
                code: newCode(o, {
                  user: person,
                  client: String(held.client),
                  name: String(held.name),
                  redirect,
                  challenge: String(held.challenge),
                  scopes: textsOf(held.scopes),
                  resource: String(held.resource),
                  for: held.for === 'app' ? 'app' : 'mcp',
                }),
                state,
              },
              about.origin,
            )
          : backTo(redirect, { error: 'access_denied', state }, about.origin)
      return (request.headers.get('accept') ?? '').includes('application/json') ? okAnswer({ to }) : sentBack(to)
    } catch (error) {
      return errorAnswer(o, 'oauth-decide', error)
    }
  },
}
