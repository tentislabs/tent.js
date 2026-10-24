import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { called } from '../door/call.ts'
import { drawnFor } from '../door/drawnFor.ts'
import { refusedCall } from '../door/failure.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { versionGone } from '../versions.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { errorAnswer, okAnswer } from '../wire.ts'
import { namedFor } from '../gradual/served.ts'
import { isLiveMember } from '../ai/members.ts'
import { nameAfter } from '../web/decoded.ts'
import { isWritten } from '../../core/internal.ts'

const prefix = '/_t/read/'

/**
 * `POST /_t/read/<name>`: a read from a page, with the body and the answer of a call. Whatever a page asks again
 * goes here: an entry of `data` whose input changed, one that the page did not wait for, and a `useQuery`. It
 * passes the ten steps of the door, and takes a query, the member `working` of an agent, of a flow or of an
 * action, or an action, and nothing else.
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
    let input: unknown
    let reads = false
    let served: Opened
    try {
      const body = readJson(await bodyOf(request, limitOf(app.description, 'callSize')))
      if (!isWritten(body))
        throw new TentError('T0002', 'The body of a read is one record: { "input": { ... } }.', {
          fields: { '': 'type' },
        })
      drawnFor(caller, body.as)
      // A page names the version it was built from, and is served by it while it can be loaded: one that cannot
      // is told the running one.
      const version = namedFor(app, caller, body.version)
      if (!version) throw versionGone(body.version)
      served = version
      const functions = served.description.functions
      const kind = Object.hasOwn(functions, name) ? functions[name].kind : undefined
      if (kind !== 'query' && kind !== 'action' && !isLiveMember(served, name)) throw notRead(name)
      input = body.input
      reads = kind === 'action'
    } catch (error) {
      refusedCall(app, name, caller, began, error)
      return errorAnswer(app, name, error)
    }
    try {
      // An action is called read-only here, as in a draw.
      const asked = {
        caller,
        about: { from: about.from, origin: about.origin },
        ...(reads ? { reads: true as const } : {}),
      }
      return okAnswer(await called(served, name, input, asked))
    } catch (error) {
      return errorAnswer(app, name, error)
    }
  },
}

const notRead = (name: string): TentError =>
  new TentError(
    'T0001',
    `No query, no action and no member working named ${JSON.stringify(name).slice(0, 80)} can be read.`,
    {
      fix: 'A page reads a query, an action or the member working of an agent or a run. A change is called at `/_t/call/<name>`.',
    },
  )
