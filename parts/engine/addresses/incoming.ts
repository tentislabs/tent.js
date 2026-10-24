import { TentError } from '../../core/index.ts'
import { bounded } from '../bounded.ts'
import type { Address } from '../door/address.ts'
import { logCall } from '../door/failure.ts'
import { countedFor } from '../door/rate.ts'
import type { IncomingFound } from '../incoming/found.ts'
import { incomingAt, incomingSize } from '../incoming/found.ts'
import { seenBefore } from '../incoming/seen.ts'
import { schemeOf, verifyCall } from '../incoming/verify.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { connectNow } from '../services/loaded.ts'
import { visit } from '../visit.ts'
import { countedAs } from '../web/names.ts'
import { errorAnswer, jsonAnswer } from '../wire.ts'
import { countAnswered, countAnswering } from '../counts/screens.ts'

const isFound = (matched: object): matched is IncomingFound =>
  typeof Reflect.get(matched, 'name') === 'string' && typeof Reflect.get(matched, 'record') === 'object'

const nobody = { kind: 'nobody' } as const

/** What the body of a call reads as for its flow: JSON where it says so and reads so, and the text otherwise. */
function bodyOf(request: Request, bytes: Uint8Array): unknown {
  const text = new TextDecoder().decode(bytes)
  const kind = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!/^application\/([\w.+-]+\+)?json$/.test(kind)) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The headers that a flow is handed: every one by its name in small letters, but the sign-in, the cookies and the signature. */
function headersOf(request: Request, signature: string | undefined): Record<string, string> {
  const left = ['authorization', 'cookie', ...(signature ? [signature] : [])]
  const headers: Record<string, string> = {}
  for (const [name, value] of request.headers) if (!left.includes(name)) headers[name] = value
  return headers
}

/** Counts one call coming in for its address: `limits.incomingPerMinute`. Throws T0005 for one more. */
function countedIn(o: Opened, from: string): void {
  const limit = storedLimit(o.description, 'incomingPerMinute')
  if (!countedFor(o, `incoming:${countedAs(from)}`, limit))
    throw new TentError('T0005', `More than ${limit} calls coming in reached the app in a minute from ${from}.`, {
      fix: 'Send fewer calls, or raise `limits.incomingPerMinute` in the project.',
    })
}

/**
 * A call coming in: a `POST` of the path of an `incoming`. It passes steps 1, 2, 4 and 10 of the door, with a size
 * of its own and a count of its own for its address, and then the signature in place of a caller: checked over the
 * exact bytes that arrived, before anything of them is read. In one write the id of the call is noted and the run
 * of its flow is added, which the system starts; a repeat adds nothing, and both are answered 200 at once.
 */
export const address: Address = {
  order: 3,
  match(request) {
    const o = visit()?.app
    return (o && incomingAt(o, request.method, new URL(request.url).pathname)) ?? false
  },
  steps: [1, 2, 10],
  own: (o, matched) => (isFound(matched) ? { size: incomingSize(o, matched.record), sites: [] } : undefined),
  async handle({ app: o, request, matched, about, began }) {
    if (!isFound(matched)) return errorAnswer(o, 'incoming', new TentError('T0001', 'No call coming in is here.'))
    const { name, record, params } = matched
    countAnswering(name, nobody)
    try {
      countedIn(o, about.from)
      const bytes = new Uint8Array(await bounded(request, incomingSize(o, record)).arrayBuffer())
      const verified = record.verify === undefined ? {} : await verifyCall(o, record.verify, request.headers, bytes)
      const scheme = schemeOf(o, record.verify)?.scheme
      const signature = scheme === undefined ? undefined : connectNow().signatureHeader(scheme)
      const url = new URL(request.url)
      const event = {
        kind: 'incoming',
        ...(verified.id === undefined ? {} : { id: verified.id }),
        headers: headersOf(request, signature),
        body: bodyOf(request, bytes),
        params,
        query: Object.fromEntries(url.searchParams),
      }
      const flow = typeof record.then === 'string' ? record.then : undefined
      const runner = o.flows?.runner
      o.store.write((tx) => {
        if (verified.id !== undefined && seenBefore(tx, o, name, verified.id)) return
        if (flow && runner) runner.add({ flow, version: o.version, event, startedBy: { kind: 'system' } }, tx)
      })
      logCall(o, { name, caller: nobody, began })
      countAnswered(o, name, nobody, began)
      return jsonAnswer(200, { ok: true })
    } catch (error) {
      logCall(o, { name, caller: nobody, began, error })
      countAnswered(o, name, nobody, began, error)
      return errorAnswer(o, name, error)
    }
  },
}
