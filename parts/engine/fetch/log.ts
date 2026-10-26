import type { CallContext } from '../context.ts'
import { addressAsked } from './address.ts'
import { countedOutgoing, sentBytes } from '../counts/outgoing.ts'
import { noteOutside } from '../touched.ts'
import { standInOf } from '../services/standIns.ts'
import { endSpan, insideSpan, openSpan } from '../trace/span.ts'

/** The host of an address, with its port, and nothing else of it: the row holds no path, no question and no password. */
export function hostOf(address: string): string {
  try {
    return new URL(address).host
  } catch {
    return ''
  }
}

/**
 * Takes the call that a `fetch` of backend code is made in, what it was handed, and what sends it. Writes one row
 * of `outgoing` into the log of the app when it has ended: no service, the host as its call, the status where an
 * answer came, and the time. Answers what was sent.
 */
export async function logged(cx: CallContext, asked: unknown[], send: () => Promise<Response>): Promise<Response> {
  const began = cx.app.clock.now()
  // A stand-in under the name `fetch`, as the cases of `tent test --declared` stand one in, holds every plain fetch.
  const stand = standInOf(cx.app, 'fetch')
  const sending = stand ? async (): Promise<Response> => Reflect.apply(Reflect.get(stand, 'fetch'), stand, asked) : send
  // Under `tent test`, a plain fetch that leaves the program: a test that makes one is never replayed.
  if (!stand) noteOutside(`fetch ${hostOf(addressAsked(asked))}`)
  let status: number | undefined
  // A fetch of the code's own is counted under `fetch`, with what it sent and what it read.
  const counted = { began: performance.now(), sent: sentBytes(Reflect.get(Object(asked[1]), 'body')) }
  let answer: Response | undefined
  // The fetch is a span of the trace it was made in, with its host, its status and the bytes it sent.
  const span = openSpan(cx.app, {
    name: hostOf(addressAsked(asked)),
    kind: 'fetch',
    facts: { host: hostOf(addressAsked(asked)), bytesOut: counted.sent },
  })
  try {
    answer = await insideSpan(span, sending)
    status = answer.status
    if (span) span.facts.status = status
    endSpan(span)
    return countedOutgoing(cx.app, 'fetch', cx.caller, counted, answer) ?? answer
  } catch (error) {
    endSpan(span, error)
    throw error
  } finally {
    if (!answer) countedOutgoing(cx.app, 'fetch', cx.caller, counted, undefined)
    const run = cx.run?.id
    cx.app.log.write('outgoing', {
      at: cx.app.clock.now(),
      service: '',
      call: hostOf(addressAsked(asked)),
      ...(status === undefined ? {} : { status }),
      ms: cx.app.clock.now() - began,
      ...(run ? { run } : {}),
      // The row is the span of the fetch.
      ...(span ? { trace: span.trace, span: span.id, parent: span.parent ?? '' } : {}),
    })
  }
}
