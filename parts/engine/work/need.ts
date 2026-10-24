import { failureOf } from '../door/failure.ts'
import { storedLimit } from '../limits.ts'
import type { Workers } from '../makers.ts'
import type { Opened } from '../opened.ts'
import { kindStated } from './order.ts'
import type { Holding } from './holding.ts'
import type { InQueue, Joined } from './state.ts'

/** What tells the host of the machines what waits and what is idle. */
export interface NeedWatch {
  // Looks again: after the queue or a worker changed, and on its own every `needEvery`.
  look(): void
  close(): void
}

/** Tells a host, and logs what it throws: what it throws changes nothing. */
function told(o: Opened, work: () => void): void {
  try {
    work()
  } catch (error) {
    failureOf(o, 'Workers', error)
  }
}

/**
 * Takes the app, what waits and the workers that joined, and the host's `Workers` where the program has one.
 * For each kind, `need` is told when work begins to wait, again every `needEvery` while any waits, and once with
 * `waiting: 0` when none waits any more, and `work.waits` is raised at the first and the last of those. A worker
 * that held no task for `idleAfter` of its first kind raises `worker.idle` once, and `idle` is told then and
 * again every `needEvery` while it stays so.
 */
export function needWatch(
  o: Opened,
  waiting: () => Iterable<InQueue>,
  all: () => Map<string, Joined>,
  host: Workers | undefined,
  holding: Pick<Holding, 'heldBack' | 'shown'>,
): NeedWatch {
  // The kinds that work waits for, with when each was last told; and the workers that were told idle, with when.
  const toldWaits = new Map<string, number>()
  const toldIdle = new Map<string, number>()
  let cancel: (() => void) | undefined
  let closed = false

  function look(): void {
    if (closed) return
    const now = o.clock.now()
    const every = storedLimit(o.description, 'needEvery')
    const queued = [...waiting()]
    const kinds = new Set([...queued.map((one) => one.w.kind), ...toldWaits.keys()])
    for (const kind of kinds) {
      const of = queued.filter((one) => one.w.kind === kind)
      const last = toldWaits.get(kind)
      const oldest = of.length ? now - Math.min(...of.map((one) => one.w.since)) : 0
      // How many a limit holds back, and the limits of a kind that states any, with what was used and reserved.
      const heldBack = of.length ? holding.heldBack(kind) : 0
      const limits = holding.shown(kind)
      const said = {
        app: o.name,
        mode: o.mode,
        kind,
        waiting: of.length,
        heldBack,
        oldest,
        ...(limits.length ? { limits } : {}),
      }
      if (!of.length) {
        toldWaits.delete(kind)
        told(o, () => host?.need(said))
        o.raise('work.waits', { app: o.app, kind, waiting: 0, heldBack: 0, oldest: 0 })
        continue
      }
      if (last !== undefined && now - last < every) continue
      toldWaits.set(kind, now)
      told(o, () => host?.need(said))
      if (last === undefined) o.raise('work.waits', { app: o.app, kind, waiting: of.length, heldBack, oldest })
    }
    for (const j of all().values()) {
      const kind = j.kinds[0] ?? 'any'
      const since = j.freeSince
      const idleFor = kindStated(o.description, kind).idleAfter
      if (!j.joined || j.out.size || now - since < idleFor) {
        toldIdle.delete(j.id)
        continue
      }
      const last = toldIdle.get(j.id)
      if (last !== undefined && now - last < every) continue
      toldIdle.set(j.id, now)
      told(o, () => host?.idle({ app: o.name, mode: o.mode, kind, worker: j.id, since }))
      if (last === undefined) o.raise('worker.idle', { app: o.app, kind, worker: j.id, since })
    }
    arm(every)
  }

  /** Looks again after `needEvery` while work waits, and when a worker that holds no task comes to `idleAfter`. */
  function arm(every: number): void {
    cancel?.()
    cancel = undefined
    if (closed) return
    const now = o.clock.now()
    const moments: number[] = toldWaits.size ? [now + every] : []
    for (const j of all().values()) {
      if (!j.joined || j.out.size) continue
      const due = j.freeSince + kindStated(o.description, j.kinds[0] ?? 'any').idleAfter
      moments.push(toldIdle.has(j.id) ? now + every : Math.max(due, now + 1))
    }
    if (moments.length) cancel = o.clock.setTimer(Math.min(...moments), look)
  }

  return {
    look,
    close() {
      closed = true
      cancel?.()
    },
  }
}
