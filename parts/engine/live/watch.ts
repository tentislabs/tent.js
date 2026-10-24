import type { LiveMessage } from '../hub/connection.ts'

// The longest name that a page may give a watch.
const longest = 200

/**
 * `{ t: 'watch', id, query, input, version, have, seen }`: watch a query. A watch that names itself with no text,
 * or with a longer one than a page ever writes, has not the form of a watch, and closes its connection.
 */
export const message: LiveMessage = {
  t: 'watch',
  handle(connection, message) {
    const told: Record<string, unknown> = { ...message }
    const { id, version, have, seen } = told
    if (typeof id !== 'string' || id.length > longest) return connection.close()
    connection.watch({
      id,
      query: told.query,
      input: told.input,
      ...(typeof version === 'string' ? { version } : {}),
      ...(typeof have === 'string' ? { have } : {}),
      ...(seen === undefined || seen === null ? {} : { seen }),
    })
  },
}
