import type { App } from '../app.ts'
import { linkTo } from '../linkTo.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.link`: the opening of `/_t/copy`, the link of a reader, with no network. The scheme and the name it was
 * sent to are those of its address. It throws what the opening was refused with.
 */
export const member =
  (o: Opened): App['link'] =>
  (request) => {
    heldOpen(o)
    const { protocol, host } = new URL(request.url)
    const came = { from: '127.0.0.1', scheme: protocol.replace(/:$/, ''), host }
    return linkTo(o, request, o.web.about(came, request.headers))
  }
