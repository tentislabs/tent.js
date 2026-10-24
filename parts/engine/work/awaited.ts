import type { Runner } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { freePlaces, placesAgain } from './counted.ts'
import type { OutTask } from './state.ts'

/** What a writer that opens holds of the tasks that its rows say are out: each is its worker's again where it comes back. */
export interface Awaited {
  /** The tasks that were out to a worker, which it names in its `here`: they are its again. */
  claim(worker: string, named: Set<string>): OutTask[]
  /** Whether a task waits for its worker to come back, so that it may be sent again. */
  has(task: string): boolean
  /** The tasks that wait for their worker: what they reserve stands until they end. */
  out(): OutTask[]
}

/**
 * Takes the app, its runner, how long a worker may be silent, and what is told once the wait ended. Answers what
 * waits for the workers of the tasks that the rows say are out: each worker is waited for by the rule of the times,
 * counted from the opening. A task carried out here was lost with the program, and one whose worker does not come
 * back is lost to the writer's own stop, which counts against nothing.
 */
export function awaitedAt(o: Opened, runner: Runner, within: number, ended: () => void): Awaited {
  const lost = (task: string, steps: unknown[]): void => {
    freePlaces(o, task)
    void runner
      .ended(
        task,
        steps.map(() => ({ lost: 'writer' as const })),
      )
      .catch(() => undefined)
  }
  const awaited = new Map<string, OutTask & { worker: string }>()
  for (const one of runner.outNow()) {
    if (one.worker === 'here') {
      lost(one.task, one.steps)
      continue
    }
    awaited.set(one.task, {
      task: one.task,
      kind: one.kind,
      version: '',
      steps: one.steps,
      at: one.at,
      sent: true,
      started: one.startedAt !== undefined,
      beside: one.steps.length > 1,
      worker: one.worker,
      // What the task reserves is worked out anew from the rows, as the writer opens.
      reserve: one.reserve,
    })
  }
  // The places that the calls of those tasks held before the opening are taken again, until their `did`.
  void placesAgain(o, new Set(awaited.keys())).catch(() => undefined)
  if (awaited.size)
    o.clock.setTimer(o.clock.now() + within, () => {
      for (const one of [...awaited.values()]) {
        awaited.delete(one.task)
        lost(one.task, one.steps)
      }
      ended()
    })
  return {
    claim(worker, named) {
      const claimed: OutTask[] = []
      for (const one of [...awaited.values()])
        if (one.worker === worker && named.has(one.task)) {
          awaited.delete(one.task)
          claimed.push(one)
        }
      return claimed
    },
    has: (task) => awaited.has(task),
    out: () => [...awaited.values()],
  }
}
