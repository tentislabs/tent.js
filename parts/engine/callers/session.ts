import type { Caller } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { sessionCaller, sessionMaking } from '../sessions.ts'
import { visit } from '../visit.ts'
import type { About } from '../web/proxy.ts'

/** The user of the session of a request, kept for the request that is being answered. */
function found(request: Request, app: Opened, about: About): Caller | undefined {
  const held = sessionCaller(app, request, about)
  const here = visit()
  // The request that is being answered keeps its session: a sign-out ends that one, and a sign-in takes its place.
  if (held && here?.request === request) here.session = held.session
  return held?.caller
}

/** The way of telling who calls that is a session: asked after a pass, and before a key. */
export const caller = {
  order: 3,
  find(request: Request, app: Opened, about: About): Caller | undefined | Promise<Caller | undefined> {
    // A session that a reader had its writer make for a program is waited for until the reader holds it.
    const making = sessionMaking(app, request, about)
    return making ? making.then(() => found(request, app, about)) : found(request, app, about)
  },
}
