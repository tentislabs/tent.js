import { AsyncLocalStorage } from 'node:async_hooks'
import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { counting } from './door.ts'
import { gather } from './gather.ts'
import { sentBytes } from './outgoing.ts'
import { addTo, spanNow } from '../trace/span.ts'

/** The call of a service that a request of the service belongs to, whose bytes it is counted under. */
interface ServiceCall {
  name: string
  caller: Caller
  // A model over a service call counts its bytes under the model, and none under the service.
  model: boolean
}

const calls = new AsyncLocalStorage<ServiceCall>()

/** Carries a call of a service out, so that the requests it sends are counted under it. */
export const asServiceCall = <Answer>(call: ServiceCall, work: () => Promise<Answer>): Promise<Answer> =>
  calls.run(call, work)

/**
 * Takes an app, what a request of a service was handed, and what sends it. Answers its answer, whose body counts
 * what is read of it, and books the bytes it sent and read under the call of the service it belongs to.
 */
export async function countedServiceFetch(
  o: Opened,
  init: unknown,
  asked: Request | string | URL,
  send: () => Promise<Response>,
): Promise<Response> {
  const call = calls.getStore()
  if (!call || call.model) return send()
  // What a request sends is read from its body, which a copy of the request gives without taking it.
  const sent =
    sentBytes(Reflect.get(Object(init), 'body')) ||
    (asked instanceof Request && asked.body ? (await asked.clone().arrayBuffer()).byteLength : 0)
  const answer = await send()
  // The span of the service call is told where its request went, how it was answered, and the bytes it sent.
  const span = spanNow()
  const traced = span?.kind === 'service' ? span : undefined
  if (traced) {
    const address = asked instanceof Request ? asked.url : String(asked)
    addTo(traced, { host: URL.canParse(address) ? new URL(address).host : undefined, status: answer.status })
    traced.facts.bytesOut = Number(traced.facts.bytesOut ?? 0) + sent
  }
  const book = (read: number): void => {
    if (traced) traced.facts.bytesIn = Number(traced.facts.bytesIn ?? 0) + read
    gather(o, call.name, { bytesOut: sent, bytesIn: read }, { caller: call.caller, definition: call.name })
  }
  if (!answer.body) {
    book(0)
    return answer
  }
  return new Response(counting(answer.body, book), {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  })
}
