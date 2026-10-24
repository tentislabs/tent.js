import type { CallContext } from './context.ts'
import { underWay } from './context.ts'
import { heldToAddresses } from './fetch/address.ts'
import { logged } from './fetch/log.ts'
import { heldForQuery } from './fetch/query.ts'
import { heldForRead } from './fetch/reads.ts'
import { heldNet } from './rooms/hold.ts'

// The `fetch` of the runtime, as it stood before the wrap, and the wrap that stands in its place.
let real: typeof fetch | undefined
let wrap: typeof fetch | undefined

/**
 * Puts the wrap of the engine around the `fetch` of the runtime, once for the program: what backend code fetches
 * is held to what each thing of the wrap says, and is then handed to the `fetch` that stood there. A `fetch` that
 * no call of an app makes is the program's own, and is handed on as it is.
 */
export function wrapFetch(): void {
  if (wrap && globalThis.fetch === wrap) return
  const inner = globalThis.fetch
  real = inner
  wrap = (...asked) => {
    heldForQuery()
    heldForRead(asked)
    const cx = underWay()
    if (!cx) return inner(...asked)
    const held = heldNet(cx, asked)
    return held ? held.then(() => onward(cx, asked, inner)) : onward(cx, asked, inner)
  }
  globalThis.fetch = wrap
}

/** A fetch of a call that the hold let through: to the writer, from the worker, or out, as the call may. */
function onward(cx: CallContext, asked: Parameters<typeof fetch>, inner: typeof fetch): Promise<Response> {
  // Work on a worker of a kind whose `outside` names `fetch` has its writer make the call.
  const remote = cx.remote
  if (remote?.outside.fetch)
    return import('./work/outsideFetch.ts').then(({ fetchedByWriter }) => fetchedByWriter(cx.app, remote, asked))
  // Work on a worker fetches itself, and tells its writer before and after, which logs and counts it.
  const send = (held: CallContext): Promise<Response> =>
    remote
      ? import('./work/workerFetch.ts').then(({ fetchedOnWorker }) => fetchedOnWorker(held, remote, asked, inner))
      : logged(held, asked, () => heldToAddresses(held, endedWith(held, asked), inner))
  // A plain `fetch` sends, and is held to what the tool call above it may do.
  if (cx.run?.leave === 'none') return import('./fetch/leave.ts').then(({ fetchHeld }) => fetchHeld(cx, send))
  return send(cx)
}

/** What a call fetches, ended also by the signal of the call: the end of its time, or a stop of its run. */
function endedWith(cx: CallContext, asked: Parameters<typeof fetch>): Parameters<typeof fetch> {
  const [input, init] = asked
  const own = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  return [input, { ...init, signal: own ? AbortSignal.any([own, cx.signal]) : cx.signal }]
}

/** Takes the wrap away again, where it still stands: the last engine of the program does so when it closes. */
export function unwrapFetch(): void {
  if (wrap && real && globalThis.fetch === wrap) globalThis.fetch = real
  wrap = undefined
  real = undefined
}
