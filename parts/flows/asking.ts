import { TentError } from '../core/index.ts'
import type { At, Place, StepAt } from './face.ts'
import type { Held } from './held.ts'
import { asSaved, keptError } from './kept.ts'
import type { Pass } from './pass.ts'
import { saveStep, tellStep } from './pass.ts'
import { flowOf } from './flowOf.ts'
import { readIn, runOf, writeIn } from './places.ts'
import type { Given, RunRow, StepRow } from './rows.ts'
import { changeRun, readRun, readStep, readSteps, writeStep } from './rows.ts'

const samePlace = (a: Place, b: Place): boolean => a.name === b.name && a.nth === b.nth

/**
 * Takes a pass, a step of it, and what the work of the step failed with. Where that is the refusal of a call that
 * waits for a yes, and the run at the top of the calls is one that a driver runs, the step waits for the person:
 * its row keeps the place of the call as the ask that waits, and shows the name of what was refused. Answers the
 * row, or nothing for any other failure.
 */
export function askFor(pass: Pass, at: StepAt, failure: unknown): StepRow | undefined {
  if (!(failure instanceof TentError) || failure.code !== 'T7111' || !failure.place || !pass.of.driven) return undefined
  const { env } = pass.of.held
  // The places that were agreed to are kept by the engine's own asking while the work ran: the row is read anew.
  const agreed = readStep(readIn(env, pass.of.run.id), pass.of.run.id, at)?.agreed ?? []
  const ask = { n: agreed.length + 1, name: failure.place.name, nth: failure.place.nth }
  const show = { call: ask.name }
  const wakeAt = env.clock.now() + pass.of.askTime
  const row = saveStep(pass, at, { state: 'waiting', ask, show, wakeAt, agreed })
  tellStep(pass, at, { state: 'waiting', show, ask: ask.n })
  pass.wakes.push(wakeAt)
  return row
}

/**
 * Takes a run, the row of its step whose try a worker carried out, what that try failed with, and the time. Where
 * that is the refusal of a call that nobody agreed to under a tool call whose top is driven, answers the row of a
 * step that waits for the person, as `askFor` writes one here; and nothing for any other failure.
 */
export function askedForTask(
  held: Held,
  run: RunRow,
  row: StepRow,
  failure: unknown,
  now: number,
): Given<StepRow> | undefined {
  if (!(failure instanceof TentError) || failure.code !== 'T7111' || !failure.place) return undefined
  const own = flowOf(held, run.version, run.flow)
  const top = run.top === run.id ? undefined : runOf(held.env, run.top)
  const driven = top ? top.kind !== 'flow' && top.kind !== 'action' : own.driver !== undefined
  if (!driven) return undefined
  const agreed = row.agreed ?? []
  const ask = { n: agreed.length + 1, name: failure.place.name, nth: failure.place.nth }
  return { state: 'waiting', ask, show: { call: ask.name }, wakeAt: now + own.askTime, agreed }
}

/** Answers whether a person agreed to the call at this place of this step, and whether it was made already. */
export function yesOf(
  held: Held,
  at: At,
  call: Place,
): { agreed: false } | { agreed: true; made?: true; answer?: unknown } {
  const row = at.step ? readStep(readIn(held.env, at.run), at.run, at.step) : undefined
  const place = row?.agreed?.find((one) => samePlace(one, call))
  if (!place) return { agreed: false }
  if (!place.made) return { agreed: true }
  return { agreed: true, made: true, ...('answer' in place ? { answer: place.answer } : {}) }
}

/**
 * Notes that the agreed call at this place was made and ended well, and keeps its answer as plain data. Throws
 * T5102 for an answer past `most` bytes, which fails the step.
 */
export function madeOf(held: Held, at: At, call: Place, answer: unknown, most: number): void {
  if (!at.step) return
  const step = at.step
  const kept = asSaved(answer)
  if (kept.size > most)
    throw new TentError(
      'T5102',
      `The answer of the agreed call ${call.name} is ${kept.size} bytes, past \`limits.result\` of ${most}.`,
      { fix: 'Have the call answer less, or raise `limits.result`.' },
    )
  writeIn(held.env, at.run, (tx) => {
    const agreed = (readStep(tx, at.run, step)?.agreed ?? []).map((one) =>
      samePlace(one, call)
        ? {
            name: one.name,
            nth: one.nth,
            made: true as const,
            ...(kept.value === undefined ? {} : { answer: kept.value }),
          }
        : one,
    )
    writeStep(tx, at.run, step, { agreed }, false)
  })
}

const noSuch = (words: string): TentError =>
  new TentError('T0002', words, {
    fix: 'Name a step that waits for an answer, with the pass and the ask that `runs.find` and `runs.read` show of it.',
  })

/**
 * Answers the step of a run that waits for a person: approved or refused. Of a wait-for the step is done, with
 * what was decided as its result. Of an ask about a call, a yes moves the place of the call among the agreed ones
 * and has the step made again, and a no fails the step with T7111. The run is queued in the same write. Throws
 * T0001 for a run that is not there, and T0002 where no step of that name waits, or where `repeat` or `n` name
 * another pass or another ask than the one that waits.
 */
export function answerStep(
  held: Held,
  run: string,
  step: string,
  approved: boolean,
  data: unknown,
  o: { repeat?: number; n?: number } = {},
): void {
  const { clock } = held.env
  const store = readIn(held.env, run)
  const row = readRun(store, run)
  if (!row) throw new TentError('T0001', `No run ${JSON.stringify(run).slice(0, 80)} is there.`)
  const waiting = readSteps(store, run)
    .filter(
      (one) =>
        one.name === step && one.state === 'waiting' && (one.ask?.name !== undefined || one.waitsFor?.person === true),
    )
    .sort((a, b) => a.repeat - b.repeat)
  const found = o.repeat === undefined ? waiting[0] : waiting.find((one) => one.repeat === o.repeat)
  if (!found || row.state === 'done' || row.state === 'failed' || row.state === 'stopped')
    throw noSuch(
      `No step ${JSON.stringify(step)}${o.repeat === undefined ? '' : `, pass ${o.repeat},`} of the run ${run} waits for an answer.`,
    )
  const n = found.ask?.n ?? 1
  if (o.n !== undefined && o.n !== n)
    throw noSuch(
      `The step ${JSON.stringify(step)} of the run ${run} waits as ask ${n}, and the answer names ask ${o.n}.`,
    )
  const at = { name: found.name, repeat: found.repeat }
  const now = clock.now()
  const call = found.ask?.name === undefined ? undefined : { name: found.ask.name, nth: found.ask.nth ?? 0 }
  store.write((tx) => {
    if (call && approved) {
      const agreed = [...(found.agreed ?? []), call]
      writeStep(tx, run, at, { state: 'started', agreed, ask: null, show: null, wakeAt: null }, false)
    } else if (call) {
      const error = keptError(new TentError('T7111', `A person refused the call of ${call.name}.`))
      writeStep(tx, run, at, { state: 'failed', error, ask: null, wakeAt: null, endedAt: now }, false)
    } else {
      const result = asSaved({
        approved,
        ...(data === undefined ? {} : { data }),
        ...(found.show === undefined ? {} : { shown: found.show }),
      })
      writeStep(
        tx,
        run,
        at,
        { state: 'done', result: result.value, size: result.size, ask: null, wakeAt: null, endedAt: now },
        false,
      )
    }
    changeRun(tx, run, { state: 'queued', wakeAt: null })
  })
  held.env.told({ kind: 'step', run, ...at, state: call && approved ? 'started' : call ? 'failed' : 'done' })
  held.later(run)
}
