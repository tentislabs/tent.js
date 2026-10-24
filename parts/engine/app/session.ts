import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { madeSession } from '../sessions.ts'

/**
 * `app.session`: in the modes `development` and `test`, a session for a user, made in the program as `sessions.start`
 * makes one, with no request and no address of the app. Answers its cookie. The user is named by the id of its row,
 * or as a caller.
 */
export const member =
  (o: Opened): App['session'] =>
  (user) => {
    heldOpen(o)
    return madeSession(o, user)
  }
