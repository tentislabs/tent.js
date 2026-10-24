import type { LiveMessage } from '../hub/connection.ts'

/**
 * `{ t: 'thrown', message, stack, screen }`: in development, a page tells of a view that failed as it drew in the
 * browser, with the words and the trace of the failure and the screen it shows. Every open page shows it.
 */
export const message: LiveMessage = {
  t: 'thrown',
  handle: (connection, told) => connection.thrown(told),
}
