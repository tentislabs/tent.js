import type { Caller, Db, TentError, User } from '../core/index.ts'
import type { Clock, Description } from '../core/internal.ts'
import type { FileName, Files, Store, Tx } from '../data/index.ts'

/** Who caused a run. `fresh` marks a visitor id that the starting call itself was given. */
export interface By {
  kind: 'user' | 'key' | 'visitor' | 'system'
  id?: string
  fresh?: true
}

/** What the tool call above a run may do. */
export type Leave = 'agreed' | 'trusted' | 'none'

/** One step of a run: its name, and which pass of that name it is. */
export interface StepAt {
  name: string
  repeat: number
}

/** The moment a saved step ended: of a `step.first`, the entry whose last step ended earliest goes on. */
export interface StepEnded {
  name: string
  repeat: number
  at: number
}

/** Where work of a run stands: the run, its flow and version, whose rights it has, and its step where it is in one. */
export interface At {
  run: string
  flow: string
  version: string
  as: Caller
  leave?: Leave
  step?: StepAt
  // What the code of the flow is handed on this pass, read back through its types: for a step carried out on a thread.
  handed?: { input: unknown; event: unknown; user?: User }
  // When each saved step of the pass ended: for a step carried out on a thread, as on the main pass.
  ended?: StepEnded[]
  // Ends when the run is stopped, so that a model call, a fetch or a Python call of a step in flight ends with it.
  signal?: AbortSignal
}

/** The states of a run. */
export type RunState = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'stopped'

/** What the runner tells of a step and of a run. */
export type Told =
  | {
      kind: 'step'
      run: string
      name: string
      repeat: number
      state: 'started' | 'waiting' | 'done' | 'failed'
      ms?: number
      show?: unknown
      ask?: number
      runs?: string[]
    }
  | { kind: 'run'; run: string; state: RunState }

/** What the failure of a run is told as, to a flow's own `onFail`. */
interface Failure {
  step?: string
  code: string
  message: string
}

/** What the work of a step is handed. */
export interface Working {
  rows: Record<string, unknown>
  progress(): unknown
  progress(value: unknown): Promise<void>
  stopping(): boolean
  back(): never
  say(value: unknown): void
}

/** What a step may state beside its name and its work. */
export interface StepOptions {
  background?: boolean | 'here'
  worker?: string
  time?: string | number
  reserve?: string | number
  tries?: number | { max: number; wait?: string | number }
  rows?: Record<string, object>
  uses?: (object | string)[]
  remember?: { key: unknown[]; for?: string; kind?: boolean; version?: string; shared?: string }
  onFail?: 'goOn'
  leave?: Leave
  // What the step saves is sealed, and opened only when its run reads it back.
  sealed?: true
  // What the row of the step keeps to show, as a step of a sequence keeps its tool and its input.
  show?: unknown
}

/** What a step that states `onFail: 'goOn'` answers once its tries are used up. */
export interface GoneOn {
  failed: true
  code: string
  message: string
}

/** The step tools, which the `run` of a flow is handed as `step`. */
export interface StepTools {
  (name: string, work: (the: Working) => unknown, o?: StepOptions): Promise<unknown>
  wait(time: string | Date, o?: { name?: string }): Promise<void>
  waitFor(
    what: string | object,
    o?: { timeout?: string; show?: unknown; name?: string; where?: object },
  ): Promise<{ approved?: boolean; data?: unknown; shown?: unknown; timedOut?: true }>
  all(work: unknown[], each?: (entry: never, i: number) => Promise<unknown>): Promise<unknown[]>
  first(work: unknown[], each?: (entry: never, i: number) => Promise<unknown>): Promise<unknown>
  // A run of `flow` for each entry of a list or of a plan, which the step waits for. `flow` is the flow or its name.
  many(
    name: string,
    entries: unknown,
    flow: unknown,
    o?: { chunk?: number; atOnce?: number; mayFail?: number | string },
  ): Promise<unknown>
  now(): Date
  random(): number
  done(value?: unknown): Promise<never>
  // Ends the run as done, and in the same write starts a new run of the flow with this input, its key and starter.
  again(input?: unknown): Promise<never>
}

/**
 * What a driver is handed as `step`: the tools that wait, run side by side and draw a value, with a step that may
 * say how often it is tried, narrow its leave, keep what it shows, and, in the run that the engine makes for an
 * action, where its work goes, with its rows, its time and what it reserves.
 */
export type DriverSteps = Pick<StepTools, 'wait' | 'waitFor' | 'all' | 'first' | 'now' | 'random'> &
  ((
    name: string,
    work: (the: Working) => unknown,
    o?: Pick<StepOptions, 'tries' | 'leave' | 'show' | 'background' | 'worker' | 'rows' | 'time' | 'reserve'>,
  ) => Promise<unknown>)

/** The `run` of a flow, or its `onFail`: its code, or a function that carries out its stored body. */
export type FlowBody = (o: {
  event: unknown
  input: unknown
  user?: User
  step: StepTools
  db: Db
  failure?: Failure
  // For a flow's own `onStop`: the step that was at work when the run was stopped, and what it kept of its progress.
  stopped?: { step?: string; progress?: unknown }
  tick?: () => void
  // With `pace.batch`: the events of the starts that were gathered into the run.
  events?: unknown[]
}) => Promise<unknown>

/** What runs a flow record that another part supplies. */
export type Driver = (run: {
  id: string
  top: string
  version: string
  record: object
  input: unknown
  event: unknown
  given?: object
  starter: Caller
  // The `leave` of the tool call that the run stands under, where it stands under one.
  leave?: Leave
  // The moment the run was started, in milliseconds.
  startedAt: number
  step: DriverSteps
  signal: AbortSignal
  worked(): number
  // Says that the conversation of the run is held by another agent from the write that ends the run.
  handOver(to: string): void
}) => Promise<unknown>

/** A try of a step that waits for a worker of a kind. `alone`: it is handed out alone. `reserve`: ms held against a limit of use. */
export interface Waiting {
  run: string
  flow: string
  of: 'flow' | 'action'
  step: StepAt
  version: string
  kind: string
  since: number
  alone?: true
  reserve: number
  rows?: Record<string, object>
  // What the code states that it uses, by name: the writer holds what the work asks for to it.
  uses?: string[]
}

/** What a try that is handed out carries: its number, its time, who started its run, and what the run holds. */
export interface Carried {
  try: number
  ms: number
  startedBy: By
  leave?: Leave
  // As the code of the flow is handed them: read back through their types.
  input?: unknown
  event?: unknown
  saved: { name: string; repeat: number; result?: unknown; failed?: { code: string; message: string } }[]
  progress?: { value: unknown; files: string[] }
  // When each saved step ended, which the worker replays the run by.
  ended?: StepEnded[]
}

/** How a try that was out ended. `beside`: another task was out to that worker beside it. */
export type Ended =
  | { done: unknown }
  | { failed: TentError; cause?: 'memory' }
  | { lost: 'said' }
  | { lost: 'silent'; beside: boolean }
  | { lost: 'writer' }

/** A task that is out, as the runner keeps it in the rows of its steps. */
export interface OutNow {
  task: string
  worker: string
  kind: string
  at: number
  startedAt?: number
  ms: number
  reserve: number
  // The leave of the run of each step, where a tool call stands above it.
  steps: { run: string; step: StepAt; leave?: Leave }[]
}

/** Everything the engine knows that the runner needs. */
export interface RunnerEnv {
  // A try of a step waits for a worker of a kind, and nothing is written; it waits no more; a task that is out is to end. Left out by an engine that takes no workers.
  queue?(w: Waiting): void
  unqueue?(run: string, step: StepAt): void
  take?(task: string): void
  store: Store
  // Where an app keeps a data file for each tenant: a run is read and written in the file that its id names.
  files?: Files
  clock: Clock
  description(version: string): Description
  body(version: string, flow: string, which?: 'onFail' | 'onStop'): FlowBody | undefined
  // An arrow of a flow that its record holds as code: `key`, and the key of the event of `stopOn` at a place, `stopOn.0`.
  arrow?(version: string, flow: string, which: string): ((handed: object) => unknown) | undefined
  inside<T>(at: At, work: () => T): T
  db(at: At): Db
  caller(by: By): Caller
  // `working` is what the work of the step keeps of where it is, and asks of its machine.
  onThread(at: At, working?: Working): Promise<unknown>
  told(what: Told): void
  // A start was answered the run of its key that was under way, and started nothing: for the log.
  joined?(what: { run: string; flow: string; key?: string }): void
  // What a sealed step saves, sealed with the key of the secrets and bound to its run, its step and its repeat, and
  // opened again. Each throws T0019 with no key at hand.
  seal?(at: { run: string; name: string; repeat: number }, value: unknown): string
  open?(at: { run: string; name: string; repeat: number }, sealed: string): unknown
  // The input of a run that `step.again` starts, held to the `input` of its flow: T0002 where it does not fit.
  input?(version: string, flow: string, given: unknown): unknown
  // A start was dropped by `pace.drop`: for the log and the count.
  dropped?(what: { flow: string; key?: string }): void
  // What the work of a step said, for whoever follows its run. Left out by an engine that follows no runs.
  say?(at: At, value: unknown): void
  removed(runs: string[], tx: Tx): void
  // The remembered answer of a step that states `remember`, asked before its work, and the answer of such a step, to remember.
  remembered?(at: At, r: NonNullable<StepOptions['remember']>): Promise<{ answer: unknown } | undefined>
  remember?(at: At, r: NonNullable<StepOptions['remember']>, answer: unknown): void
  // The try of one entry of a task that was out is settled in this write, which books its machine time. Left out by an engine that counts none.
  settled?(
    tx: Tx,
    o: { task: string; run: string; step: StepAt; entry: number; entries: number; end: Ended; shared: boolean },
  ): void
}

/** A run that is added. */
export interface NewRun {
  flow: string
  // The file of a tenant that the run lives in. Left out, it lives where the run that called it lives, and else in the shared file.
  file?: FileName
  version: string
  input?: unknown
  event?: unknown
  startedBy: By
  parent?: At
  from?: At
  call?: string
  thread?: string
  then?: 'refuse' | 'wait' | 'stop'
  leave?: Leave
  given?: object
  // The trace that the run stands in.
  trace?: string
}

/** A table write or an emitted event, told inside the write it belongs to. */
export type Fired = (
  | {
      table: string
      kind: 'added' | 'changed' | 'removed'
      row: Record<string, unknown>
      before?: object
      columns?: string[]
      // The engine filled these columns: only a trigger that names one of them fires.
      filled?: true
    }
  | { event: string; data: unknown }
) & { leave?: Leave; agreed?: string[]; file?: FileName }

/** One step of a run, as whoever reads the run sees it. */
export interface StepView {
  name: string
  repeat: number
  state: string
  ms?: number
  show?: unknown
  ask?: number
  result?: unknown
  error?: TentError
}

/** A run, as whoever reads it sees it. */
export interface RunView {
  id: string
  flow: string
  kind: string
  version: string
  state: RunState
  startedBy: By
  as: 'system' | 'starter'
  top: string
  thread?: string
  parent?: string
  parentStep?: StepAt
  input?: unknown
  event?: unknown
  answer?: unknown
  error?: TentError
  used: object[]
  given?: object
  key?: string
  // The run that this one goes on from.
  from?: string
  trace?: string
  steps: StepView[]
}

/** The place of a call inside a step: what is called, and how many calls of that name the step made before it. */
export interface Place {
  name: string
  nth: number
}

/** What `find` is asked for. */
export interface RunsAsked {
  flow?: string
  thread?: string
  startedBy?: By
  top?: string
  states?: RunState[]
  newest?: number
  key?: string
  // The runs that were added at or after this moment, and before that one, in milliseconds.
  since?: number
  before?: number
}

/** Which runs work on many runs at once acts on: of a flow, with a key, in a state, added since and before a moment in milliseconds. */
export interface Bulk {
  flow: string
  key?: string
  state?: RunState | RunState[]
  since?: number
  before?: number
}

/** What the runner says of the runs of a file that is about to close. */
export interface Closing {
  // The earliest moment at which a run of the file must wake.
  dueAt?: number
  // The versions that its unfinished runs are pinned to.
  versions: string[]
  // The names of the events that its runs wait for.
  waits: string[]
}

/** The runner of one app. */
export interface Runner {
  live(version: string): void
  // The names of the events that the runs of the shared file and of the open files wait for.
  waits(): string[]
  // Wakes the waits of one file for an event that was emitted in another, inside a write of that file. It starts nothing.
  handed(tx: Tx, what: { event: string; data: unknown; file?: FileName }): void
  // A file of a tenant was opened: its runs are read, those that are due are taken up, and those that ended longer ago than `limits.runsKept` are removed.
  opened(file: FileName): void
  // A file of a tenant is about to close: what the directory keeps of its runs.
  closing(file: FileName): Closing
  add(o: NewRun, tx?: Tx): string
  fired(tx: Tx, what: Fired): void
  wouldStart(what: Fired): string[]
  yes(at: At, call: Place): { agreed: false } | { agreed: true; made?: true; answer?: unknown }
  made(at: At, call: Place, answer?: unknown): void
  wait(run: string): Promise<unknown>
  read(run: string): RunView | undefined
  // The agent that holds a conversation it was handed over to, with those that handed it on: nothing where none does.
  heldBy(thread: string): { agent: string; from: string[] } | undefined
  // Left out, `of` is the shared file. With `'all'` every file is visited, the closed ones too.
  find(o: RunsAsked & { of?: FileName }): RunView[]
  find(o: RunsAsked & { of: 'all' }): Promise<RunView[]>
  approve(run: string, step: string, data?: unknown, o?: { repeat?: number; n?: number }): void
  refuse(run: string, step: string, data?: unknown, o?: { repeat?: number; n?: number }): void
  stop(run: string): void
  // Stop and replay every run that a filter fits, each as `stop` and `replay` do one; with `dry` they only count.
  // Each reaches every file of the app, a closed file of a tenant too.
  stopAll(o: Bulk, how?: { dry?: boolean }): Promise<{ count: number; runs: string[] }>
  replayAll(
    o: Bulk & { from?: string },
    how?: { dry?: boolean },
  ): Promise<{ count: number; runs: string[]; started: string[] }>
  // Starts one run for each time of the schedule of a flow between two moments, in their order; with `dry` it only lists them.
  catchUp(flow: string, o: { from: number; to: number; dry?: boolean }): { times: number[]; runs: string[] }
  // A paused flow keeps its new starts as `queued` and its runs that come due waiting, on every machine, until it is resumed.
  pause(flow: string): void
  resume(flow: string): Promise<void>
  paused(): string[]
  used(run: string, o: { day: string; name: string; answeredBy: string; units: Record<string, number> }): void
  move(run: string, version: string, o?: { dry?: boolean }): { moved: boolean; step?: string }
  replay(run: string, o: { from: string; version: string; with?: Record<string, unknown> }): string
  remove(o: { startedBy?: By; endedBefore?: number }, tx?: Tx): number
  waitingStepNames(): Record<string, string[]>
  // The engine picked a worker: the hand-out of each step is noted in one write, and what each carries answered. Nothing for a step that waits no more.
  out(
    steps: { run: string; step: StepAt }[],
    o: { task: string; worker: string; kind: string },
  ): Promise<(Carried | undefined)[]>
  // The work of a task began.
  started(task: string): void
  // The end of each step of a task is saved in one write. T5108 for a task that is not out.
  ended(task: string, ends: Ended[]): Promise<void>
  // No worker of its kind took the step within `wait`.
  none(run: string, step: StepAt): void
  // A limit of use stopped the step before it was handed out: its try fails with the error, and with `final` its step.
  limited(run: string, step: StepAt, error: TentError, final: boolean): void
  // What the work kept of where it is. T5108 for a task that is not out.
  progress(task: string, kept: { value: unknown; files: string[] }): Promise<void>
  // Every task that is out, for an engine that opens.
  outNow(): OutNow[]
  // Whether a request waits for this run, or for a run that waits for it.
  waited(run: string): boolean
  drive(kind: string, driver: Driver, o?: { tries?: number }): void
  // With `hold` the runs that were under way wait for `takeUp`; a run added from then on runs at once.
  start(o?: { hold?: true }): void
  takeUp(): void
  // `within`: how long, in milliseconds, the closing waits for the work of the steps under way; left out, until it ends.
  close(o?: { within?: number }): Promise<{ dueAt?: number }>
}
