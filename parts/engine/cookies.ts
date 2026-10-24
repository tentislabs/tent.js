import type { Opened } from './opened.ts'
import type { About } from './web/proxy.ts'

/** The cookies of the engine that an app sets by this one rule: the session, and the visitor id. */
export type CookieKind = 'session' | 'visitor'

/** What `cookies` of a project states, as it is stored: the two marks that have a way out. */
function statedOf(o: Opened): { sameSite: 'Lax' | 'None'; domain?: string } {
  const stated: Record<string, unknown> = Object(o.description.project.cookies)
  return {
    sameSite: stated.sameSite === 'none' ? 'None' : 'Lax',
    ...(typeof stated.domain === 'string' && stated.domain !== '' ? { domain: stated.domain } : {}),
  }
}

/**
 * The name of a cookie of the engine for a request: `tent_<kind>.<the app's name>`, and over https with a prefix,
 * so that a browser takes it from this very site alone. With a `domain` the prefix is `__Secure-`: the names of one
 * parent share the cookie then, and the builder accepts what a sister site can do.
 */
export function cookieName(o: Opened, about: About, kind: CookieKind): string {
  const bare = `tent_${kind}.${o.name}`
  if (about.scheme !== 'https') return bare
  return `${statedOf(o).domain === undefined ? '__Host-' : '__Secure-'}${bare}`
}

/** Whether a request carries a cookie of the engine: one whose name starts `tent_`, with or without a prefix. */
export const carriesEngineCookie = (request: Request): boolean =>
  (request.headers.get('cookie') ?? '').split(';').some((part) => /^(__Host-|__Secure-)?tent_/.test(part.trim()))

/**
 * Takes a request and the name of a cookie. Answers the value that the request carries under that name, and
 * nothing where it carries none, or two: which of two a browser sends first is not the engine's to trust.
 */
export function cookieOf(request: Request, name: string): string | undefined {
  const sent = request.headers.get('cookie')
  if (sent === null) return undefined
  const found: string[] = []
  for (const part of sent.split(';')) {
    const at = part.indexOf('=')
    if (at >= 0 && part.slice(0, at).trim() === name) found.push(part.slice(at + 1).trim())
  }
  return found.length === 1 ? found[0] : undefined
}

/**
 * Takes an app, what the engine knows of a request, the kind of a cookie and its value. Answers the line of a
 * `Set-Cookie` header: the scripts of a page cannot read the cookie, it is sent to this site alone, and it is
 * marked `Secure` whenever the request reached the app over https. `life` is how long it lives, in milliseconds:
 * none leaves a cookie that ends with the browser, and 0 takes the cookie away.
 */
export function cookieLine(o: Opened, about: About, kind: CookieKind, value: string, life?: number): string {
  const { sameSite, domain } = statedOf(o)
  const secure = about.scheme === 'https'
  return [
    `${cookieName(o, about, kind)}=${value}`,
    'Path=/',
    // A domain is stated over https alone: with the bare name of plain http a cookie stays with its one host.
    ...(domain !== undefined && secure ? [`Domain=${domain}`] : []),
    'HttpOnly',
    `SameSite=${sameSite === 'None' && secure ? 'None' : 'Lax'}`,
    ...(secure ? ['Secure'] : []),
    ...(life === undefined ? [] : [`Max-Age=${Math.max(0, Math.floor(life / 1000))}`]),
  ].join('; ')
}
