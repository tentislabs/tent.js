import type { LiveMessage } from '../hub/connection.ts'

/**
 * `{ t: 'at' }`: a page that a test drives asks to be told, in the mode `test`, the write that the answers of its
 * watches hold, each time the hub has run what it was asked. In any other mode it changes nothing.
 */
export const message: LiveMessage = {
  t: 'at',
  handle: (connection) => connection.heard(),
}
