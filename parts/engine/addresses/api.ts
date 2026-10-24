import { TentError } from '../../core/index.ts'
import type { Offered } from '../../core/internal.ts'
import { apiNameOf, offeredToApi } from '../../core/internal.ts'
import { bodyInput, queryInput } from '../api/input.ts'
import { problemAnswer, valueAnswer } from '../api/problem.ts'
import type { Address } from '../door/address.ts'
import { called } from '../door/call.ts'
import { refusedCall } from '../door/failure.ts'
import { ownOrListed } from '../door/web.ts'
import { asksNobody } from '../keys/caller.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { callIdOf } from '../door/callIds.ts'
import { visit } from '../visit.ts'
import { nameAfter } from '../web/decoded.ts'
import { routeAt } from '../routes.ts'

const prefix = '/api/'

// The two addresses of the description of the API, which are none of a function.
const described = ['openapi.json', 'docs']

/** The offered function that a name of the API reaches: by its own name, or by the one `api.names` gives it. */
function offeredAt(o: Opened, name: string): Offered | undefined {
  return offeredToApi(o.description).find((one) => apiNameOf(o.description, one.name) === name)
}

/** What a name that reaches nothing is answered, the same for a function that is not offered and one that is not there. */
const notFound = (): TentError =>
  new TentError('T0001', 'Nothing at the API answers this address and method.', {
    fix: 'A function that states `offer: ["api"]` is reached at `/api/<name>`; `/api/openapi.json` lists them.',
  })

/** The day a function goes away, as a date of the web, for a function that states `deprecated`. */
function sunsetOf(record: Record<string, unknown>): Record<string, string> {
  if (typeof record.deprecated !== 'string') return {}
  const day = new Date(`${record.deprecated}T00:00:00Z`)
  return Number.isNaN(day.getTime()) ? {} : { sunset: day.toUTCString() }
}

/**
 * `GET` and `POST` of `/api/<name>`: a function, a flow or an agent that states `offer: ['api']`. It passes
 * all ten steps of the door, and every failure is answered in the standard form of a problem. A query takes both
 * methods, and every other kind `POST` alone. A request whose `Origin` is neither the app's own nor listed in
 * `api.origins` is T0004, a read too. Every caller is asked a person for a function that states `danger: 'ask'`,
 * but a key that states `asks: 'none'`.
 */
export const address: Address = {
  order: 2,
  match(request) {
    const { pathname } = new URL(request.url)
    // An app that offers nothing to the API has none, and a route under `/api/` is tried before it.
    const o = visit()?.app
    if (!pathname.startsWith(prefix) || !o || !offeredToApi(o.description).length) return false
    if (routeAt(o, request.method, pathname)) return false
    const name = nameAfter(pathname, prefix)
    return !described.includes(name) && { name: `api:${name}` }
  },
  steps: [1, 2, 3, 4, 10],
  refused: problemAnswer,
  async handle({ app: o, request, caller, about, began }) {
    const name = nameAfter(new URL(request.url).pathname, prefix)
    let offered: Offered | undefined
    let input: unknown
    try {
      const origin = request.headers.get('origin')
      if (origin !== null && !ownOrListed(o, origin, about))
        throw new TentError('T0004', `The request came from ${JSON.stringify(origin).slice(0, 80)}, another site.`, {
          fix: 'List the site in `api.origins` of the project.',
        })
      offered = offeredAt(o, name)
      const method = request.method
      if (!offered || (method !== 'GET' && method !== 'POST') || (method === 'GET' && !offered.query)) throw notFound()
      input =
        method === 'GET'
          ? queryInput(offered.record.input, new URL(request.url).searchParams)
          : await bodyInput(request, limitOf(o.description, 'callSize'))
    } catch (error) {
      refusedCall(o, offered?.name ?? name, caller, began, error)
      return problemAnswer(o, offered?.name ?? name, error)
    }
    const agreed = request.headers.get('tent-agreed') ?? undefined
    const asks = asksNobody(o, caller) ? {} : { asks: agreed === undefined ? {} : { agreed } }
    try {
      const callId = callIdOf(request.headers.get('idempotency-key'))
      const value = await called(o, offered.name, input, {
        caller,
        left: request.signal,
        waits: true,
        ...asks,
        ...(callId ? { callId } : {}),
      })
      return valueAnswer(value, sunsetOf(offered.record))
    } catch (error) {
      return problemAnswer(o, offered.name, error)
    }
  },
}
