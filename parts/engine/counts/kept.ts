import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { table } from '../tables/counts.ts'
import { book } from './book.ts'

const system = { kind: 'system' } as const

/** The longer of what the bundle and the host state of a limit, or what one alone states: nothing for ever. */
function longer(o: Opened, name: 'callerCountsKept' | 'countsKept'): number | undefined {
  const stated: unknown = Reflect.get(Object(o.description.project.limits), name)
  const bundle = typeof stated === 'number' ? stated : storedLimit(o.description, name) || undefined
  const host = o.counting?.[name]
  if (bundle === undefined) return host
  return host === undefined ? bundle : Math.max(bundle, host)
}

/**
 * The counts' share of the daily upkeep. The rows by caller older than `callerCountsKept` are joined into one row
 * for each day, thing and unit, with the caller empty and the amounts added, so no sum of a day changes; the rows of
 * the days older than `countsKept` go. Each is for ever where neither the bundle nor the host states it.
 */
export function keepCounts(o: Opened): void {
  const now = o.clock.now()
  const joined = longer(o, 'callerCountsKept')
  const kept = longer(o, 'countsKept')
  if (joined === undefined && kept === undefined) return
  o.store.write((tx) => {
    const read: unknown = tx.read({ from: table.name }, system)
    for (const row of Array.isArray(read) ? read : []) {
      const at = (name: string): unknown => Reflect.get(Object(row), name)
      const stored = at('day')
      const day = stored instanceof Date ? stored : new Date(String(stored))
      const key = {
        day: at('day'),
        name: at('name'),
        answeredBy: at('answeredBy'),
        caller: at('caller'),
        unit: at('unit'),
      }
      const age = now - day.getTime()
      if (kept !== undefined && age > kept) {
        tx.remove(table.name, key, system)
        continue
      }
      const amount = at('amount')
      if (joined === undefined || age <= joined || key.caller === '' || typeof amount !== 'number') continue
      tx.remove(table.name, key, system)
      book(o, tx, [
        { day, name: String(key.name), answeredBy: String(key.answeredBy), caller: '', unit: String(key.unit), amount },
      ])
    }
  })
}
