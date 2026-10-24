import { TentError } from '../../core/index.ts'
import type { Link } from './link.ts'
import { linkLater } from './link.ts'

/** What a machine reaches another by: a request that is answered, and the opening of a link. */
export interface Reached {
  request(request: Request, o?: { from?: string }): Promise<Response>
  link(request: Request): Link
}

/** How an address is reached in place of the network, for machines in one program: nothing for an address it does not know. */
export type Reach = (address: string) => Reached | undefined

/** The error of an address that a machine may not reach, or cannot. */
export const notReached = (address: string, why: string, sent = false): TentError =>
  new TentError('T0029', `The machine at ${address} was not reached: ${why}.`, {
    fix: 'See that the machine runs and that this one may reach it. The caller may ask again.',
    ...(sent ? { fields: { sent: 'true' } } : {}),
  })

/**
 * Takes how an address is reached in place of the network, and whether this machine reaches another over a
 * connection that is not secure. Answers what reaches an address: by `reach` where it knows the address, and over
 * the network otherwise. An address that is not secure is reached only with `insecure`.
 */
export function reachedBy(reach: Reach | undefined, insecure: boolean): (address: string) => Reached {
  return (address) => {
    const known = reach?.(address)
    if (known) return known
    const secure = address.startsWith('https://')
    const held = (): void => {
      if (!secure && !insecure)
        throw new TentError(
          'T0013',
          `The address ${address} is not secure, and this machine was not told \`insecure\`.`,
          {
            fix: 'Name an address that starts with `https://`, or start the machine with `--insecure` on a network of its own.',
          },
        )
    }
    return {
      request(request) {
        held()
        return fetch(request)
      },
      link(request) {
        held()
        const key = request.headers.get('authorization') ?? ''
        // The borrowed part for live connections is loaded when the first link over the network opens.
        return linkLater(import('../borrowed/ws.ts').then(({ dial }) => dial(request.url, { authorization: key })))
      },
    }
  }
}
