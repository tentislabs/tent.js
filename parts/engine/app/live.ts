import type { App } from '../app.ts'
import { hubOf, liveOpened } from '../liveDoor.ts'
import { liveEnds } from '../liveEnds.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.live`: the opening of `/_t/live` with no network. The scheme and the name it was sent to are those of its
 * address. It passes the steps of the door that the opening passes, and throws what the opening was refused with.
 * It answers the end that a page holds, at once: what is sent before the hub is loaded waits for it.
 */
export const member =
  (o: Opened): App['live'] =>
  (request) => {
    heldOpen(o)
    const { protocol, host } = new URL(request.url)
    const came = { from: '127.0.0.1', scheme: protocol.replace(/:$/, ''), host }
    const opened = liveOpened(o, request, o.web.about(came, request.headers))
    const { page, hub } = liveEnds()
    Promise.all([hubOf(o), opened.named]).then(
      ([made]) => made.attach(hub, opened),
      () => {
        opened.release()
        hub.close()
      },
    )
    return page
  }
