import { later, TentError } from '../core/index.ts'
import type { Clock } from '../core/internal.ts'

/** The clock of a test app, as a test holds it. */
export interface TestClock {
  /**
   * Takes a length of time in words, as `'3 days'`. Moves the time of the app forward by it, and calls each timer
   * of the app that falls due on the way, in the order of their moments. Throws T0027 for a length that does not
   * read, and for one that moves the time back or not at all.
   */
  advance(length: string): void
}

// Kept from the start of the program: the clock of the runtime is swapped for one that fails while a query runs.
const realNow = Date.now

// How far each clock of a test stands ahead of the time of the system, in milliseconds, which the pages of a test follow.
const aheads = new WeakMap<TestClock, () => number>()

/** How far a clock of a test stands ahead of the time of the system now, in milliseconds. */
export const aheadOf = (moves: TestClock): number => aheads.get(moves)?.() ?? 0

// What is told each time a clock of a test is moved: the pages of the test, which move their own time with it.
const movers = new WeakMap<TestClock, Set<(ahead: number) => void>>()

// When each clock of a test was last moved, by the time of the program, which `settled` reads.
const moved = new WeakMap<TestClock, number>()

/** When a clock of a test was last moved, by `performance.now()`, or never. */
export const movedAtOf = (moves: TestClock): number => moved.get(moves) ?? Number.NEGATIVE_INFINITY

/** Names what is told how far the clock stands ahead each time a test moves it. Answers what stops telling it. */
export function onMoved(moves: TestClock, heard: (ahead: number) => void): () => void {
  const told = movers.get(moves) ?? new Set()
  movers.set(moves, told)
  told.add(heard)
  return () => void told.delete(heard)
}

/**
 * Answers the clock that a test app runs on, and what a test moves it with. The time goes on as the time of the
 * system does, from the moment the clock is made, and `advance` moves it forward beside that.
 */
export function testClock(): { clock: Clock; moves: TestClock } {
  let ahead = 0
  let timers: { at: number; run: () => void }[] = []
  let waiting: NodeJS.Timeout | undefined
  const now = (): number => realNow() + ahead
  /** Has the runtime call the timer that is due first, when its moment comes by itself. */
  const wait = (): void => {
    clearTimeout(waiting)
    const [first] = timers.sort((a, b) => a.at - b.at)
    if (!first) return
    // The longest wait that a timer of the runtime takes: a later moment is waited for again when this one ends.
    waiting = setTimeout(due, Math.min(Math.max(0, first.at - now()), 2_000_000_000))
    waiting.unref()
  }
  /** Calls every timer whose moment has come, the earliest first. A timer that one of them sets is seen too. */
  const due = (upTo = now()): void => {
    for (;;) {
      const [first] = timers.sort((a, b) => a.at - b.at)
      if (!first || first.at > upTo) break
      timers = timers.filter((one) => one !== first)
      // A timer is called at its own moment, so that what it reads of the clock is the moment it was set for.
      ahead = Math.max(ahead, first.at - realNow())
      first.run()
    }
    wait()
  }
  const clock: Clock = {
    now,
    setTimer(at, run) {
      const timer = { at, run }
      timers.push(timer)
      wait()
      return () => {
        timers = timers.filter((one) => one !== timer)
        wait()
      }
    },
  }
  const moves: TestClock = {
    advance(length) {
      const ms = later(new Date(0), length).getTime()
      if (!(ms > 0))
        throw new TentError(
          'T0027',
          `The clock of a test app is moved forward, and ${JSON.stringify(length)} moves it nowhere.`,
          {
            fix: "Hand `advance` a length of time that is more than nothing, as `'3 days'`.",
          },
        )
      const to = now() + ms
      due(to)
      ahead = Math.max(ahead, to - realNow())
      wait()
      moved.set(moves, performance.now())
      for (const one of movers.get(moves) ?? []) one(ahead)
    },
  }
  aheads.set(moves, () => ahead)
  return { clock, moves }
}
