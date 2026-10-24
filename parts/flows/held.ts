import type { TentError } from '../core/index.ts'
import type { Tx } from '../data/index.ts'
import type { Driver, Fired, RunnerEnv, StepAt } from './face.ts'
import type { Queued } from './handOut.ts'
import type { Pass } from './pass.ts'

/** A run that is being worked on in this program. */
export interface AtWork {
  // What the run is counted under among the runs of its flow that work, while it is counted.
  counted?: string
  // The pass that is under way.
  pass?: Pass
  // Something the run waited for arrived while its pass was under way: it is taken up again when the pass ends.
  again: boolean
  // How many runs that it called it waits for now.
  calls: number
  // Settles when the run is no longer worked on.
  left: Promise<void>
}

/** Who waits for the end of a run. */
interface Waiter {
  done(answer: unknown): void
  failed(error: TentError): void
}

/** What one runner holds while it runs: what it was handed, and what is under way in this program. */
export interface Held {
  env: RunnerEnv
  // The live version, once the engine named it.
  live?: string
  // Takes up the runs that stood when the runner started, once: where the start held them, at `takeUp`.
  atStart?: () => void
  drivers: Map<string, { driver: Driver; tries?: number }>
  atWork: Map<string, AtWork>
  waiters: Map<string, Waiter[]>
  // The steps that wait for an event, by the name of the event and then by the key of the step.
  events: Map<string, Map<string, { run: string; at: StepAt }>>
  // How many runs work now, by what the runs of a flow are counted under.
  working: Map<string, number>
  // The runs that were left to wait their turn, by what they are counted under: as many worked beside them as may.
  turns: Map<string, Set<string>>
  // When each key last took its turn under a count, by what the runs are counted under: for `pace.turns`.
  served: Map<string, Map<string, number>>
  // The flows that are paused, as the shared file keeps them: their runs are left as they stand.
  paused: Set<string>
  started: boolean
  closed: boolean
  // Counts the closings: what a pass of an earlier count finds when it ends is written by nobody.
  epoch: number
  // Takes back the one timer of the runner.
  cancel?: () => void
  // The steps that wait in the queue of the engine for a worker, the tasks that are out with their steps, the tries of those steps, and the timer of each task that began.
  queued: Map<string, Queued>
  tasks: Map<string, { run: string; step: StepAt }[]>
  outTries: Map<string, Queued>
  timers: Map<string, () => void>
  // Takes a run up, where it is due and nothing works on it.
  take(run: string): void
  // Takes up the runs that were added or woken inside a write, once that write has ended: with `soon` as the work
  // that wrote ends, and else once the runtime next turns.
  later(run: string, soon?: boolean): void
  // Sets the one timer anew, at the earliest wake.
  rearm(): void
  // Sets the timer anew, and takes up the run that waited longest for its turn under a count, where one is named.
  freed(counted: string | undefined): void
  // Stops a run, with the runs it called; and the runs of a `step.many` of a run that have not ended.
  stop(run: string): void
  // Tells the runner of an event inside the write it belongs to, as `fired` does: the engine's own events too.
  fire(tx: Tx, what: Fired): void
  stopMany(run: string, step: StepAt): void
}
