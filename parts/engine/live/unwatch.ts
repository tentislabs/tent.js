import type { LiveMessage } from '../hub/connection.ts'

/** `{ t: 'unwatch', id }`: stop a watch. One that names no watch closes its connection. */
export const message: LiveMessage = {
  t: 'unwatch',
  handle(connection, message) {
    const id: unknown = Reflect.get(message, 'id')
    if (typeof id !== 'string') return connection.close()
    connection.unwatch(id)
  },
}
