import { later, TentError } from '../../core/index.ts'
import type { Admin } from '../admin.ts'
import { badWord } from '../admin.ts'
import { sentMail } from '../mail/mailbox.ts'
import type { Opened } from '../opened.ts'
import { isTraceId } from '../trace/ids.ts'
import { rankedVitals } from '../vitals/ranked.ts'
import { slowestOf, treeOf } from '../trace/tree.ts'

// How many rows of each table a command is answered at most: the newest ones.
const newest = 200

/** The moment that a length of time lies back from now, by the clock of the app. Throws T0002 for words that do not read. */
function since(o: Opened, words: unknown): number {
  if (words === undefined) return 0
  try {
    const ms = later(new Date(0), String(words)).getTime()
    return o.clock.now() - ms
  } catch {
    throw badWord('since', "a length of time, as '1 hour'")
  }
}

/**
 * `tent logs`: the newest calls, errors and slow queries of the log of the app, each in the order they were
 * written. `errors` answers the errors alone, and `since` only what was written within that length of time.
 * `mail` answers the messages the app sent in the mode `development`, the newest first, as `/_t/mail` shows them,
 * under `mails`. `trace` answers the tree of one trace, and `slow` the slow queries and the slowest traces that
 * began within `since`, the slowest first. `callers` answers how many callers called each function within
 * `since`, each counted once.
 */
export const admin: Admin = {
  name: 'logs',
  async run(o, args) {
    const from = since(o, Reflect.get(args, 'since'))
    const rows = (table: 'calls' | 'errors' | 'slow') => o.log.rows(table, { since: from, newest })
    // One trace as its tree, which this computer alone reads: no address of the engine answers it.
    const trace: unknown = Reflect.get(args, 'trace')
    if (trace !== undefined) {
      if (!isTraceId(trace)) throw badWord('trace', 'the id of a trace, 32 hex characters')
      const tree = treeOf(o, trace)
      if (!tree)
        throw new TentError('T0001', `No trace ${trace} is kept in the log.`, {
          fix: 'Name a trace that an error answer or `tent logs --slow` gave: a trace that was not kept has no tree.',
        })
      return tree
    }
    // For each screen and version, the 75th share of each measure over a day, the screens furthest past their line first.
    if (Reflect.get(args, 'vitals') === true) return { vitals: rankedVitals(o) }
    if (Reflect.get(args, 'slow') === true) return { traces: slowestOf(o, from, newest), slow: rows('slow') }
    // The callers of each function within the time, each counted once, as the impact of a change names them.
    if (Reflect.get(args, 'callers') === true) {
      const seen = new Map<string, Set<string>>()
      for (const row of o.log.rows('calls', { since: from })) {
        const name = String(row.name)
        const callers = seen.get(name) ?? new Set<string>()
        callers.add(`${String(row.callerKind)}:${String(row.callerId)}`)
        seen.set(name, callers)
      }
      return { callers: Object.fromEntries([...seen].map(([name, callers]) => [name, callers.size])) }
    }
    if (Reflect.get(args, 'errors') === true) return { errors: rows('errors') }
    // The messages the mode development kept in place of sending them, the newest first: their heads, their
    // texts, their HTML and the names of their files.
    if (Reflect.get(args, 'mail') === true)
      return {
        mails: sentMail(o)
          .filter((one) => one.at >= from)
          .map(({ id: _, ...one }) => one),
      }
    return { calls: rows('calls'), errors: rows('errors'), slow: rows('slow') }
  },
}
