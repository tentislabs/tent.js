import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { visit } from '../visit.ts'

// The ways of naming a caller by which a person is signed in to the app: a page of that browser was drawn for the
// user they named, or for a visitor.
const signedIn = ['session', 'identify']

/**
 * Takes the caller of a call or a read, and the user that its page says it was drawn for: `as` of the body, the
 * id of a user, or nothing for a page of a visitor. Where a session or
 * `identify` named the caller, and the page names another user or none, the call is not run: T3101 is thrown, and
 * the answer says that the caller changed, so that the page asks for its screen again before anything else. So is
 * every call and read of a page that names a user, where nobody calls: what the user meant is never done as a
 * visitor. A page drawn for one user is so never sent the rows of the next. Any other call is held to nothing: of
 * one that a program named, and one with no request around it.
 */
export function drawnFor(caller: Caller, as: unknown): void {
  const here = visit()
  if (!here) return
  // A page that was drawn for a user, in a browser that is nobody now: its sign-in ended, or never reached here.
  const nobodyNow = caller.kind === 'nobody' && here.by === undefined && typeof as === 'string' && as !== ''
  const signed = here.by !== undefined && signedIn.includes(here.by) && caller.kind === 'user'
  if (!nobodyNow && !signed) return
  if (signed && typeof as === 'string' && as === caller.user?.id) return
  here.changed = true
  throw new TentError('T3101', 'The caller of this call is no longer the one its page was drawn for.', {
    fix: 'The page asks for its screen again, and sends the call as the caller it is now.',
  })
}
