import { askingKept } from '../mcp/asked.ts'
import { streamsOpen } from '../mcp/kept.ts'
import type { Opened } from '../opened.ts'

// For each app that may sleep: how many uses are under way, the moment the last one ended or the app opened, and
// the moment the last use from outside ended, which a waking is not.
const uses = new WeakMap<Opened, { now: number; last: number; outside?: number }>()

const held = (o: Opened): { now: number; last: number; outside?: number } => {
  const found = uses.get(o) ?? { now: 0, last: o.clock.now() }
  uses.set(o, found)
  return found
}

/** Counts a use of an app for as long as its work goes on, and notes the moment it ended. */
export async function using<T>(o: Opened, work: () => Promise<T>): Promise<T> {
  const use = held(o)
  use.now += 1
  try {
    return await work()
  } finally {
    use.now -= 1
    use.last = o.clock.now()
    use.outside = use.last
  }
}

/** Holds an app awake for as long as work goes on, and counts it as no use: the moment of the last use stays. */
export async function holding<T>(o: Opened, work: () => Promise<T>): Promise<T> {
  const use = held(o)
  use.now += 1
  try {
    return await work()
  } finally {
    use.now -= 1
  }
}

/** The moment at which the last use of an app from outside ended, or nothing where none did since it opened. */
export const usedAt = (o: Opened): number | undefined => held(o).outside

/** The moment at which the last use of an app ended, or at which it opened where nothing used it since. */
export const lastUse = (o: Opened): number => held(o).last

/**
 * Whether an app is in use now: a request or a member that stands for a caller is under way, a call of an action
 * is in flight, a live connection or the link of a worker is open, a run works, or work of it is out on a worker
 * or waits for one. A run that waits, and a schedule, are no use.
 */
export function inUse(o: Opened): boolean {
  if (held(o).now > 0 || o.inFlight.size > 0 || (o.hub?.open() ?? 0) > 0) return true
  // A kept stream of MCP, and an ask of `/_t/ask` with what is kept of its yes.
  if (streamsOpen(o) > 0 || askingKept(o)) return true
  if (
    o.work &&
    (o.work.workers().length > 0 || o.work.work().some((one) => Reflect.get(one, 'out') || Reflect.get(one, 'waiting')))
  )
    return true
  return (o.flows?.runner.find({ states: ['queued', 'running'] }).length ?? 0) > 0
}
