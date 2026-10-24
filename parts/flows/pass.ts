import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Tx } from '../data/index.ts'
import type { Branch } from './branches.ts'
import { branchNow, goesOn, never, newBranch } from './branches.ts'
import type { At, Leave, StepAt, Told } from './face.ts'
import type { Held } from './held.ts'
import { readIn } from './places.ts'
import type { Given, RunRow, StepRow } from './rows.ts'
import { readStep, readSteps, writeStep } from './rows.ts'
import { openedResult } from './sealing.ts'

/** The limits of one run, as they are stored: a time in milliseconds, a size in bytes and a count as it is. */
export interface Limits {
  steps: number
  time: number
  result: number
  wait: number
  pass: number
  // How long one try of a step may take, where it states no `time`.
  stepTime: number
}

/** How a pass ended. */
export type Outcome =
  // A run that `step.again` ended starts a new run with that input, in the write that ends it.
  | { kind: 'done'; value: unknown; again?: { input: unknown } }
  | { kind: 'failed'; error: unknown; step?: string }
  | { kind: 'waiting'; wakeAt?: number }
  | { kind: 'stopped' }

/** What one pass of a run is made of. */
export interface PassOf {
  held: Held
  run: RunRow
  // Whose rights the run has, as the engine built that caller for this taking up.
  caller: Caller
  // What stands in front of the name of each step: nothing for `run`, and `onFail.` for the flow's own `onFail`.
  prefix: string
  limits: Limits
  // How often a step is tried in all, and the first wait between two tries, in milliseconds.
  tries: { max: number; wait: number }
  // How long the run had worked before this pass, in milliseconds.
  worked: number
  // Whether the run at the top of the calls is one that a driver runs, so that a person can be asked.
  driven: boolean
  // Whether this run itself is one that a driver runs.
  drives: boolean
  // How long a step waits for the yes of a person, in milliseconds.
  askTime: number
  // Whether the flow seals what every step of it saves.
  sealed: boolean
}

/** One pass of a run, while it is under way. */
export interface Pass {
  of: PassOf
  root: Branch
  saved: Map<string, StepRow>
  counts: Map<string, number>
  reached: number
  // The work of steps that is under way, with the saving that follows it.
  inFlight: Set<Promise<unknown>>
  over: boolean
  stopped: boolean
  began: number
  // How long the pass has stood still for runs that it called, and since when it stands still now.
  idle: number
  idleSince?: number
  // The moment a step tool last answered, by the clock of the runtime that never jumps.
  answered: number
  // The latest moment at which a step of the run began: no two steps of one run begin at one moment. And ended.
  lastBegan: number
  lastEnded: number
  // The wake times of the steps that this pass left waiting.
  wakes: number[]
  // The step that each error of a failed step belongs to.
  failedBy: WeakMap<object, string>
  ended: Promise<Outcome>
  finish(outcome: Outcome): void
  signal: AbortSignal
  // What the code of the flow was handed on this pass, which a step on a thread is handed too.
  handed?: At['handed']
  // The agent that a driver handed the conversation of the run to, which holds it once the run is done.
  handedTo?: string
}

/** The key of a step among the saved steps of its run. */
const keyOf = (at: StepAt): string => `${at.repeat} ${at.name}`

const rank: Record<Leave, number> = { none: 0, trusted: 1, agreed: 2 }

/** Of what a run may do and what a step may do, the narrower: but what a person agreed to is agreed. */
function leaveOf(run: Leave | undefined, step: Leave | undefined): Leave | undefined {
  if (step === 'agreed' || step === undefined) return step ?? run
  if (run === undefined) return step
  return rank[run] < rank[step] ? run : step
}

/** Where the work of a step of this pass stands, for the engine's call context. */
export function atOf(pass: Pass, step?: StepAt, leave?: Leave): At {
  const { run, caller } = pass.of
  const held = leaveOf(run.leave, leave)
  return {
    run: run.id,
    flow: run.flow,
    version: run.version,
    as: caller,
    ...(held ? { leave: held } : {}),
    ...(step ? { step } : {}),
    signal: pass.signal,
  }
}

/** Starts a pass: reads the saved steps of its run in two reads, and answers what the step tools work on. */
export function newPass(of: PassOf): Pass {
  const root = newBranch()
  const stopping = new AbortController()
  let settle: (outcome: Outcome) => void = () => undefined
  const ended = new Promise<Outcome>((resolve) => {
    settle = resolve
  })
  let finished = false
  const saved = readSteps(readIn(of.held.env, of.run.id), of.run.id)
  const pass: Pass = {
    of,
    root,
    saved: new Map(saved.map((row) => [keyOf(row), row])),
    lastBegan: Math.max(0, ...saved.map((row) => row.startedAt ?? 0)),
    lastEnded: Math.max(0, ...saved.map((row) => row.endedAt ?? 0)),
    counts: new Map(),
    reached: 0,
    inFlight: new Set(),
    over: false,
    stopped: false,
    began: performance.now(),
    idle: 0,
    answered: performance.now(),
    wakes: [],
    failedBy: new WeakMap(),
    ended,
    signal: stopping.signal,
    finish(outcome) {
      if (finished) return
      finished = true
      pass.over = true
      if (outcome.kind === 'stopped') {
        pass.stopped = true
        stopping.abort()
        return settle(outcome)
      }
      if (outcome.kind !== 'waiting') return settle(outcome)
      // A run waits only once no step of it is under way: what is in flight is done, and saved, first.
      const rest = async (): Promise<void> => {
        while (pass.inFlight.size) await Promise.allSettled([...pass.inFlight])
      }
      void rest().then(() => settle(pass.wakes.length ? { kind: 'waiting', wakeAt: Math.min(...pass.wakes) } : outcome))
    },
  }
  void root.rests.then(() => pass.finish({ kind: 'waiting' }))
  return pass
}

/**
 * Answers the moment at which a step of this pass begins: the present one, or one millisecond after the step
 * that began last, so that the steps of a run are read in the order in which they began.
 */
export function beganAt(pass: Pass): number {
  pass.lastBegan = Math.max(pass.of.held.env.clock.now(), pass.lastBegan + 1)
  return pass.lastBegan
}

/** Answers the moment at which a step of this pass ends: the present one, or one millisecond after the step that ended last. */
export function endedAt(pass: Pass): number {
  pass.lastEnded = Math.max(pass.of.held.env.clock.now(), pass.lastEnded + 1)
  return pass.lastEnded
}

/** How long the run has worked, with this pass, in milliseconds. */
export function workedOf(pass: Pass): number {
  const now = performance.now()
  const still = pass.idle + (pass.idleSince === undefined ? 0 : now - pass.idleSince)
  return pass.of.worked + (now - pass.began) - still
}

/** Ends a pass with an error that no code of the flow may go on after. */
export function fatal(pass: Pass, error: TentError): void {
  pass.finish({ kind: 'failed', error })
}

/** The error of a pass that worked too long between two steps. */
const pastPass = (pass: Pass): TentError =>
  new TentError(
    'T5104',
    `A run of ${pass.of.run.flow} worked for more than ${pass.of.limits.pass} ms between two steps, past \`limits.pass\`.`,
    { fix: 'Do the work inside a step, or raise `limits.pass` of the flow.' },
  )

/** Whether the pass has worked for longer between two steps than its flow allows, with no step under way. */
const isPastPass = (pass: Pass): boolean =>
  !pass.of.drives && pass.inFlight.size === 0 && performance.now() - pass.answered > pass.of.limits.pass

/** What a stored body asks before every statement: it throws T5104 for a pass that worked too long between two steps. */
export function tickOf(pass: Pass): () => void {
  return () => {
    if (pass.over || !isPastPass(pass)) return
    const error = pastPass(pass)
    fatal(pass, error)
    throw error
  }
}

/** What a step tool found of its step when it was reached. */
export interface Reached {
  at: StepAt
  // The name of the step as the flow wrote it.
  name: string
  branch: Branch
  row?: StepRow
}

/**
 * Takes a pass and the name of a step that a step tool was called for. Answers the step with its repeat number
 * and what is saved of it, or nothing where the branch of the call does not go on: the tool then answers a
 * promise that never settles. Ends the pass with T5104 for a run that worked too long, and with T5101 for one
 * step more than the flow allows.
 */
export function reach(pass: Pass, name: string): Reached | undefined {
  const branch = branchNow(pass.root)
  if (pass.over || !goesOn(branch)) return undefined
  const { limits, run, prefix } = pass.of
  if (isPastPass(pass)) return void fatal(pass, pastPass(pass))
  if (workedOf(pass) > limits.time)
    return void fatal(
      pass,
      new TentError(
        'T5104',
        `A run of ${run.flow} worked for more than ${limits.time} ms, past \`limits.time\`, when it came to the step ${JSON.stringify(name)}.`,
        { fix: 'Cut the work into runs of their own, or raise `limits.time` of the flow.' },
      ),
    )
  const full = `${prefix}${name}`
  const repeat = (pass.counts.get(full) ?? 0) + 1
  pass.counts.set(full, repeat)
  pass.reached += 1
  if (pass.reached > limits.steps)
    return void fatal(
      pass,
      new TentError(
        'T5101',
        `A run of ${run.flow} came to its step number ${pass.reached}, ${JSON.stringify(name)}, past \`limits.steps\` of ${limits.steps}.`,
        { fix: 'Start a run for each part of the work, or raise `limits.steps` of the flow.' },
      ),
    )
  const at = { name: full, repeat }
  const row = pass.saved.get(keyOf(at))
  return { at, name, branch, ...(row ? { row } : {}) }
}

/** Writes a step of this pass, in a write of its own or as part of one, and keeps what the pass holds of it. */
export function saveStep(pass: Pass, at: StepAt, given: Given<StepRow>, tx?: Tx): StepRow {
  const key = keyOf(at)
  const held = pass.saved.get(key)
  const store = readIn(pass.of.held.env, pass.of.run.id)
  const write = (to: Tx): void => writeStep(to, pass.of.run.id, at, given, held === undefined)
  if (tx) write(tx)
  else store.write(write)
  const cleared = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== null))
  const lost = Object.entries(given).flatMap(([name, value]) => (value === null ? [name] : []))
  const row: StepRow = {
    run: pass.of.run.id,
    name: at.name,
    repeat: at.repeat,
    state: 'started',
    size: 0,
    tries: 0,
    whole: true,
    ...Object.fromEntries(Object.entries(held ?? {}).filter(([name]) => !lost.includes(name))),
    ...cleared,
  }
  pass.saved.set(key, row)
  return row
}

/**
 * Answers the result of a saved step as its run reads it back: one that was left unread for its size is read now,
 * and a sealed one is opened. Throws T0019 for a sealed result that does not open here.
 */
export function resultOf(pass: Pass, row: StepRow): unknown {
  const saved = row.whole ? row.result : readStep(readIn(pass.of.held.env, row.run), row.run, row)?.result
  return openedResult(pass.of.held.env, { run: row.run, name: row.name, repeat: row.repeat }, saved)
}

/** Tells whoever listens of a step of this pass, under the name the flow wrote. */
export function tellStep(
  pass: Pass,
  at: StepAt,
  more: Omit<Extract<Told, { kind: 'step' }>, 'kind' | 'run' | 'name' | 'repeat'>,
): void {
  pass.of.held.env.told({ kind: 'step', run: pass.of.run.id, name: at.name, repeat: at.repeat, ...more })
}

/** Leaves the branch of a step waiting, until `wakeAt` where it has a time, and answers a promise that never settles. */
export function park<T>(pass: Pass, branch: Branch, wakeAt?: number): Promise<T> {
  if (wakeAt !== undefined) pass.wakes.push(wakeAt)
  branch.park()
  return never()
}

/**
 * Hands a step tool's answer on, and notes the moment: the work between two steps is counted from here, and from
 * when the pass takes the answer, which may be later where other work holds the program meanwhile.
 */
export function answered<T>(pass: Pass, value: T): T {
  pass.answered = performance.now()
  // Queued before the pass goes on from the answer, so it runs just before that: a wait of the program is no work of the pass.
  queueMicrotask(() => {
    pass.answered = Math.max(pass.answered, performance.now())
  })
  return value
}
