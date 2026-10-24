import { underWay } from '../context.ts'
import { readOnly } from '../door/call.ts'

/** The method of a `fetch`, as it was asked: that of its options, or of the request it was handed, and `GET` with neither. */
function methodOf(asked: unknown[]): string {
  const [what, options] = asked
  const stated: unknown = Reflect.get(Object(options), 'method') ?? Reflect.get(Object(what), 'method')
  return typeof stated === 'string' ? stated.toUpperCase() : 'GET'
}

/**
 * Holds a `fetch` of backend code to what a call that only reads may do: a plain `fetch` that is a `GET`. Throws
 * T0013 for any other inside an action that a screen reads, and takes every `fetch` of every other call.
 */
export function heldForRead(asked: unknown[]): void {
  if (underWay()?.reads !== true) return
  const method = methodOf(asked)
  if (method !== 'GET' && method !== 'HEAD') throw readOnly(`A \`fetch\` that is a ${method}`)
}
