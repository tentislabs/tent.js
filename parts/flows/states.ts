import type { RunState } from './face.ts'

/** The states of a run that has not ended. */
export const unfinished: RunState[] = ['queued', 'running', 'waiting']

/** Whether a run has ended: done, failed or stopped. */
export const isFinal = (run: { state: string }): boolean =>
  run.state === 'done' || run.state === 'failed' || run.state === 'stopped'
