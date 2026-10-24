import { isPath } from '../core/internal.ts'
import type { Opened } from './opened.ts'
import { limitOf } from './limits.ts'
import type { Called } from './rooms/room.ts'

/** The code of one route of a loaded version: its `run`, and the arrow of its rule where that is code. */
interface RouteCode {
  run: Called
  access?: Called
}

// The code of the routes of each loaded version, kept under the arrows of its rules: every record that the engine
// holds of one version shares those, and a switch hands them on with the version.
const kept = new WeakMap<object, Map<string, RouteCode>>()

/**
 * Takes what the engine holds of an app whose code was just loaded, and what its room answered for the `run` of
 * each route and for the arrow of its rule where it is made with `allow` and is code. Keeps them for the version.
 */
export function keepRoutes(o: Opened, routes: Map<string, { run?: Called; access?: Called }>): void {
  const code = new Map<string, RouteCode>()
  for (const [name, { run, access }] of routes) if (run) code.set(name, { run, ...(access ? { access } : {}) })
  kept.set(o.allows, code)
}

/** Answers the code of a route of the running version, or nothing where the version has no such route. */
export const routeCode = (o: Opened, name: string): RouteCode | undefined => kept.get(o.allows)?.get(name)

/** How exact one part of a pattern is: a fixed part before a value, and a value before the rest. */
const rank = (part: string): number => (part === '*' ? 2 : part.startsWith(':') ? 1 : 0)

/** The values of an address that fits a pattern, each with its percent signs read, or nothing where it does not fit. */
export function routeFits(pattern: string, parts: string[]): Record<string, string> | undefined {
  // An address that holds `//`, a `\` or a control character, as written or read, is no address of the app.
  if (!isPath(`/${parts.join('/')}`)) return undefined
  const wanted = pattern.split('/').slice(1)
  const params: Record<string, string> = {}
  for (const [k, part] of wanted.entries()) {
    // The rest of an address is everything after its place, and stands last.
    if (part === '*') {
      params.rest = parts.slice(k).map(decodeURIComponent).join('/')
      return params
    }
    const given = parts[k]
    if (given === undefined) return undefined
    if (part.startsWith(':')) {
      if (given === '') return undefined
      params[part.slice(1)] = decodeURIComponent(given)
    } else if (part !== given) return undefined
  }
  return wanted.length === parts.length ? params : undefined
}

/** Whether one list of ranks is more exact than another at the first place where the two differ. */
function firstLess(one: number[], other: number[]): boolean {
  for (let k = 0; k < Math.max(one.length, other.length); k++)
    if ((one[k] ?? 3) !== (other[k] ?? 3)) return (one[k] ?? 3) < (other[k] ?? 3)
  return false
}

/** A route that an address fits, with the values of the address. */
export interface RouteFound {
  name: string
  record: Record<string, unknown>
  params: Record<string, string>
}

/**
 * Takes an app, a method and the path of an address. Answers the route that states the method and whose path the
 * address fits, with the values of the address, or nothing where no route does. Of two routes that fit, the one
 * whose pattern is more exact wins, part by part from the left, as of two screens.
 */
export function routeAt(o: Opened, method: string, path: string): RouteFound | undefined {
  const parts = path.split('/').slice(1)
  let best: (RouteFound & { ranks: number[] }) | undefined
  for (const [name, record] of Object.entries(o.description.routes)) {
    const [pattern, stated]: unknown[] = [record.path, record.method]
    if (typeof pattern !== 'string') continue
    const methods = (Array.isArray(stated) ? stated : [stated]).map((one) => String(one).toUpperCase())
    if (!methods.includes(method.toUpperCase())) continue
    const params = routeFits(pattern, parts)
    if (!params) continue
    const ranks = pattern.split('/').slice(1).map(rank)
    if (best === undefined || firstLess(ranks, best.ranks)) best = { name, record, params, ranks }
  }
  return best && { name: best.name, record: best.record, params: best.params }
}

/** The most bytes that the body of a request for a route may hold: what the route states, or `callSize`. */
export function routeSize(o: Opened, record: Record<string, unknown>): number {
  const stated: unknown = Reflect.get(Object(record.limits), 'size')
  return typeof stated === 'number' ? stated : limitOf(o.description, 'callSize')
}

/** The time that the `run` of a route may take, in milliseconds: what the route states, or `actionTime`. */
export function routeTime(o: Opened, record: Record<string, unknown>): number {
  const stated: unknown = Reflect.get(Object(record.limits), 'time')
  return typeof stated === 'number' ? stated : limitOf(o.description, 'actionTime')
}

/**
 * The sites whose pages may send a route a request that changes something, beside the app's own: the list that
 * the route states, or `any` where it is opened to all with `anyone('why')`.
 */
export function routeSites(record: Record<string, unknown>): string[] | 'any' {
  const stated = record.origins
  if (Array.isArray(stated)) return stated.map(String)
  return Reflect.get(Object(stated), 'rule') === 'anyone' ? 'any' : []
}
