import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { called } from '../door/call.ts'
import { drawnFor } from '../door/drawnFor.ts'
import { refusedCall } from '../door/failure.ts'
import { sameOrigin } from '../door/web.ts'
import { asksNobody } from '../keys/caller.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { versionGone } from '../versions.ts'
import { namedFor } from '../gradual/served.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { callIdOf } from '../door/callIds.ts'
import { errorAnswer, okAnswer } from '../wire.ts'
import { nameAfter } from '../web/decoded.ts'
import { isWritten } from '../../core/internal.ts'

const prefix = '/_t/call/'

// The fields that the body of a call may hold.
const fields = ['input', 'version', 'as']

/** Reads the body of a call: one JSON record of `input`, `version` and `as`, within the size of a call. */
async function readCall(request: Request, callSize: number): Promise<Record<string, unknown>> {
  const body = readJson(await bodyOf(request, callSize))
  if (!isWritten(body))
    throw new TentError('T0002', 'The body of a call is one record: { "input": { ... } }.', { fields: { '': 'type' } })
  const unknown = Object.keys(body).filter((name) => !fields.includes(name))
  if (unknown.length)
    throw new TentError(
      'T0002',
      `The body of a call holds \`${unknown[0].slice(0, 40)}\`, which is none of its fields.`,
      {
        fields: Object.fromEntries(unknown.map((name) => [name, 'unknown'])),
        fix: 'The body of a call holds `input`, and `version` and `as` where a page sends them.',
      },
    )
  return body
}

/**
 * `POST /_t/call/<name>`: a call from a page or from a program. A call is a `POST` whose body is JSON, stated as
 * `Content-Type: application/json`: any other method or type is no call. It passes all ten steps of the door.
 */
export const address: Address = {
  order: 1,
  match(request) {
    const { pathname } = new URL(request.url)
    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    return (
      request.method === 'POST' &&
      type === 'application/json' &&
      pathname.startsWith(prefix) && { name: nameAfter(pathname, prefix) }
    )
  },
  steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  async handle({ app, request, caller, about, began }) {
    const name = nameAfter(new URL(request.url).pathname, prefix)
    let body: Record<string, unknown>
    let served: Opened
    try {
      body = await readCall(request, limitOf(app.description, 'callSize'))
      drawnFor(caller, body.as)
      // A page names the version it was built from, and is served by it while it can be loaded: one that cannot
      // is told to follow the running one.
      // While a release goes, a call is served by the version its caller is given: what it names picks nothing.
      const version = namedFor(app, caller, body.version)
      if (!version) throw versionGone(body.version)
      served = version
    } catch (error) {
      refusedCall(app, name, caller, began, error)
      return errorAnswer(app, name, error)
    }
    // A program is asked a person for a function that states `danger: 'ask'`: a key, and any caller of a request
    // that carries no `Origin` of the app, which a page always sends with a `POST`.
    const origin = request.headers.get('origin')
    const program = caller.kind === 'key' || origin === null || !sameOrigin(origin, about.origin)
    const agreed = request.headers.get('tent-agreed') ?? undefined
    const asks = program && !asksNobody(app, caller) ? { asks: agreed === undefined ? {} : { agreed } } : {}
    try {
      const callId = callIdOf(request.headers.get('idempotency-key'))
      const asked = {
        caller,
        left: request.signal,
        about: { from: about.from, origin: about.origin },
        ...asks,
        ...(callId ? { callId } : {}),
      }
      return okAnswer(await called(served, name, body.input, asked))
    } catch (error) {
      return errorAnswer(app, name, error)
    }
  },
}
