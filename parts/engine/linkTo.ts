import type { Link } from './copy/link.ts'
import { noLink } from './noLink.ts'
import type { Opened } from './opened.ts'
import type { About } from './web/proxy.ts'

/**
 * Takes an app, the opening of a link and what the engine knows of it. Opens the link: `/_t/work` is the link of a
 * worker, which an app that lets no worker join does not have, and every other address is the link of a reader.
 */
export function linkTo(o: Opened, request: Request, about: About): Link {
  if (new URL(request.url).pathname !== '/_t/work') return o.machine.link(request, about)
  if (!o.work) throw noLink()
  return o.work.link(request, about)
}
