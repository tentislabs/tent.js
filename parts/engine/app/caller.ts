import type { App } from '../app.ts'
import { namedCaller } from '../door/caller.ts'
import { withoutOurs } from '../door/web.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.caller`: who a request is to this app, as step 3 of the door finds it, with the `x-tent-` headers taken out
 * first as step 1 takes them. Its scheme and its name are those of its address, and it counts as coming from this
 * computer. Nobody where no way of telling who calls names anyone.
 */
export const member =
  (o: Opened): App['caller'] =>
  async (request) => {
    heldOpen(o)
    const { protocol, host } = new URL(request.url)
    const came = { from: '127.0.0.1', scheme: protocol.replace(/:$/, ''), host }
    const clean = withoutOurs(request)
    return (await namedCaller(o, clean, o.web.about(came, clean.headers))).caller
  }
