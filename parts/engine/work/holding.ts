import { TentError } from '../../core/index.ts'
import type { Runner } from '../../flows/index.ts'
import { dayOf } from '../counts/day.ts'
import { runAllowed } from '../counts/perRun.ts'
import type { Opened } from '../opened.ts'
import type { InQueue } from './state.ts'
import { queueKey } from './state.ts'
import type { Reserve, LimitStanding } from './usage.ts'
import { limitRefusal, limitsFor, neverFits, wouldPass } from './usage.ts'

/** A limit of use as `app.work()` and `need` show it. */
interface Shown {
  unit: string
  limit: number
  used: number
  reserved: number
}

/** What the hub holds of the work that the limits of use hold back. */
export interface Holding {
  // Before a pass over the queue, and after it: what is held back is what the pass found.
  begin(): void
  end(): void
  // Whether a try may go now: `go`; `held`, where a limit holds it back; `refused`, where a limit failed it.
  check(entry: InQueue): 'go' | 'held' | 'refused'
  // Whether a try is held back now, and since when it is not, for the time it may wait for a worker.
  held(key: string): boolean
  freedAt(key: string): number | undefined
  // How many tries of a kind are held back, and the limits of the kind with what was used and reserved.
  heldBack(kind: string): number
  shown(kind: string): Shown[]
  close(): void
}

/** The key by which a limit is told once when it begins to hold work back. */
const keyOf = (one: LimitStanding): string =>
  [one.which, one.kind, one.name ?? '', one.caller ?? '', one.unit].join('\n')

/**
 * Takes an app, its runner, the reserves of the tasks out, and what looks at the queue again. Answers what holds
 * work back by the limits of use. A try whose run would pass its `perRun`, or whose own reserve passes a limit,
 * fails at once with T7102; one that a request at the door waits for is refused so; with `atLimit: 'fail'` its try
 * fails; every other waits, shown as held back, and `work.limit` is raised when a limit begins to hold work back.
 * The queue is looked at again at the turn of the day of `project.zone`, while anything is held back.
 */
export function holdingOf(o: Opened, runner: Runner, reserves: () => Reserve[], pump: () => void): Holding {
  let now = new Map<string, LimitStanding>()
  let found = new Map<string, LimitStanding>()
  const freed = new Map<string, number>()
  // The tries that the pass looked at: a try that left the queue keeps no moment of when it was let go.
  let checked = new Set<string>()
  let told = new Set<string>()
  let cancelDay: (() => void) | undefined

  const agents = Object.values(o.description.flows).some((flow) => flow.agent !== undefined)
  const fail = (entry: InQueue, error: TentError, final: boolean): 'refused' => {
    runner.limited(entry.w.run, entry.w.step, error, final)
    return 'refused'
  }

  /** Looks at the queue again at the start of the next day, when the limits of the day are counted anew. */
  function armDay(): void {
    cancelDay?.()
    cancelDay = undefined
    if (!now.size) return
    const next = dayOf(o, dayOf(o).getTime() + 36 * 3_600_000).getTime()
    cancelDay = o.clock.setTimer(next, () => {
      cancelDay = undefined
      pump()
    })
  }

  return {
    begin() {
      found = new Map()
      checked = new Set()
    },
    end() {
      const at = o.clock.now()
      for (const key of now.keys()) if (!found.has(key)) freed.set(key, at)
      for (const key of freed.keys()) if (!checked.has(key)) freed.delete(key)
      now = found
      // A limit is told once each time it begins to hold work back.
      const holding = new Set([...now.values()].map(keyOf))
      for (const one of now.values())
        if (!told.has(keyOf(one))) {
          told.add(keyOf(one))
          o.raise('work.limit', {
            app: o.app,
            kind: one.kind,
            which: one.which,
            ...(one.name === undefined ? {} : { name: one.name }),
            ...(one.caller === undefined ? {} : { caller: one.caller }),
            unit: one.unit,
            limit: one.limit,
            used: one.used,
            reserved: one.reserved,
          })
        }
      told = new Set([...told].filter((key) => holding.has(key)))
      armDay()
    },
    check(entry) {
      const key = queueKey(entry.w.run, entry.w.step)
      checked.add(key)
      try {
        // Only the run of an agent, and the runs it called, has a `perRun`.
        if (agents) runAllowed(o, entry.w.run, { workSeconds: entry.w.reserve / 1000 })
      } catch (error) {
        if (error instanceof TentError) return fail(entry, error, true)
        throw error
      }
      // What is out is read anew for each try: one that went out in this pass reserves too.
      const passed = wouldPass(o, entry, reserves)
      if (!passed) return 'go'
      const { standing } = passed
      if (passed.never) return fail(entry, neverFits(standing, entry.w.reserve / 1000), true)
      const row = runner.read(entry.w.run)
      // A request at the door that waits for the work is refused at once, in place of waiting.
      const door = entry.w.of === 'action' && !row?.parent && Reflect.get(Object(row?.given), 'fills') === undefined
      if (door) return fail(entry, limitRefusal(standing), true)
      if (standing.atLimit === 'fail') return fail(entry, limitRefusal(standing), false)
      found.set(key, standing)
      return 'held'
    },
    held: (key) => now.has(key),
    freedAt: (key) => freed.get(key),
    heldBack: (kind) => [...now.values()].filter((one) => one.kind === kind).length,
    shown: (kind) =>
      limitsFor(o, { kind }, reserves)
        .filter((one) => one.which === 'kind')
        .map((one) => ({ unit: one.unit, limit: one.limit, used: one.used, reserved: one.reserved })),
    close() {
      cancelDay?.()
    },
  }
}
