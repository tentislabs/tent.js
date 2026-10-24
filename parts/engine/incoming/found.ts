import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { routeFits } from '../routes.ts'

/** A call coming in that an address fits, with the values of the address. */
export interface IncomingFound {
  name: string
  record: Record<string, unknown>
  params: Record<string, string>
}

/**
 * Takes an app, a method and the path of an address. Answers the `incoming` whose path the address fits, with the
 * values of the address, or nothing: a call coming in is a `POST`, and any other method is no call of it.
 */
export function incomingAt(o: Opened, method: string, path: string): IncomingFound | undefined {
  if (method.toUpperCase() !== 'POST') return undefined
  const parts = path.split('/').slice(1)
  for (const [name, record] of Object.entries(o.description.incoming)) {
    if (typeof record.path !== 'string') continue
    const params = routeFits(record.path, parts)
    if (params) return { name, record, params }
  }
  return undefined
}

/** The most bytes that the body of a call coming in may hold: its own `limits.size`, or `callSize`. */
export function incomingSize(o: Opened, record: Record<string, unknown>): number {
  const stated: unknown = Reflect.get(Object(record.limits), 'size')
  return typeof stated === 'number' ? stated : limitOf(o.description, 'callSize')
}
