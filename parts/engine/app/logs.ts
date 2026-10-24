import { admin } from '../admin/logs.ts'
import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/**
 * `app.logs`: the rows of the log of this app, as the admin command `logs` answers them: the newest calls, errors
 * and slow queries, each in the order they were written, the errors alone with `errors`, only what was written
 * within `since`, a length of time, and at most `newest` of each. Throws T0002 for a `since` that does not read.
 */
export const member =
  (o: Opened): App['logs'] =>
  async (asked = {}) => {
    heldOpen(o)
    const rows: Record<string, unknown> = Object(
      await admin.run(o, {
        ...(asked.errors === true ? { errors: true } : {}),
        ...(asked.since === undefined ? {} : { since: asked.since }),
        ...(asked.trace === undefined ? {} : { trace: asked.trace }),
        ...(asked.slow === true ? { slow: true } : {}),
        ...(asked.vitals === true ? { vitals: true } : {}),
        ...(asked.callers === true ? { callers: true } : {}),
      }),
    )
    if (asked.trace !== undefined || asked.callers === true || asked.vitals === true) return rows
    const newest = asked.newest
    if (newest === undefined) return rows
    return Object.fromEntries(
      Object.entries(rows).map(([table, list]) => [table, Array.isArray(list) ? list.slice(-newest) : list]),
    )
  }
