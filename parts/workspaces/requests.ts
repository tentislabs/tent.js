import { workspaceIds } from './folder.ts'
import { openLive } from './published.ts'
import { runWorkspace } from './opening.ts'
import type { Held, One } from './state.ts'
import { hostOf, oneOf } from './state.ts'

/**
 * The workspace whose address, or whose live address, a host names: one that the workspaces hold, or one whose
 * folder was put there while the program ran. Nothing for a host that names none.
 */
function namedBy(held: Held, host: string): { one: One; live: boolean } | undefined {
  const lower = host.toLowerCase()
  const known = (one: One): { one: One; live: boolean } | undefined =>
    hostOf(one.workspace.address) === lower
      ? { one, live: false }
      : one.workspace.live && hostOf(one.workspace.live.address) === lower
        ? { one, live: true }
        : undefined
  for (const one of held.ones.values()) {
    const found = known(one)
    if (found) return found
  }
  for (const id of workspaceIds(held.o.folder)) {
    if (held.ones.has(id)) continue
    try {
      const found = known(oneOf(held, id))
      if (found) return found
    } catch {
      // A folder that holds no workspace names nothing.
    }
  }
  return undefined
}

/** Whether a cookie is one of the product app's own, by its name: its session, its visitor id and its kept state. */
function productCookie(name: string, app: string): boolean {
  const escaped = app.replace(/[^A-Za-z0-9]/g, (one) => `\\${one}`)
  return new RegExp(`^(?:__Host-|__Secure-)?tent_[a-z]+\\.${escaped}$`).test(name)
}

/**
 * A request for the app of a workspace as its code may see it: every cookie of the product app's own names, and a
 * `Tent-Caller` that the visitor sent, taken out. The code of a workspace is not the product's.
 */
function forWorkspace(request: Request, app: string): Request {
  const headers = new Headers(request.headers)
  headers.delete('tent-caller')
  const cookies = (headers.get('cookie') ?? '')
    .split(';')
    .map((one) => one.trim())
    .filter((one) => one !== '' && !productCookie(one.slice(0, Math.max(0, one.indexOf('='))), app))
  if (cookies.length) headers.set('cookie', cookies.join('; '))
  else headers.delete('cookie')
  return new Request(request, { headers })
}

/**
 * The `onRequest` of the workspaces, which stands in front of the engine's own. It finds the workspace that the
 * host of a request names, opens its app or its live app where the engine does not hold it yet, and hands the
 * request on to the door, without what the product's own names of it. A request for any other host goes on
 * through the door as it came.
 */
export function onRequestOf(held: Held) {
  return async (request: Request, next: (r: Request) => Promise<Response>): Promise<Response> => {
    const named = held.closed ? undefined : namedBy(held, new URL(request.url).host)
    if (!named) return next(request)
    const { one } = named
    const handed = forWorkspace(request, held.o.app.description.app.name)
    if (named.live) {
      if (!one.live) await openLive(held, one)
      return next(handed)
    }
    await runWorkspace(held, one.workspace.id)
    return next(handed)
  }
}

/**
 * What the workspaces give the engine before it takes the opening of a connection: the app of the workspace that
 * the name of the connection names is opened first, so the engine finds it. The engine joins every connection itself.
 */
export function linksOf(held: Held) {
  return async (request: Request): Promise<undefined> => {
    const named = held.closed ? undefined : namedBy(held, new URL(request.url).host)
    if (named && !named.live) await runWorkspace(held, named.one.workspace.id)
    return undefined
  }
}
