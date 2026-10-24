import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Row } from '../../data/index.ts'
import { keyAt } from '../keys/kept.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/rate.ts'
import { countedAs } from '../web/names.ts'

const system = { kind: 'system' } as const

// The length of the window that a rate limit counts in, in milliseconds.
const minute = 60_000

const windowOf = (now: number): number => Math.floor(now / minute) * minute

/** The moment that a row of the counts holds as the start of its window. */
const startOf = (row: Row): number => (row.windowStart instanceof Date ? row.windowStart.getTime() : -1)

/**
 * Counts one request under a key, in the minute that runs. Answers whether it is taken: the count is raised and
 * written, or stands at its limit already, which writes nothing.
 */
export function countedFor(o: Opened, key: string, limit: number): boolean {
  const window = windowOf(o.clock.now())
  const held = o.store.read({ from: table.name, one: 'get', id: key }, system).value
  const row: Row | undefined = typeof held === 'object' && !Array.isArray(held) ? held : undefined
  const count = row && startOf(row) === window ? Number(row.count) : 0
  if (count >= limit) return false
  const values = { windowStart: new Date(window), count: count + 1 }
  o.store.write((tx) =>
    row ? tx.change(table.name, key, values, system) : tx.add(table.name, { key, ...values }, system),
  )
  return true
}

/**
 * Step 4 of the door: one request is counted for its caller. A caller who is nobody is held to `anyonePerMinute`
 * for their address, a key to its own `perMinute`, and any other signed-in caller to `callerPerMinute`. Throws
 * T0005 for one request more.
 */
export function counted(o: Opened, caller: Caller, from: string): void {
  const id = caller.key?.id ?? caller.grant?.id ?? caller.user?.id
  // A key is counted by its own `perMinute`.
  const own = caller.kind === 'key' && caller.key ? keyAt(o, caller.key.id)?.key.perMinute : undefined
  const [key, limit] =
    caller.kind === 'nobody' || id === undefined
      ? [`anyone:${countedAs(from)}`, limitOf(o.description, 'anyonePerMinute')]
      : [`${caller.kind}:${id}`, own ?? limitOf(o.description, 'callerPerMinute')]
  if (!countedFor(o, key, limit))
    throw new TentError('T0005', `More than ${limit} requests in a minute came from ${key}.`, {
      fix: 'Send fewer requests, or raise the limit in `project.limits`.',
    })
}

/** Removes the counts of the windows that have ended, so that the table holds the callers of the minute that runs and no more. */
export function sweepRates(o: Opened): void {
  const window = windowOf(o.clock.now())
  const rows = o.store.read({ from: table.name }, system).value
  const ended = (Array.isArray(rows) ? rows : []).filter((row) => startOf(row) < window)
  if (!ended.length) return
  o.store.write((tx) => {
    for (const row of ended) tx.remove(table.name, String(row.key), system)
  })
}
