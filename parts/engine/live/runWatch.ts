import type { LiveMessage } from '../hub/connection.ts'

// The longest name that a page may give a watch.
const longest = 200

/**
 * `{ t: 'run-watch', id, run, seen }`: follow a run. One that names itself or its run with no text, or with a
 * longer one than a page ever writes, has not the form of a watch, and closes its connection.
 */
export const message: LiveMessage = {
  t: 'run-watch',
  handle(connection, message) {
    const id: unknown = Reflect.get(message, 'id')
    const run: unknown = Reflect.get(message, 'run')
    if (typeof id !== 'string' || id.length > longest || typeof run !== 'string' || run.length > longest)
      return connection.close()
    connection.runWatch({ id, run })
  },
}
