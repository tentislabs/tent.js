import { member } from '../handle.ts'

/** A session of a user as `sessions.list` shows it: `current` marks the session of the request. */
interface Session {
  id: string
  createdAt: Date
  usedAt: Date
  current: boolean
}

/** The handle of the sessions. Every member answers at once. A user is the id of a row of `users`, or the row. */
export interface Sessions {
  start(user: string | { id: string }, o?: { for?: string; browserOnly?: boolean }): void
  end(id?: string): void
  endAll(user: string | { id: string }): void
  list(user: string | { id: string }): Session[]
}

export const sessions: Sessions = {
  start: member('sessions', 'start'),
  end: member('sessions', 'end'),
  endAll: member('sessions', 'endAll'),
  list: member('sessions', 'list'),
}
