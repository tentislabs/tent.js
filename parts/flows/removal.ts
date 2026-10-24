import { limitDefaults, isWritten } from '../core/internal.ts'
import type { Held } from './held.ts'
import { runOf } from './places.ts'
import type { RunRow } from './rows.ts'
import { isFinal } from './states.ts'

/** How long the run of an action that nobody called is kept after it ended: `limits.runKept` of the action. */
function runKeptOf(held: Held, run: RunRow): number {
  let record: unknown
  try {
    record = held.env.description(run.version).functions[run.flow]
  } catch {
    // A version that is gone keeps nothing of the action: its run is kept as the default says.
  }
  const limits: unknown = isWritten(record) ? record.limits : undefined
  const stated = isWritten(limits) ? limits.runKept : undefined
  return typeof stated === 'number' ? stated : limitDefaults.action.runKept
}

/**
 * Takes runs and the moment before which a run that ended is past `runsKept`. Answers those of them that are past
 * their keep: a run at the top of its calls by its own end, the run of an action that nobody called after
 * `limits.runKept` of the action, and a run that another called with its top, once that one is past its keep or gone.
 */
export function pastKeep(held: Held, runs: RunRow[], endedBefore: number): RunRow[] {
  const now = held.env.clock.now()
  const past = (top: RunRow): boolean =>
    isFinal(top) &&
    top.endedAt !== undefined &&
    top.endedAt < (top.kind === 'action' && top.parent === undefined ? now - runKeptOf(held, top) : endedBefore)
  const byId = new Map(runs.map((run) => [run.id, run]))
  return runs.filter((run) => {
    if (!isFinal(run)) return false
    if (run.top === run.id) return past(run)
    const top = byId.get(run.top) ?? runOf(held.env, run.top)
    return !top || past(top)
  })
}
