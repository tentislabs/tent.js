import type { ConnectEnv } from './env.ts'

/** The limits of a service on how many calls start in a second and in a minute, and how many may be under way. */
export interface Bounds {
  perSecond?: number
  perMinute?: number
  atOnce?: number
}

/** What waits its turn under the limits of one service, counted in memory. */
export interface Turns {
  /** Waits until a try may start, and counts it. Answers what ends the try for the count of those under way. */
  take(signal: AbortSignal): Promise<() => void>
}

/** The error that a signal carries, or one of its own where it carries none. */
const reasonOf = (signal: AbortSignal): unknown => signal.reason ?? new Error('The call was ended.')

/** Waits for so many milliseconds by the clock of the env, and fails with what the signal carries where it ends first. */
export async function waited(env: ConnectEnv, ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw reasonOf(signal)
  let stop: (() => void) | undefined
  const ended = new Promise<never>((_, refuse) => {
    stop = () => refuse(reasonOf(signal))
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    await Promise.race([env.sleep(ms), ended])
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
  }
}

/**
 * Takes what the engine hands `connect`, and the limits of one service. Answers what makes each try wait its
 * turn: no more than `perSecond` starts within a second and `perMinute` within a minute, a try again among them,
 * and no more than `atOnce` under way, in the order the tries came in. The wait ends with the signal of the call.
 */
export function turnsOf(env: ConnectEnv, bounds: Bounds): Turns {
  const starts: number[] = []
  let under = 0
  const waiting: (() => void)[] = []
  /** How long a start must wait now, by the counts of the last second and the last minute. */
  const due = (): number => {
    const now = env.now()
    let wait = 0
    for (const [most, span] of [
      [bounds.perSecond, 1000],
      [bounds.perMinute, 60_000],
    ] as const) {
      if (most === undefined) continue
      const within = starts.filter((at) => at > now - span)
      if (within.length >= most) wait = Math.max(wait, within[within.length - most] + span - now)
    }
    return wait
  }
  /** Frees a place: it is handed to the first call that waits, which so keeps it counted, or it is counted no more. */
  const free = (): void => {
    const next = waiting.shift()
    if (next) next()
    else under--
  }
  return {
    async take(signal) {
      // A call that comes while others wait for a place waits behind them, also where a place was just freed.
      if (bounds.atOnce !== undefined && (under >= bounds.atOnce || waiting.length > 0))
        await new Promise<void>((done, refuse) => {
          if (signal.aborted) return refuse(reasonOf(signal))
          const wake = (): void => {
            signal.removeEventListener('abort', stop)
            done()
          }
          // A wait that ends takes its waker away, so that the next freed place goes to a call that still waits.
          const stop = (): void => {
            const at = waiting.indexOf(wake)
            if (at >= 0) waiting.splice(at, 1)
            refuse(reasonOf(signal))
          }
          signal.addEventListener('abort', stop, { once: true })
          waiting.push(wake)
        })
      else under++
      try {
        for (let wait = due(); wait > 0; wait = due()) await waited(env, wait, signal)
      } catch (error) {
        free()
        throw error
      }
      starts.push(env.now())
      // Starts older than a minute count for nothing any more.
      while (starts.length && starts[0] <= env.now() - 60_000) starts.shift()
      let ended = false
      return () => {
        if (ended) return
        ended = true
        free()
      }
    },
  }
}
