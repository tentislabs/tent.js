import { inspectHeld } from '../inspected.ts'
import type { Opened } from '../opened.ts'

/** The name of the address that carries a token of the inspect mode. */
export const inspectName = 't-inspect'

/** A request for a page that carries a good token: the token, and the origin of the tool it is for. */
export interface Inspected {
  token: string
  origin: string
  // The tool opens the page in a window of its own, and frames nothing.
  opener: boolean
}

/** Takes an app and the address of a request. Answers the token and its origin, where the address carries a good one. */
export function inspectAsked(o: Opened, url: URL): Inspected | undefined {
  const token = url.searchParams.get(inspectName)
  const held = inspectHeld(o, token)
  return held && token !== null ? { token, ...held } : undefined
}

/** Whether a screen is one where a person lets a program in, which no token opens: a `grant` or an `ask` screen. */
export const opensNoToken = (screen: Record<string, unknown>): boolean => screen.for === 'grant' || screen.for === 'ask'

/**
 * Takes who may show a screen in a frame, and the inspect mode of the request. Answers who may show this one answer
 * in a frame: the tool's origin beside them. A tool that opens the page in a window of its own frames nothing.
 */
export function framedWith(framedBy: unknown, inspected: Inspected | undefined): unknown {
  if (!inspected || inspected.opener || framedBy === 'anyone') return framedBy
  return [...(Array.isArray(framedBy) ? framedBy : []), inspected.origin]
}

/**
 * Takes a path of the app that an answer leads to, and the token of the inspect mode that a form sent with no
 * script carried. Answers the path with the token as a name of its own, so the page it leads to keeps the mode.
 */
export function carriedTo(path: string, token: string | null): string {
  if (token === null || !/^[A-Za-z0-9_-]{32}$/.test(token) || !path.startsWith('/') || path.startsWith('//'))
    return path
  const [before, hash] = path.split('#', 2)
  const joined = `${before}${before.includes('?') ? '&' : '?'}${inspectName}=${token}`
  return hash === undefined ? joined : `${joined}#${hash}`
}

/** What stands after the question mark of an address, without the token of the inspect mode: what `back` may carry. */
export function searchWithout(url: URL): string {
  // An address with no token is kept as it was written.
  if (!url.searchParams.has(inspectName)) return url.search
  const search = new URLSearchParams(url.search)
  search.delete(inspectName)
  const written = search.toString()
  return written ? `?${written}` : ''
}
