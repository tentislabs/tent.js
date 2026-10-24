import { bearerOf } from '../bearer.ts'
import { noLink } from '../noLink.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import type { ReaderKey } from './keys.ts'
import { readerKeyIn } from './keys.ts'
import { readerJoins } from '../keys/readerKeys.ts'
import type { Link } from './link.ts'
import { linkPair, tell } from './link.ts'
import { logCopy } from '../door/keyed.ts'

/**
 * Takes an app, a request for an address of the link, and what the engine knows of it. Answers the key that the
 * request carries. Throws T0001 for a request with no key of a reader, and for one that came over a connection
 * which is not secure to a machine that was not told `insecure`.
 */
export function keyedBy(o: Opened, request: Request, about: About): ReaderKey {
  const key = readerKeyIn(o.machine.keys, bearerOf(request)) ?? readerJoins(o, request)
  if (!key || (about.scheme !== 'https' && !o.machine.insecure)) throw noLink()
  return key
}

/**
 * Takes an app, the request that opens a link, and what the engine knows of it. Opens the link of a reader, and
 * answers the end that the reader holds. A writer takes the link. A machine that is not the writer says so, with
 * the address of the writer it follows, and closes it. Throws T0001 where the request carries no key of a reader.
 */
export function openLink(o: Opened, request: Request, about: About): Link {
  const began = performance.now()
  const key = keyedBy(o, request, about)
  // The opening of a link is a request to an address of the link, and a row of the log as each of them is.
  logCopy(o, 'copy', key, began)
  const [theirs, ours] = linkPair()
  const { writer, reader } = o.machine
  if (writer) writer.join(ours, key, about.from)
  else {
    tell(ours, { t: 'no', code: 'T0030', ...(reader ? { writer: reader.writer() } : {}) })
    ours.close()
  }
  return theirs
}
