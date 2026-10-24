import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Tx } from '../data/index.ts'
import { inBranch } from './branches.ts'
import { ended } from './ending.ts'
import type { Adding } from './adding.ts'
import { addRunOf } from './adding.ts'
import type { StepTools } from './face.ts'
import type { FlowOf } from './flowOf.ts'
import { flowOf } from './flowOf.ts'
import { eventOf, flowAnswer, inputOf } from './handed.ts'
import type { AtWork, Held } from './held.ts'
import { asSaved, keptError, seenOf } from './kept.ts'
import { endedInMany } from './manyCount.ts'
import type { Outcome, Pass, PassOf } from './pass.ts'
import { atOf, newPass, tickOf, workedOf } from './pass.ts'
import { fileOf, readIn, runOf, writeIn } from './places.ts'
import type { RunRow } from './rows.ts'
import { changeRun, readRun, readSteps, system } from './rows.ts'
import { countedAs, countIn, countOut, isFull } from './together.ts'
import { batchOf, isWaitingStart, letGo, paceOf } from './pace.ts'
import { raiseEnded, stoppingOf } from './stopping.ts'
import { isFinal } from './states.ts'
import { behindHolder, releaseThread } from './threads.ts'
import { toolsOf } from './tools.ts'

/** Whether the run at the top of the calls of a run is one that a driver runs. */
function topIsDriven(held: Held, run: RunRow, own: FlowOf): boolean {
  if (run.top === run.id) return own.driver !== undefined
  const top = runOf(held.env, run.top)
  return top !== undefined && top.kind !== 'flow' && top.kind !== 'action'
}

/** The last work of a run that a pass carries out: the flow's own `onFail` or `onStop`, or nothing for its `run`. */
type Last = 'onFail' | 'onStop' | undefined

/** What one pass of a run is made of: read anew each time the run is taken up. */
function passOf(held: Held, run: RunRow, flow: FlowOf, caller: Caller, last: Last): PassOf {
  // The last work of a run has its time of its own: what the run had worked before it is not counted.
  const before =
    last === 'onStop'
      ? (stoppingOf(run)?.worked ?? 0)
      : last === 'onFail' && typeof run.error?.worked === 'number'
        ? run.error.worked
        : 0
  let askTime = flow.askTime
  if (run.top !== run.id) {
    const top = runOf(held.env, run.top)
    if (top) askTime = flowOf(held, top.version, top.flow).askTime
  }
  return {
    held,
    run,
    caller,
    prefix: last === undefined ? '' : `${last}.`,
    limits: flow.limits,
    tries: flow.tries,
    worked: run.workedMs - before,
    driven: topIsDriven(held, run, flow),
    drives: flow.driver !== undefined && last === undefined,
    askTime,
    sealed: flow.record.sealed === true,
  }
}

/**
 * Starts the body of a pass: the driver of a driven run, the flow's `run`, or its own `onFail` or `onStop`, which a
 * driven run carries out as a flow does.
 */
function carry(held: Held, pass: Pass, flow: FlowOf, tools: StepTools, last: Last): Promise<unknown> {
  const { run, caller } = pass.of
  const { env } = held
  const description = env.description(run.version)
  const input = inputOf(flow.record, run.input)
  // A run that `pace.batch` gathered is handed the events of its starts, and the last of them as its event.
  const gathered = batchOf(run.event)?.map((one) => eventOf(description, one))
  const newest: unknown = gathered?.at(-1)
  const event = gathered ? (Object(newest).kind === 'start' ? undefined : newest) : eventOf(description, run.event)
  if (flow.driver && last === undefined) {
    const { driver } = flow
    return driver({
      id: run.id,
      top: run.top,
      version: run.version,
      record: flow.record,
      input,
      event,
      ...(run.given ? { given: run.given } : {}),
      starter: caller,
      ...(run.leave ? { leave: run.leave } : {}),
      startedAt: run.createdAt,
      step: tools,
      signal: pass.signal,
      worked: () => workedOf(pass),
      handOver: (to) => {
        pass.handedTo = to
      },
    })
  }
  const body = env.body(run.version, run.flow, ...(last === undefined ? [] : [last]))
  if (!body)
    throw new TentError(
      'T0013',
      `The version ${run.version} holds no code for ${last === undefined ? '' : `the \`${last}\` of `}${run.flow}.`,
    )
  const at = atOf(pass)
  const failure =
    last === 'onFail'
      ? { ...seenOf(run.error), ...(typeof run.error?.step === 'string' ? { step: run.error.step } : {}) }
      : undefined
  const stopping = last === 'onStop' ? stoppingOf(run) : undefined
  const stopped = stopping && {
    ...(stopping.step === undefined ? {} : { step: stopping.step }),
    ...(stopping.progress === undefined ? {} : { progress: stopping.progress }),
  }
  pass.handed = { input, event, ...(run.as === 'starter' && caller.user ? { user: caller.user } : {}) }
  return body({
    event,
    input,
    ...(run.as === 'starter' && caller.user ? { user: caller.user } : {}),
    step: tools,
    db: env.db(at),
    ...(failure ? { failure } : {}),
    ...(stopped ? { stopped } : {}),
    ...(gathered ? { events: gathered } : {}),
    tick: tickOf(pass),
  })
}

/**
 * The run that `step.again` starts in place of one that ends: of the same flow and the same file, with its key, its
 * starter and what it may do, and `from` naming it. It takes the live version where that holds the flow.
 */
function nextRun(held: Held, run: RunRow, input: unknown): Adding {
  let version = run.version
  try {
    if (held.live !== undefined) {
      flowOf(held, held.live, run.flow)
      version = held.live
    }
  } catch {
    // A flow that the live version does not hold goes on in the version of its run.
  }
  const file = fileOf(run.id)
  return {
    flow: run.flow,
    version,
    startedBy: run.startedBy,
    before: run.id,
    ...(input === undefined ? {} : { input }),
    ...(run.key === undefined ? {} : { key: run.key }),
    ...(run.leave ? { leave: run.leave } : {}),
    ...(file ? { file } : {}),
  }
}

/**
 * Wakes the run that called this one, in the write that ends it: a caller that nothing works on is queued. A run
 * whose driver handed its conversation over leaves it held by that agent, in the same write.
 */
function wakeCaller(held: Held, tx: Tx, run: RunRow, handedTo?: string): void {
  releaseThread(held, tx, run, handedTo)
  if (!run.parent) return
  const state = readRun(tx, run.id)?.state
  if ((state === 'done' || state === 'failed') && endedInMany(held, tx, run, state)) return
  const parent = readRun(tx, run.parent)
  if (parent?.state !== 'waiting' || parent.wakeAt !== undefined) return
  const here = held.atWork.has(parent.id)
  changeRun(tx, parent.id, { state: here ? 'running' : 'queued' })
  if (!here) held.later(parent.id)
}

/** Writes a run as failed for good, with its first error, raises `run.failed` there, and answers whoever waits for it. */
function failRun(held: Held, run: RunRow, error: Record<string, unknown>, worked: number): void {
  writeIn(held.env, run.id, (tx) => {
    changeRun(tx, run.id, { state: 'failed', error, endedAt: held.env.clock.now(), workedMs: worked, wakeAt: null })
    wakeCaller(held, tx, run)
    raiseEnded(held, tx, run, 'failed', error)
  })
  ended(held, run, 'failed')
}

/** Writes a run whose `onStop` has ended as stopped, raises `run.stopped` there, and answers whoever waits for it. */
function stopRun(held: Held, run: RunRow, worked: number): void {
  writeIn(held.env, run.id, (tx) => {
    changeRun(tx, run.id, {
      state: 'stopped',
      error: null,
      endedAt: held.env.clock.now(),
      workedMs: worked,
      wakeAt: null,
    })
    endedInMany(held, tx, run, 'stopped')
    releaseThread(held, tx, run)
    raiseEnded(held, tx, run, 'stopped')
  })
  ended(held, run, 'stopped')
}

/**
 * Carries one pass of a run out, and writes what became of the run. Answers whether the run is to be taken up
 * again at once: because its `onFail` or its `onStop` follows, or because what it waited for arrived while the pass
 * was under way.
 */
async function onePass(held: Held, id: string, work: AtWork): Promise<boolean> {
  const { env } = held
  const run = runOf(env, id)
  if (!run || isFinal(run)) return false
  // A run that was stopped carries out its `onStop`, and one that failed its `onFail`, as its last work.
  const last: Last = stoppingOf(run) ? 'onStop' : run.error !== undefined ? 'onFail' : undefined
  // A run of a paused flow is left as it stands, queued or waiting, until its flow is resumed.
  if (last !== 'onStop' && run.state !== 'running' && held.paused.has(run.flow)) return false
  // A start that waits for its pace is taken up once its moment has come.
  const waits = last === undefined && isWaitingStart(run)
  if (waits && (run.wakeAt ?? 0) > env.clock.now()) return false
  let flow: FlowOf
  let caller: Caller
  try {
    flow = flowOf(held, run.version, run.flow)
    // A run that runs as its starter has the rights its starter has on the day the work is done.
    caller = run.as === 'starter' ? env.caller(run.startedBy) : system
  } catch (error) {
    failRun(held, run, run.error ?? keptError(error), run.workedMs)
    return false
  }
  // It goes where its pace leaves room, as a run that is added at this moment, and else waits on in its row.
  if (waits) {
    let goes = false
    writeIn(env, id, (tx) => {
      goes = letGo(held, tx, run, paceOf(flow) ?? { order: false, turns: false })
    })
    if (!goes) {
      held.rearm()
      return false
    }
  }
  if (run.state !== 'running') {
    // A run that stands behind the run that holds its conversation is taken up when that one has ended.
    if (behindHolder(held, run)) return false
    // A run over the count of its flow that may work at once waits its turn.
    if (last === undefined && isFull(held, run, flow)) {
      const counted = countedAs(run, flow) ?? ''
      held.turns.set(counted, (held.turns.get(counted) ?? new Set<string>()).add(id))
      if (run.state !== 'queued') writeIn(env, id, (tx) => changeRun(tx, id, { state: 'queued', wakeAt: null }))
      return false
    }
    writeIn(env, id, (tx) => changeRun(tx, id, { state: 'running', wakeAt: null }))
    env.told({ kind: 'run', run: id, state: 'running' })
  }
  countIn(held, work, run, flow)
  const pass = newPass(passOf(held, { ...run, state: 'running' }, flow, caller, last))
  work.pass = pass
  const tools = toolsOf(pass)
  inBranch(pass.root, () =>
    env.inside(atOf(pass), () =>
      new Promise((resolve) => resolve(carry(held, pass, flow, tools, last))).then(
        (value) => pass.finish({ kind: 'done', value }),
        (error: unknown) => {
          const step = typeof error === 'object' && error !== null ? pass.failedBy.get(error) : undefined
          pass.finish({ kind: 'failed', error, ...(step === undefined ? {} : { step }) })
        },
      ),
    ),
  )
  const epoch = held.epoch
  let outcome: Outcome = await pass.ended
  // A pass that ends after its runner was closed writes nothing: its run is taken up anew at the next start.
  if (held.epoch !== epoch) return false
  delete work.pass
  const worked = Math.round(workedOf(pass))
  const now = runOf(env, id)
  // A run that was stopped while its pass was under way is taken up again for its `onStop`, where it has one.
  if (outcome.kind === 'stopped') return last !== 'onStop' && now?.state !== 'stopped' && stoppingOf(now) !== undefined
  // The run may have been stopped by a write that this program did not make its pass hear of.
  if (now?.state === 'stopped') return false
  if (last !== 'onStop' && stoppingOf(now)) return true
  if (outcome.kind === 'waiting') {
    if (work.again) return true
    const wakeAt = outcome.wakeAt
    // A run whose task is out is running, though its pass waits for the end of that task.
    const state = readSteps(readIn(env, id), id).some((one) => one.out) ? 'running' : 'waiting'
    writeIn(env, id, (tx) => changeRun(tx, id, { state, wakeAt: wakeAt ?? null, workedMs: worked }))
    env.told({ kind: 'run', run: id, state })
    return false
  }
  // The flow's own `onStop` is the last work of a run that was stopped: whatever it ends with, the run is stopped.
  if (last === 'onStop') {
    stopRun(held, run, worked)
    return false
  }
  // The flow's own `onFail` is the last work of its run: whatever it ends with, the run has failed with its first error.
  if (last === 'onFail' && run.error) {
    failRun(held, run, run.error, worked)
    return false
  }
  if (outcome.kind === 'done') {
    const answer = asSaved(outcome.value)
    const fitted = flow.driver ? { value: answer.value } : flowAnswerOf(flow, answer)
    if ('error' in fitted) outcome = { kind: 'failed', error: fitted.error }
    else {
      writeIn(env, id, (tx) => {
        changeRun(tx, id, {
          state: 'done',
          ...(fitted.value === undefined ? {} : { answer: fitted.value }),
          endedAt: env.clock.now(),
          workedMs: worked,
          wakeAt: null,
        })
        wakeCaller(held, tx, run, pass.handedTo)
        // The run goes on as a new one, in this write: of the live version where it holds the flow.
        const again = outcome.kind === 'done' ? outcome.again : undefined
        if (again)
          addRunOf(held, nextRun(held, run, again.input), tx, (other) => void setImmediate(() => held.stop(other)))
      })
      ended(held, run, 'done')
      return false
    }
  }
  const kept = { ...keptError(outcome.error), ...(outcome.step === undefined ? {} : { step: outcome.step }), worked }
  // A flow that states its own `onFail` keeps its error from this moment, and is failed once that has ended.
  if (flow.record.onFail !== undefined && !flow.driver) {
    writeIn(env, id, (tx) => changeRun(tx, id, { error: kept, workedMs: worked }))
    return true
  }
  failRun(held, run, kept, worked)
  return false
}

/** The answer of a flow as it leaves its run: under the limit of a result, and through the flow's `output`. */
function flowAnswerOf(
  flow: FlowOf,
  answer: { value: unknown; size: number },
): { value: unknown } | { error: TentError } {
  if (answer.size > flow.limits.result)
    return {
      error: new TentError(
        'T5102',
        `The answer of the flow is ${answer.size} bytes, past \`limits.result\` of ${flow.limits.result}.`,
        { fix: 'Put large data into a file and answer its id, or raise `limits.result` of the flow.' },
      ),
    }
  const fitted = flowAnswer(flow.record, answer.value)
  if ('misfit' in fitted)
    return {
      error: new TentError('T0009', `The answer of the flow does not fit its output: ${fitted.misfit}`, {
        fix: 'State an `output` that the answer fits, or answer what the stated one names.',
      }),
    }
  return fitted
}

/**
 * Takes a run up: carries its passes out, one after another, for as long as each says that the next follows at
 * once. Nothing is done for a run that is worked on already, and for a runner that is closed.
 */
export function takeUp(held: Held, id: string): void {
  if (held.closed || held.atWork.has(id)) return
  let leave = (): void => undefined
  const work: AtWork = {
    again: false,
    calls: 0,
    left: new Promise<void>((resolve) => {
      leave = resolve
    }),
  }
  held.atWork.set(id, work)
  const loop = async (): Promise<void> => {
    try {
      for (;;) {
        work.again = false
        if (!(await onePass(held, id, work)) || held.closed) break
      }
    } catch (error) {
      // What failed outside the work of a step fails the run; where even that write fails, the run stands as it
      // was, and is taken up again at the next start.
      const run = held.closed ? undefined : runOf(held.env, id)
      try {
        if (run && !isFinal(run)) failRun(held, run, run.error ?? keptError(error), run.workedMs)
      } catch {
        // The store is the cause: nothing more can be written of the run now.
      }
    } finally {
      leave()
      countOut(held, work)
      if (held.atWork.get(id) === work) {
        held.atWork.delete(id)
        held.freed(undefined)
      }
    }
  }
  void loop()
}
