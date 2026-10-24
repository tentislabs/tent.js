import type { Link } from '../copy/link.ts'
import { tell } from '../copy/link.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'

// The messages of a worker that say how it stands, and are never refused: refusing one would lose a worker that works.
const standing = new Set(['alive', 'ready', 'loaded', 'going'])

/** How many messages a worker sent in the minute that is running, from its start. */
export interface Minute {
  since: number
  n: number
}

/**
 * Takes the app, the minute of a worker, its link and a message it sent. Answers whether the message is past
 * `workPerMinute` of that worker: it is then refused with T0005, a call as a failed answer, and taken no further.
 * A worker sends a refused end again.
 */
export function pastMinute(o: Opened, minute: Minute, link: Link, message: Record<string, unknown>): boolean {
  if (typeof message.t !== 'string' || standing.has(message.t)) return false
  const now = o.clock.now()
  if (now - minute.since >= 60_000) {
    minute.since = now
    minute.n = 0
  }
  minute.n += 1
  if (minute.n <= storedLimit(o.description, 'workPerMinute')) return false
  const words = 'The worker sent more messages in a minute than `workPerMinute` allows.'
  if (message.t === 'call') {
    tell(link, { t: 'answer', id: String(message.id), ok: false, error: { code: 'T0005', message: words } })
    return true
  }
  const tasks = Array.isArray(message.tasks) ? message.tasks.map(String) : [String(message.task)]
  for (const task of tasks)
    tell(link, {
      t: 'refused',
      task,
      what: message.t,
      ...(message.n === undefined ? {} : { n: message.n }),
      code: 'T0005',
    })
  return true
}
