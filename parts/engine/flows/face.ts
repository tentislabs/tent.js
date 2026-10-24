import type { FileName, Wrote } from '../../data/index.ts'
import type { Closing, Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import type { Asked } from '../door/call.ts'
import type { StartedRun } from './words.ts'

/**
 * What the engine holds of the flows of an app that has any: its runner, and the work behind the words that
 * reach it. An app that holds no flow holds none of this, and has loaded nothing of it.
 */
export interface Flowing {
  runner: Runner
  /** Of an app that keeps a data file for each tenant: a file was opened, and its runs are the runner's from here on. */
  fileOpened(file: FileName): void
  /** A file of a tenant is about to close: what its row of the directory keeps of its runs. */
  fileClosing(file: FileName): Closing
  /** The earliest moment at which a run of an open file must wake: now for one that was begun. */
  due(file: FileName): number | undefined
  /**
   * Names the version that runs now. Each waiting run of a flow that states `moveRuns: 'whenSafe'` is tried against
   * it, and the closed files that hold runs of other versions are opened for that first.
   */
  live(version: string): Promise<void>
  /** Whether a run of an open file works now, so that the file is held open. */
  holds(file: FileName): boolean
  /** The earliest moment at which a run of a closed file of a tenant must wake, by the directory. */
  filesDue(): number | undefined
  /** The app closes: the timer over the closed files of tenants is taken away, and set no more. */
  close(): void
  /** `start(flow, input)`: starts a run and does not wait, as part of the write that is open where there is one. */
  start(cx: CallContext, flow: string, input: unknown): StartedRun
  /** `emit(event, data)`: sends an event, as part of the write of the change it is called in. */
  emit(cx: CallContext, event: string, data: unknown): void
  /** A flow that is called from code, and waited for. Nothing for a name that is no flow. */
  call(cx: CallContext, flow: string, input: unknown): Promise<unknown> | undefined
  /** An action that states `worker` or `background`, once its rule and its input passed: its run is added, and waited for within its time. */
  action(cx: CallContext, parent: CallContext | undefined, input: unknown, given: unknown): Promise<unknown>
  /** A flow that is called through the door, or by a program. Nothing for a name that is no flow. */
  offered(flow: string, given: unknown, asked: Asked): Promise<unknown> | undefined
  /** A change that is called inside a step: carried out once for its once-only key. Nothing where the call is in no step. */
  once(
    cx: CallContext,
    change: string,
    input: unknown,
    carry: (parent: CallContext) => unknown,
  ): { value: unknown } | undefined
  /** Is told each row that a write wrote, inside that write: the table triggers fire there. */
  wrote(cx: CallContext, w: Wrote): void
  /**
   * Starts the runner again on the data as it stands now: when the app opens, and after its data was put back.
   * With `hold` the runs that were under way are taken up by `runner.takeUp`, as the opening does once it answered.
   */
  again(o?: { hold?: true }): Promise<void>
  /** The share of the flows in the daily upkeep: finished runs past `runsKept` are removed. */
  upkeep(): void
  /** Whether a run that has not ended is pinned to a version. */
  needs(version: string): boolean
  /**
   * Before a hard switch to a version: each waiting run of a flow that states `moveRuns: 'whenSafe'` is tried
   * against it and moved where its steps still match. Answers the runs of older versions that are left, and
   * whether they refuse the switch. With `stop` they are stopped, and refuse nothing. With `dry` nothing is moved
   * or stopped, and what would be is answered.
   */
  beforeHard(version: string, stop: boolean, dry?: boolean): { refused: boolean; runs: string[] }
}
