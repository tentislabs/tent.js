import { TentError } from '../core/index.ts'
import { askFor } from './asking.ts'
import { never, noteEnded } from './branches.ts'
import type { GoneOn, StepAt, StepOptions, Working } from './face.ts'
import { asSaved, isTriedAgain, keptError, seenOf, thrownOf } from './kept.ts'
import { msOf } from './lengths.ts'
import type { Pass, Reached } from './pass.ts'
import { answered, atOf, beganAt, endedAt, park, reach, resultOf, saveStep, tellStep } from './pass.ts'
import { refusedBy, taskSizeLimit, taskSizeOf } from './heldTo.ts'
import { kindStated, queueStep } from './queueing.ts'
import type { StepRow } from './rows.ts'
import { endsOf } from './rows.ts'
import { sealedResult } from './sealing.ts'

/** How often a step is tried in all, and the first wait between two tries: what the step states, or what its flow does. */
function triesOf(pass: Pass, stated: StepOptions['tries']): { max: number; wait: number } {
  if (typeof stated === 'number') return { max: stated, wait: pass.of.tries.wait }
  if (!stated) return pass.of.tries
  return { max: stated.max, wait: stated.wait === undefined ? pass.of.tries.wait : msOf(stated.wait) }
}

/** What the step answers once it has failed for good: its error, or what `onFail: 'goOn'` reads in place of it. */
function refused(pass: Pass, reached: Reached, row: StepRow, goOn: boolean): GoneOn {
  if (goOn) return answered(pass, { failed: true, ...seenOf(row.error) })
  const thrown = thrownOf(row.error)
  pass.failedBy.set(thrown, reached.name)
  answered(pass, undefined)
  throw thrown
}

/** What the work of a step is handed. */
function workingOf(pass: Pass, at: StepAt): Working {
  const { env } = pass.of.held
  const cx = atOf(pass, at)
  function progress(): unknown
  function progress(value: unknown): Promise<void>
  function progress(...given: unknown[]): unknown {
    const held = pass.saved.get(`${at.repeat} ${at.name}`)
    if (!given.length) return held?.progress
    saveStep(pass, at, { progress: asSaved(given[0]).value })
    return Promise.resolve()
  }
  return {
    rows: {},
    progress,
    stopping: () => pass.stopped,
    back: () => {
      throw new TentError(
        'T0013',
        'Work that runs in the program of its app has no machine to hand itself back from.',
        {
          fix: 'Call `back` in work that states `worker`.',
        },
      )
    },
    say: (value) => env.say?.(cx, value),
  }
}

/**
 * The step tool: a step whose result is saved answers it and its work is not called; otherwise the work is carried
 * out, inside the call context of its run and step, and its result is saved before the tool answers. A step that
 * fails is tried again after its wait, as often as its tries allow, and then has failed for good: the tool refuses
 * its promise with the error of the step, on that pass and on every later one, or answers what `onFail: 'goOn'`
 * reads.
 */
export async function stepTool(
  pass: Pass,
  name: string,
  work: (the: Working) => unknown,
  o: StepOptions = {},
): Promise<unknown> {
  const reached = reach(pass, name)
  if (!reached) return never()
  const { at, branch } = reached
  const { env } = pass.of.held
  const goOn = o.onFail === 'goOn'
  let row = reached.row
  if (row?.state === 'done' || row?.state === 'failed') noteEnded(branch, row.endedAt)
  if (row?.state === 'done') return answered(pass, resultOf(pass, row))
  if (row?.state === 'failed') return refused(pass, reached, row, goOn)
  if (row?.state === 'waiting') {
    const due = row.wakeAt !== undefined && env.clock.now() >= row.wakeAt
    // A step that waits for the yes of a person waits until the yes, the no, or the end of its time.
    if (row.ask && due) {
      row = saveStep(pass, at, {
        state: 'failed',
        ask: null,
        wakeAt: null,
        endedAt: endedAt(pass),
        error: keptError(new TentError('T7111', `Nobody agreed to ${row.ask.name ?? 'the call'} in time.`)),
      })
      tellStep(pass, at, { state: 'failed' })
      return refused(pass, reached, row, goOn)
    }
    if (row.ask || !due) return park(pass, branch, row.wakeAt)
  }
  // A step that states `remember` is not carried out again for the values its answer rests on.
  if (o.remember && env.remembered) {
    const found = await env.remembered(atOf(pass, at, o.leave), o.remember)
    if (found) {
      const done = saveStep(pass, at, {
        state: 'done',
        ...(found.answer === undefined ? {} : { result: asSaved(found.answer).value }),
        size: asSaved(found.answer).size,
        startedAt: row?.startedAt ?? beganAt(pass),
        endedAt: endedAt(pass),
      })
      tellStep(pass, at, { state: 'done', ms: 0 })
      noteEnded(branch, done.endedAt)
      return answered(pass, done.result)
    }
  }
  // Work that goes to a worker is handed to the engine, where the engine takes workers. A task past `taskSize` is
  // carried out here where the step states `background` alone, and fails where it states a kind of worker.
  const kind = kindStated(o)
  const large = kind !== undefined && env.queue !== undefined && taskSizeOf(pass) > taskSizeLimit(pass)
  const refusal =
    kind === undefined || !env.queue
      ? undefined
      : large
        ? typeof o.worker === 'string'
          ? new TentError('T5102', `The task of the step ${JSON.stringify(name)} would pass \`taskSize\`.`, {
              fix: 'Hand the work less: put large data into a file and pass its id, or raise `taskSize` of the project.',
            })
          : undefined
        : refusedBy(pass, row?.away?.worker ?? kind, o)
  if (refusal) {
    const failed = saveStep(pass, at, {
      state: 'failed',
      tries: (row?.tries ?? 0) + 1,
      error: keptError(refusal),
      endedAt: endedAt(pass),
    })
    tellStep(pass, at, { state: 'failed' })
    return refused(pass, reached, failed, goOn)
  }
  if (kind !== undefined && env.queue && !large) return queueStep(pass, reached, kind, o, triesOf(pass, o.tries), row)
  row = saveStep(pass, at, {
    state: 'started',
    startedAt: row?.startedAt ?? beganAt(pass),
    wakeAt: null,
    tries: row?.tries ?? 0,
    ...(o.show === undefined ? {} : { show: o.show }),
  })
  tellStep(pass, at, { state: 'started', ...(o.show === undefined ? {} : { show: o.show }) })
  const began = performance.now()
  const cx = atOf(pass, at, o.leave)
  const tries = triesOf(pass, o.tries)

  /** Carries the work out and saves what became of it. Answers the row of the step, or nothing where the pass was stopped. */
  const made = async (): Promise<StepRow | undefined> => {
    const before = row ?? { tries: 0 }
    let failure: unknown
    let saved: { value: unknown; size: number } | undefined
    try {
      const onThread = o.background === true || o.background === 'here'
      const result = await (onThread
        ? env.onThread(
            { ...cx, ...(pass.handed ? { handed: pass.handed } : {}), ended: endsOf(pass.saved.values()) },
            workingOf(pass, at),
          )
        : env.inside(cx, () => work(workingOf(pass, at))))
      saved = asSaved(result)
      if (saved.size > pass.of.limits.result)
        throw new TentError(
          'T5102',
          `The result of the step ${JSON.stringify(name)} is ${saved.size} bytes, past \`limits.result\` of ${pass.of.limits.result}.`,
          { fix: 'Put large data into a file and answer its id, or raise `limits.result` of the flow.' },
        )
    } catch (error) {
      failure = error ?? new Error('The work of the step threw nothing.')
    }
    // The result of a step that was in flight when its run was stopped is not saved.
    if (pass.stopped) return undefined
    const ms = Math.round(performance.now() - began)
    if (failure === undefined && saved && (o.sealed === true || pass.of.sealed)) {
      // What a sealed step saves is the sealed text alone, bound to its run, its step and its repeat.
      try {
        saved = sealedResult(env, { run: pass.of.run.id, name: at.name, repeat: at.repeat }, saved.value)
      } catch (error) {
        failure = error
        saved = undefined
      }
    }
    if (failure === undefined && saved) {
      const done = saveStep(pass, at, {
        state: 'done',
        ...(saved.value === undefined ? {} : { result: saved.value }),
        size: saved.size,
        endedAt: endedAt(pass),
      })
      tellStep(pass, at, { state: 'done', ms })
      if (o.remember) env.remember?.(cx, o.remember, saved.value)
      return done
    }
    const asked = askFor(pass, at, failure)
    if (asked) return asked
    const failed = before.tries + 1
    if (!isTriedAgain(failure) || failed >= tries.max) {
      const gone = saveStep(pass, at, {
        state: 'failed',
        tries: failed,
        error: keptError(failure),
        endedAt: endedAt(pass),
      })
      tellStep(pass, at, { state: 'failed', ms })
      return gone
    }
    // Each wait between two tries is six times the one before.
    const wakeAt = env.clock.now() + tries.wait * 6 ** (failed - 1)
    const waits = saveStep(pass, at, { state: 'waiting', tries: failed, error: keptError(failure), wakeAt })
    tellStep(pass, at, { state: 'waiting', ms })
    pass.wakes.push(wakeAt)
    return waits
  }

  const job = made()
  pass.inFlight.add(job)
  const ended = await job.finally(() => pass.inFlight.delete(job))
  if (!ended || pass.over) return never()
  if (ended.state === 'done' || ended.state === 'failed') noteEnded(branch, ended.endedAt)
  if (ended.state === 'done') return answered(pass, resultOf(pass, ended))
  if (ended.state === 'failed') return refused(pass, reached, ended, goOn)
  return park(pass, branch)
}
