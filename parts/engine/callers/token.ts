import type { Caller } from '../../core/index.ts'
import { tokenIn } from '../grants/caller.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'

/** Whether a path is one where a token given for `/mcp` is a caller: `/mcp`, and the two addresses of files. */
const forMcp = (path: string): boolean => path === '/mcp' || path === '/_t/files' || path.startsWith('/_t/files/')

/**
 * The way of telling who calls that is the token of a program: asked after a key, and before the pass of a frame.
 * A token given for `/mcp` is a caller there and at the two addresses of files, and one given for the app is a
 * caller wherever a key is and nobody at `/mcp`; each under the name of the app it was asked for.
 */
export const caller = {
  order: 5,
  find(request: Request, app: Opened, about: About): Caller | undefined {
    const found = tokenIn(app, request)
    if (!found) return undefined
    const path = new URL(request.url).pathname
    const { grant } = found
    if (grant.for === 'mcp') return forMcp(path) && grant.resource === `${about.origin}/mcp` ? found.caller : undefined
    return path !== '/mcp' && grant.resource === about.origin ? found.caller : undefined
  },
}
