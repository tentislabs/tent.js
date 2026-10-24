import { storedLimit } from '../limits.ts'
import { framePassIn } from '../mcp/framePass.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import { sameOrigin } from './web.ts'

// The addresses whose answers a page of a listed site may read, and whose question a browser asks first.
const shared = [
  /^\/api\//,
  /^\/_t\/call\//,
  /^\/_t\/read\//,
  /^\/_t\/files$/,
  /^\/mcp$/,
  /^\/_t\/oauth\/(token|register)$/,
]

/** Whether a path is one that a page of a listed site may call. */
export const sharedPath = (path: string): boolean => shared.some((one) => one.test(path))

/** The site that `api.origins` lists for an origin that is not the app's own, or nothing. */
export function listedSite(o: Opened, origin: string | null, about: About): string | undefined {
  if (origin === null || sameOrigin(origin, about.origin)) return undefined
  const listed: unknown = Reflect.get(Object(o.description.project.api), 'origins')
  if (!Array.isArray(listed)) return undefined
  return listed.some((one) => typeof one === 'string' && sameOrigin(origin, one)) ? new URL(origin).origin : undefined
}

/** The lines that name a listed site on every answer to it: the site, that a cookie may be sent, and what it may read. */
function siteLines(site: string): Record<string, string> {
  return {
    'access-control-allow-origin': site,
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'Retry-After, Sunset, WWW-Authenticate',
    vary: 'Origin',
  }
}

/** The answer to the question a browser asks before a call from a listed site: the methods, headers and time. */
export function preflightLines(o: Opened, site: string, path: string): Record<string, string> {
  const more: unknown = Reflect.get(Object(o.description.project.api), 'headers')
  const headers = ['Authorization', 'Content-Type', 'Tent-Agreed']
  // The standard of MCP sends lines of its own with each request.
  if (path === '/mcp') headers.push('Mcp-Session-Id', 'Mcp-Protocol-Version', 'Mcp-Method', 'Mcp-Name', 'Last-Event-ID')
  if (Array.isArray(more)) for (const one of more) if (typeof one === 'string') headers.push(one)
  return {
    ...siteLines(site),
    'access-control-allow-methods': 'GET, POST',
    'access-control-allow-headers': headers.join(', '),
    'access-control-max-age': String(Math.floor(storedLimit(o.description, 'originKept') / 1000)),
  }
}

/** Answers a response with the lines that name a listed site, for a request of one to an address it may call. */
export function toSite(o: Opened, request: Request, about: About, answer: Response): Response {
  const path = new URL(request.url).pathname
  const site = sharedPath(path) ? listedSite(o, request.headers.get('origin'), about) : undefined
  if (!site || answer.headers.has('access-control-allow-origin')) return answer
  const headers = new Headers(answer.headers)
  for (const [name, value] of Object.entries(siteLines(site)))
    if (name === 'vary' && headers.has('vary')) headers.set('vary', `${headers.get('vary')}, Origin`)
    else headers.set(name, value)
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}

// The addresses that a frame of a chat app reaches with its pass, from a site of no name of its own.
const framed = [/^\/_t\/read\//, /^\/_t\/call\//, /^\/_t\/files$/]

/**
 * The answer to the question a browser asks before a frame of a chat app sends its pass: any site may send one,
 * since a pass is no cookie, and no cookie may come with it. Nothing for a question that sends no `Authorization`.
 */
export function framePreflight(request: Request): Record<string, string> | undefined {
  const path = new URL(request.url).pathname
  const asked = (request.headers.get('access-control-request-headers') ?? '').toLowerCase().split(/\s*,\s*/)
  if (!framed.some((one) => one.test(path)) || !asked.includes('authorization')) return undefined
  return {
    'access-control-allow-origin': request.headers.get('origin') ?? '*',
    'access-control-allow-methods': 'POST',
    'access-control-allow-headers': 'Authorization, Content-Type',
    vary: 'Origin',
  }
}

/** Answers a response to a request that carried the pass of a frame so that the frame may read it, with no cookie. */
export function toFrame(o: Opened, request: Request, answer: Response): Response {
  if (answer.headers.has('access-control-allow-origin') || request.headers.has('cookie')) return answer
  if (!request.headers.get('authorization')?.startsWith('Bearer ') || !framePassIn(o, request)) return answer
  const headers = new Headers(answer.headers)
  headers.set('access-control-allow-origin', '*')
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
}
