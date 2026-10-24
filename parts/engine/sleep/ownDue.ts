import type { Opened } from '../opened.ts'
import type { Upkept } from '../upkeep.ts'
import { writtenSince } from '../counts/gather.ts'

/**
 * Takes an app that falls asleep, the number of the last write it held when it opened, and the moment at which it
 * was last used from outside, across its sleeps. Answers what is due of
 * the engine's own work for it, and where its upkeep stands: the daily upkeep where the app was used from outside
 * since that work last ran, and a backup on its schedule where the app was written since its last one. The
 * engine's own work is no such use.
 */
export function ownDue(o: Opened, openedAt: number, used: number): { at?: number; upkept?: Upkept } {
  const upkeep = o.upkeep
  if (!upkeep) return {}
  const upkept = upkeep.state()
  const next = upkeep.next()
  const due: number[] = []
  if (used >= upkept.daily) due.push(next.daily)
  if (next.backup !== undefined && writtenSince(o, upkept.backupN ?? openedAt)) due.push(next.backup)
  return { ...(due.length ? { at: Math.min(...due) } : {}), upkept }
}
