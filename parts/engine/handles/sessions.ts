import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'
import { endSession, endSessions, listSessions, startSession } from '../sessions.ts'

/** What starts or ends a session changes who is calling: a read does neither. */
const acts = { acts: true }

/**
 * The working object behind the handle `sessions`: a session is started and ended for the browser whose request
 * is being answered, and the sessions of a user are listed and ended.
 */
export const handle = (_o: Opened): object => ({
  start: (user: unknown, how?: unknown): void => startSession(callOf('`sessions.start`', acts), user, how),
  end: (id?: unknown): void => endSession(callOf('`sessions.end`', acts), id),
  endAll: (user: unknown): void => endSessions(callOf('`sessions.endAll`', acts), user),
  list: (user: unknown): object[] => listSessions(callOf('`sessions.list`'), user),
})
