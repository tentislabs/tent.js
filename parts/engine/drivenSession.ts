import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { App } from './app.ts'
import { openedOf } from './app.ts'
import { heldOpen } from './opened.ts'
import { drivenEnded, madeSession } from './sessions.ts'

/** A session for a browser that a program drives: the line of its cookie, and what ends it once that browser closes. */
export interface DrivenSession {
  readonly cookie: string
  end(): Promise<void>
}

/**
 * Takes an app that this program holds and a user. Makes a session for that user as `app.session` does, for a
 * browser that the program drives: it counts on no bound of the user's own sessions, so it ends none of them, and
 * the program ends it when the browser closes, or the engine when the app closes. Throws what `app.session` throws.
 */
export function drivenSession(app: App, user: string | Caller): DrivenSession {
  const o = openedOf(app)
  if (!o) throw new TentError('T0013', 'A session for a browser is made on an app that this program holds.')
  heldOpen(o)
  const cookie = madeSession(o, user, true)
  return { cookie, end: () => drivenEnded(o, cookie) }
}
