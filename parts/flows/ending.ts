import { TentError } from '../core/index.ts'
import type { Held } from './held.ts'
import { thrownOf } from './kept.ts'
import type { RunRow } from './rows.ts'
import { runOf } from './places.ts'

/** The error of a caller that waits for a run which was stopped. */
const wasStopped = (run: string): TentError =>
  new TentError('T5106', `The run ${run} was stopped before it ended.`, {
    fix: 'Start the run again where its work is still wanted.',
  })

/**
 * Takes a run whose row holds how it ended. Answers how whoever waits for it is answered: its answer, the error
 * it failed with, or T5106 for a run that was stopped. Nothing for a run that has not ended.
 */
export function endOf(run: RunRow): { answer: unknown } | { error: TentError } | undefined {
  if (run.state === 'done') return { answer: run.answer }
  if (run.state === 'failed') return { error: thrownOf(run.error) }
  if (run.state === 'stopped') return { error: wasStopped(run.id) }
  return undefined
}

/** Tells whoever listens that a run has ended, and answers everyone who waits for it. */
export function ended(held: Held, run: RunRow, state: 'done' | 'failed' | 'stopped'): void {
  held.env.told({ kind: 'run', run: run.id, state })
  const waiters = held.waiters.get(run.id)
  if (!waiters) return
  held.waiters.delete(run.id)
  const row = runOf(held.env, run.id)
  const end = row ? endOf(row) : undefined
  for (const waiter of waiters) {
    if (end && 'answer' in end) waiter.done(end.answer)
    else waiter.failed(end && 'error' in end ? end.error : wasStopped(run.id))
  }
}
