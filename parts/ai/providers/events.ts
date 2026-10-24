import type { ServerEvent } from '../../connect/index.ts'

/** The JSON of the data of an event, or nothing where it is none. */
export function dataOf(event: ServerEvent): Record<string, unknown> | undefined {
  try {
    const read: unknown = JSON.parse(event.data)
    return typeof read === 'object' && read !== null && !Array.isArray(read) ? Object(read) : undefined
  } catch {
    return undefined
  }
}
