import { rowIds } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { addressAsked, heldToAddresses } from '../fetch/address.ts'
import { keptOfResponse, responseOfKept } from '../fetch/leave.ts'
import { hostOf } from '../fetch/log.ts'
import { mayPlace } from '../flows/workPlace.ts'
import { madeAlready } from './callPlace.ts'
import type { Remote } from './remote.ts'

/**
 * Takes the call that work on a worker fetches in, what reaches its writer, what the fetch was handed, and the
 * `fetch` of the runtime. Fetches on the worker itself, held to the address rule of the app, with a `may` to the
 * writer before it, which holds it to the person's yes where the leave of the run needs one, and a `did` after it,
 * which names the host, the status and the time, and carries what is kept of an agreed fetch: the writer writes the
 * row of `outgoing` in its log and counts the call. Answers what was fetched, or a response made of what was kept of
 * an agreed fetch that was made already.
 */
export async function fetchedOnWorker(
  cx: CallContext,
  remote: Remote,
  asked: Parameters<typeof fetch>,
  inner: typeof fetch,
): Promise<Response> {
  const address = addressAsked(asked)
  const call = hostOf(address)
  const { key, nth, agreed } = mayPlace(cx, 'fetch', address)
  const may = rowIds.next()
  const said = await remote.ask({ what: 'may', may, fetch: call, call, key, nth })
  if (madeAlready(said)) return responseOfKept(said.answer)
  const began = performance.now()
  let status: number | undefined
  let answer: unknown
  try {
    const fetched = await heldToAddresses(cx, asked, inner)
    status = fetched.status
    if (agreed) answer = await keptOfResponse(fetched)
    return fetched
  } finally {
    void remote
      .ask({
        what: 'did',
        may,
        fetch: call,
        call,
        key,
        nth,
        ok: status !== undefined,
        ...(status === undefined ? {} : { status }),
        ms: Math.round(performance.now() - began),
        ...(answer === undefined ? {} : { answer }),
      })
      .catch(() => undefined)
  }
}
