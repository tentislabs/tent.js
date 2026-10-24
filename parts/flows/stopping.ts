import type { Tx } from '../data/index.ts'
import { flowOf } from './flowOf.ts'
import type { Held } from './held.ts'
import { seenOf } from './kept.ts'
import { fileOf } from './places.ts'
import type { RunRow } from './rows.ts'
import { readSteps } from './rows.ts'
import { isWritten } from '../core/internal.ts'

/** What a run that was stopped keeps while its `onStop` works: the step that was at work, its progress, and how long the run had worked. */
export interface Stopping {
  step?: string
  progress?: unknown
  worked: number
}

/** What a stopped run keeps for its `onStop`, or nothing for a run that no stop left one. */
export function stoppingOf(run: RunRow | undefined): Stopping | undefined {
  const stopped = run?.error?.stopped
  if (!isWritten(stopped)) return undefined
  return {
    ...(typeof stopped.step === 'string' ? { step: stopped.step } : {}),
    ...(stopped.progress === undefined ? {} : { progress: stopped.progress }),
    worked: typeof stopped.worked === 'number' ? stopped.worked : 0,
  }
}

/** Whether a stop leaves a run its `onStop`: its flow or its agent states one, and it was not begun yet. */
export function hasOnStop(held: Held, run: RunRow): boolean {
  if (stoppingOf(run)) return false
  try {
    const flow = flowOf(held, run.version, run.flow)
    // A driven run has the `onStop` of its record too: a run of an agent is a run of a flow.
    return flow.record.onStop !== undefined
  } catch {
    // A run whose flow is gone is stopped with no last work.
    return false
  }
}

/**
 * Takes the write of a stop and the run it stops. Answers the mark that the stop leaves in the row of a run whose
 * `onStop` follows: the step that was at work - the one that began last and has not ended - with what it kept of
 * its progress, and how long the run had worked, so that `onStop` is held to a time of its own.
 */
export function stopMark(tx: Tx, run: RunRow): Record<string, unknown> {
  const open = readSteps(tx, run.id)
    .filter((step) => step.state === 'started' || step.state === 'waiting')
    .filter((step) => !step.name.startsWith('onFail.') && !step.name.startsWith('onStop.'))
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]
  return {
    code: 'T5106',
    name: 'stopped',
    message: `The run ${run.id} was stopped, and its \`onStop\` is its last work.`,
    stopped: {
      ...(open ? { step: open.name } : {}),
      ...(open?.progress === undefined ? {} : { progress: open.progress }),
      worked: run.workedMs,
    },
  }
}

/**
 * Raises the engine's event of a run that ended failed or stopped, `run.failed` or `run.stopped`, inside the write
 * that ends it: a wait for it wakes there, and a flow that listens starts there. `failure` is what a caller would
 * see of the error, with the step that failed.
 */
export function raiseEnded(held: Held, tx: Tx, run: RunRow, state: 'failed' | 'stopped', kept?: unknown): void {
  const file = fileOf(run.id)
  const step: unknown = isWritten(kept) ? kept.step : undefined
  const failure = state === 'failed' ? { ...seenOf(kept), ...(typeof step === 'string' ? { step } : {}) } : undefined
  const data = {
    flow: run.flow,
    run: run.id,
    ...(run.key === undefined ? {} : { key: run.key }),
    ...(failure ? { failure } : {}),
  }
  held.fire(tx, { event: `run.${state}`, data, ...(file ? { file } : {}) })
}
