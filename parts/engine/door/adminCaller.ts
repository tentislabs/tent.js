import type { Caller } from '../../core/index.ts'
import { sameSecret } from '../../core/index.ts'
import { bearerOf } from '../bearer.ts'
import type { Opened } from '../opened.ts'
import { callerWritten } from '../program.ts'
import type { About } from '../web/proxy.ts'
import { plainAddress } from '../web/proxy.ts'

// The header in which the command line of this computer names the caller it acts for.
const header = 'tent-caller'

/** Whether a request came from where the commands of an engine come from: this computer, through no proxy. */
export function fromCommands(about: About): boolean {
  const from = plainAddress(about.from)
  return !about.proxied && (from === '::1' || /^127\.\d+\.\d+\.\d+$/.test(from))
}

/**
 * The first way of step 3: the command line of this computer, which sends the admin token of the engine and the
 * caller it acts for in `Tent-Caller`: a user id, `nobody` or `system`. The header is read only beside the right
 * admin token, on a request of this computer that came through no proxy. Answers that caller, or nothing for any
 * other request. Throws T2103 for an id that names no user.
 */
export function adminCaller(o: Opened, request: Request, about: About): Caller | undefined {
  const named = request.headers.get(header)
  if (named === null || !fromCommands(about) || !sameSecret(bearerOf(request), o.token)) return undefined
  return callerWritten(o, named)
}

/** A request without the admin token and `Tent-Caller`, as the builder's `onRequest` is handed it. */
export function withoutAdmin(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete('authorization')
  headers.delete(header)
  return new Request(request, { headers })
}
