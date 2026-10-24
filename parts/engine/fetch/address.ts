import type { Description } from '../../core/internal.ts'
import type { CallContext } from '../context.ts'

/** The hosts and addresses that `privateHosts` of a project lists, which the address rule lets the app reach. */
export function privateHostsOf(description: Description): string[] {
  const listed: unknown = Reflect.get(Object(description.project), 'privateHosts')
  return Array.isArray(listed) ? listed.map(String) : []
}

/** The address that a `fetch` was asked for, as it was handed: a text, an address, or a request. */
export function addressAsked(asked: unknown[]): string {
  const [what] = asked
  if (what instanceof Request) return what.url
  return String(what)
}

/**
 * Takes the call that a `fetch` of backend code is made in, what it was handed, and the `fetch` of the runtime.
 * Sends it through the guarded fetch in its plain form, held to the address rule of the app: a private or a local
 * address is refused (T0022), straight and through a redirect, unless `privateHosts` lists it, and no cap holds.
 * An address that opens no connection, `data:` and `blob:`, is the runtime's own to answer.
 */
export async function heldToAddresses(
  cx: CallContext,
  asked: Parameters<typeof fetch>,
  inner: typeof fetch,
): Promise<Response> {
  const scheme = addressAsked(asked).split(':')[0].toLowerCase()
  if (scheme === 'data' || scheme === 'blob') return inner(...asked)
  const { guardedFetch } = await import('../../connect/index.ts')
  const [what, init] = asked
  return guardedFetch({
    plain: true,
    mode: cx.app.mode,
    privateHosts: privateHostsOf(cx.app.description),
  })(what instanceof Request || what instanceof URL ? what : String(what), init)
}
