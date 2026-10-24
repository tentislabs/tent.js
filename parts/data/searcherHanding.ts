// What tells a searcher of the builder's own each committed write: a write it fails on waits, as for a sink.
import type { Cancel, Clock } from '../core/internal.ts'

/**
 * What is told of a searcher that failed on a write: the number of that write, and what it threw. `closed`: what
 * waited for it passed the bound and was let go, at the write of that number.
 */
export interface SearcherFailed {
  searcher: 'failed' | 'closed'
  n: number
  error: unknown
}

/** What tells a searcher each committed write, in order. */
export interface SearcherHanding {
  /**
   * Tells the searcher of one more write, by the work that tells it, after the writes that wait. `size` answers the
   * bytes the write holds, and is asked only where it waits.
   */
  tell(n: number, work: () => void, size: () => number): void
  /** Tells the searcher writes again after it was let go: at an opening, which hands it the rows it does not hold. */
  start(): void
  /** Lets go of what waits, and of the timer. */
  stop(): void
}

/**
 * Takes the most bytes that may wait, the wait after a failure, the clock, and what is told of a failure. Answers
 * what tells a searcher each committed write, one at a time and in order. A write the searcher fails on is told to
 * `noted` with its number, and is handed again after the wait, and then after six times that, each time, with the
 * writes after it held behind it: the write itself stands, and is answered as done. Past the bound of what waits,
 * the searcher is let go, as a sink is closed: `noted` is told, what waited is dropped, and it is told no write
 * until `start`.
 */
export function searcherHanding(o: {
  kept: number
  wait: number
  clock: Clock
  noted?: (what: SearcherFailed) => void
}): SearcherHanding {
  let waiting: { n: number; work: () => void; size: () => number; bytes: number }[] = []
  let held = 0
  let tries = 0
  let failure: unknown
  let resting: Cancel | undefined
  let closed = false

  const letGo = (): void => {
    resting?.()
    resting = undefined
    waiting = []
    held = 0
    tries = 0
  }
  /** Counts the bytes of a write that waits, and lets the searcher go where what waits passes the bound. */
  const count = (one: (typeof waiting)[number]): boolean => {
    if (one.bytes === 0) {
      one.bytes = one.size()
      held += one.bytes
    }
    if (held <= o.kept) return true
    letGo()
    closed = true
    o.noted?.({ searcher: 'closed', n: one.n, error: failure })
    return false
  }
  const pump = (): void => {
    while (!resting && waiting.length) {
      const [first] = waiting
      try {
        first.work()
      } catch (error) {
        tries++
        failure = error
        o.noted?.({ searcher: 'failed', n: first.n, error })
        if (!count(first)) return
        resting = o.clock.setTimer(o.clock.now() + (tries === 1 ? o.wait : o.wait * 6), () => {
          resting = undefined
          pump()
        })
        return
      }
      waiting.shift()
      held -= first.bytes
      tries = 0
    }
  }

  return {
    tell(n, work, size) {
      if (closed) return
      const one = { n, work, size, bytes: 0 }
      waiting.push(one)
      if (resting && !count(one)) return
      pump()
    },
    start() {
      closed = false
    },
    stop: letGo,
  }
}
