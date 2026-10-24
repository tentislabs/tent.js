import type { Opened } from '../opened.ts'
import { screenAt } from './find.ts'
import { isStored } from '../../core/internal.ts'
import { readerCarries } from '../onlyReads.ts'

/** What a reader is asked for, as far as it decides who answers: each machine itself, the reader, or the writer. */
type Kind = 'own' | 'reads' | 'writes'

/**
 * Takes an app and a request. Says who answers it where it is for a page: a file of the bundle is each machine's
 * own; a download and the image door are the reader's; a read from a page is the reader's where it
 * reads a query; and a screen is the reader's
 * unless an entry of its `data` is an action, which the writer carries out. Answers nothing for a request that is
 * for no page. A screen whose `data` is code is tried by the reader, which hands it on where it meets an action.
 */
export function pageKind(o: Opened, request: Request): { kind: Kind; name?: string } | undefined {
  const { pathname } = new URL(request.url)
  if (request.method === 'GET' && pathname.startsWith('/_t/b/')) return { kind: 'own' }
  // A file and a picture are answered by the reader, with the bytes it holds or fetches.
  if (request.method === 'GET' && (pathname.startsWith('/_t/files/') || pathname.startsWith('/_t/img/')))
    return { kind: 'reads' }
  if (request.method === 'POST' && pathname.startsWith('/_t/read/')) {
    let name = pathname.slice('/_t/read/'.length)
    try {
      name = decodeURIComponent(name)
    } catch {
      // A name that does not read names no function, and the writer says so.
    }
    return { kind: readerCarries(o, name) ? 'reads' : 'writes', name }
  }
  const ours = pathname.startsWith('/_t/') || pathname === '/_t' || pathname.startsWith('/api/')
  if (request.method !== 'GET' || ours || !Object.keys(o.description.screens).length) return undefined
  const found = screenAt(o.description, pathname)
  const data = found ? o.description.screens[found.name].data : undefined
  const acts = isStored(data)
    ? Object.values(data).some(
        (entry) => isStored(entry) && typeof entry.action === 'string' && !readerCarries(o, entry.action),
      )
    : false
  return { kind: acts ? 'writes' : 'reads' }
}
