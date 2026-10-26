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
  /**
   * Takes a moment: a `Date`, a number of milliseconds, or a text that a `Date` reads. Sets the time of the app to
   * it, as a clock of the system is set: each timer due by then is called once, at that moment, in the order of their
   * moments. Throws T0027 for a moment that does not read.
   */
  set(moment: Date | number | string): void
}

// The time of the system, read where no swap of `Date` reaches: a query swaps it for one that fails, and under
// `tent test` the code of a call reads the clock of its app through it, this clock among them.
const realNow = (): number => Math.floor(performance.timeOrigin + performance.now())

// How far each clock of a test stands ahead of the time of the system, in milliseconds, which the pages of a test follow.
const aheads = new WeakMap<TestClock, () => number>()

/** How far a clock of a test stands ahead of the time of the system now, in milliseconds. */
export const aheadOf = (moves: TestClock): number => aheads.get(moves)?.() ?? 0

// What is told each time a clock of a test is moved: the pages of the test, which move their own time with it.
const movers = new WeakMap<TestClock, Set<(ahead: number) => void>>()

// When each clock of a test was last moved, by the time of the program, which `settled` reads.
const moved = new WeakMap<TestClock, number>()

// The moment of the timer that falls due first on each held clock, which `settled` moves a held clock to.
const firstDue = new WeakMap<TestClock, () => number | undefined>()

/** The moment of the timer that falls due first on a held clock, or nothing for a clock that runs on, or with none. */
export const firstDueOf = (moves: TestClock): number | undefined => firstDue.get(moves)?.()

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
 * system does, from the moment the clock is made, and `advance` and `set` move it beside that. A held clock stands
 * at the moment it was made until the test moves it, as the fake timers of Jest, Vitest and Sinon stand: a timer of
 * the app comes due only as the test moves the time past it.
 */
export function testClock(o: { held?: boolean } = {}): { clock: Clock; moves: TestClock } {
  let ahead = 0
  let timers: { at: number; run: () => void }[] = []
  let waiting: NodeJS.Timeout | undefined
  const made = realNow()
  // A held clock stands at its moment: how far it stands from the system's is the system's time going on, taken back.
  const now = (): number => (o.held ? made : realNow()) + ahead
  /**
   * Has the runtime call the timer that is due first, when its moment comes by itself. On a held clock only a timer
   * that is due already is called: the work the app sets for now runs, and nothing later comes due by itself.
   */
  const wait = (): void => {
    clearTimeout(waiting)
    const [first] = timers.sort((a, b) => a.at - b.at)
    if (!first || (o.held && first.at > now())) return
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
      ahead = Math.max(ahead, first.at - (o.held ? made : realNow()))
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
  /**
   * Moves the time to a moment and tells who follows. `step` walks there, calling each timer due on the way at its
   * own moment; else the time jumps there, as a set clock of the system does, and each timer due by then is called
   * once at the new moment, so a timer that comes back is set from there.
   */
  const moveTo = (to: number, step: boolean): void => {
    const from = o.held ? made : realNow()
    if (step) due(to)
    ahead = step ? Math.max(ahead, to - from) : to - from
    if (!step) due()
    wait()
    moved.set(moves, performance.now())
    for (const one of movers.get(moves) ?? []) one(now() - realNow())
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
      moveTo(now() + ms, true)
    },
    set(moment) {
      const to = moment instanceof Date ? moment.getTime() : typeof moment === 'number' ? moment : Date.parse(moment)
      if (!Number.isFinite(to))
        throw new TentError(
          'T0027',
          `The clock of a test app is set to ${JSON.stringify(moment)}, which is no moment.`,
          {
            fix: "Hand `set` a `Date`, a number of milliseconds, or a moment as text, as `'2030-01-01T09:00:00Z'`.",
          },
        )
      moveTo(to, false)
    },
  }
  // A page of the test follows how far the clock stands from the time of the system.
  aheads.set(moves, () => now() - realNow())
  if (o.held)
    firstDue.set(moves, () =>
      timers.reduce<number | undefined>((first, one) => Math.min(first ?? one.at, one.at), undefined),
    )
  return { clock, moves }
}
