import type { App } from '../engine/index.ts'
import type { TestClock } from './clock.ts'
import { firstDueOf, movedAtOf } from './clock.ts'

// How long the runs stand still, in milliseconds, before a run that is queued is taken to wait for a time or for
// the run ahead of it: one that may go now is taken up by its runner well within it.
const stillFor = 50

// How long after the clock was moved a run that waits may still be one that came due and is not taken up yet: a
// busy computer takes up a run that a move made due later than `stillFor`.
const afterMove = 1000

/** What says where the runs stand: each with its state and the state of each of its steps. */
const standing = (runs: { id: string; state: string; steps: { state: string }[] }[]): string =>
  JSON.stringify(runs.map((run) => [run.id, run.state, run.steps.map((one) => one.state)]))

/**
 * `app.settled()`: takes what answers the app of the machine now. Answers once no run of the app is queued or
 * working, in every file of it: each is done, failed or stopped, or waits for a time, an event or a person. A run
 * that stays queued while nothing moves waits for a time, as a start that its pace keeps, or for the run ahead of it.
 * On a held clock, where nothing else is under way, it moves the clock once to the timer that falls due first, and
 * answers once the runs settle again.
 */
export async function settledOf(app: () => App, moves: TestClock): Promise<void> {
  let was = ''
  let since = performance.now()
  let movedOnce = false
  for (;;) {
    const runs = await app().runs.find({ of: 'all' })
    const seen = standing(runs)
    if (seen !== was) {
      was = seen
      since = performance.now()
    }
    const still = performance.now() - since >= stillFor
    // A run that waits, and has not moved since the clock was moved, may be one the move made due.
    const movedAt = movedAtOf(moves)
    const dueByMove =
      since <= movedAt && performance.now() - movedAt < afterMove && runs.some((run) => run.state === 'waiting')
    if (still && !dueByMove && !runs.some((run) => run.state === 'running')) {
      const first = firstDueOf(moves)
      if (first === undefined || movedOnce) return
      movedOnce = true
      moves.set(first)
      was = ''
      continue
    }
    await new Promise<void>((next) => setTimeout(next, 2))
  }
}
