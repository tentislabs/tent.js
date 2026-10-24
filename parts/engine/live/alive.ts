import type { LiveMessage } from '../hub/connection.ts'

/** `{ t: 'alive' }`: the answer of a page to each sign of life of the engine. */
export const message: LiveMessage = {
  t: 'alive',
  handle: (connection) => connection.alive(),
}
