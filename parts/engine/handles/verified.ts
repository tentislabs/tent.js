import { TentError } from '../../core/index.ts'
import { callOf } from '../handleCall.ts'
import { incomingBytes } from '../incoming/kept.ts'
import { seenBefore } from '../incoming/seen.ts'
import { verifyCall } from '../incoming/verify.ts'
import type { Opened } from '../opened.ts'
import { isStored } from '../../core/internal.ts'

/** What a signature that code hands is checked by: the `signature` of a service, or a scheme with its secret. */
function verifyOf(signature: unknown): unknown {
  const name: unknown = Reflect.get(Object(signature), 'definition')
  if (typeof name === 'string' && name.endsWith('.signature')) return { service: name.slice(0, -'.signature'.length) }
  return signature
}

/**
 * The working object behind the handle `verified`: `check(request, signature, { once })` checks the signature of
 * the request of a route over the exact bytes that arrived, also after the route read the body, and answers
 * `{ id, body }`. With `once` it notes the id as a call coming in does, and answers `seen: true` for a repeat.
 * Throws T7118 for a signature that does not hold, and T0013 in a route whose file does not import `verified`.
 */
export const handle = (o: Opened): object => ({
  async check(
    request: unknown,
    signature: unknown,
    how?: unknown,
  ): Promise<{ id?: string; body: Uint8Array; seen?: true }> {
    const cx = callOf('`verified`', { waits: true })
    const body = request instanceof Request ? incomingBytes(request) : undefined
    if (!body || !(request instanceof Request))
      throw new TentError(
        'T0013',
        '`verified` checks the request of a route whose file imports it, and this is none.',
        {
          fix: 'Hand `verified` the request that the route was handed, in a file that imports `verified` from tentjs.',
        },
      )
    const { id } = await verifyCall(o, verifyOf(signature), request.headers, body)
    const once = isStored(how) && how.once === true
    if (once && id !== undefined) {
      const seen = o.store.write((tx) => seenBefore(tx, o, cx.work.name, id)).value
      if (seen) return { id, body, seen: true }
    }
    return { ...(id === undefined ? {} : { id }), body }
  },
})
