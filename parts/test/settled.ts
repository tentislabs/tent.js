import type { App } from '../engine/index.ts'

// How long the runs stand still, in milliseconds, before a run that is queued is taken to wait for a time or for
// the run ahead of it: one that may go now is taken up by its runner well within it.
const stillFor = 50

/** What says where the runs stand: each with its state and the state of each of its steps. */
const standing = (runs: { id: string; state: string; steps: { state: string }[] }[]): string =>
  JSON.stringify(runs.map((run) => [run.id, run.state, run.steps.map((one) => one.state)]))

/**
 * `app.settled()`: takes what answers the app of the machine now. Answers once no run of the app is queued or
 * working, in every file of it: each is done, failed or stopped, or waits for a time, an event or a person. A run
 * that stays queued while nothing moves waits for a time, as a start that its pace keeps, or for the run ahead of it.
 */
export async function settledOf(app: () => App): Promise<void> {
  let was = ''
  let since = performance.now()
  for (;;) {
    const runs = await app().runs.find({ of: 'all' })
    const seen = standing(runs)
    if (seen !== was) {
      was = seen
      since = performance.now()
    }
    const still = performance.now() - since >= stillFor
    if (still && !runs.some((run) => run.state === 'running')) return
    await new Promise<void>((next) => setTimeout(next, 2))
  }
}
