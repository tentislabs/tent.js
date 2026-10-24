import type { App } from '../app.ts'
import { answerRequest } from '../door/web.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { proxyRule } from '../web/proxy.ts'

// A request that the program hands in with no address of its own crossed no network, so no proxy sent it, even
// where a proxy of this computer is named: the commands of `tent start` ask their own app so.
const unproxied = proxyRule(undefined)

/**
 * `app.request`: any request, through every step of the door, with no network. The scheme and the name it was
 * sent to are those of its address, and it counts as coming from `from`, through the proxies that the engine
 * names, or from this computer, through none, where no `from` is given.
 */
export const member =
  (o: Opened): App['request'] =>
  async (request, how) => {
    heldOpen(o)
    const { protocol, host } = new URL(request.url)
    const came = { from: how?.from ?? '127.0.0.1', scheme: protocol.replace(/:$/, ''), host }
    const about = how?.from === undefined ? unproxied.about(came, request.headers) : o.web.about(came, request.headers)
    return answerRequest(o, request, about)
  }
