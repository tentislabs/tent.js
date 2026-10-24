import { member } from '../handle.ts'

/** The handle of runs, for code with full access. Every member answers a promise. */
interface Runs {
  read(run: string): Promise<unknown>
  find(o: object): Promise<unknown[]>
  approve(run: string, step: string, data?: unknown, o?: object): Promise<void>
  refuse(run: string, step: string, data?: unknown, o?: object): Promise<void>
  stop(run: string): Promise<void>
  // Every run that the filter fits, stopped or replayed, each as `stop` and `tent runs replay` do one: their count and ids.
  stopAll(filter: Many): Promise<{ count: number; runs: string[] }>
  replayAll(filter: Many & { from?: string }): Promise<{ count: number; runs: string[]; started: string[] }>
  // A paused flow keeps its new starts and its runs that come due, until it is resumed.
  pause(flow: string): Promise<void>
  resume(flow: string): Promise<void>
  // The flows that stand paused.
  paused(): Promise<string[]>
  // A person's rating of a run of an agent, kept with the run as its starter's.
  rate(run: string, o: { score: number; note?: string }): Promise<void>
}

/** Which runs `stopAll` and `replayAll` act on: of a flow, with a key, in a state, added since and before a moment. */
interface Many {
  flow: string
  key?: string
  state?: string | readonly string[]
  since?: Date | number | string
  before?: Date | number | string
}

export const runs: Runs = {
  read: member('runs', 'read'),
  find: member('runs', 'find'),
  approve: member('runs', 'approve'),
  refuse: member('runs', 'refuse'),
  stop: member('runs', 'stop'),
  stopAll: member('runs', 'stopAll'),
  replayAll: member('runs', 'replayAll'),
  pause: member('runs', 'pause'),
  resume: member('runs', 'resume'),
  paused: member('runs', 'paused'),
  rate: member('runs', 'rate'),
}
