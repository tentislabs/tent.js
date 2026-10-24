import { TentError } from '../core/index.ts'
import type { Tx } from '../data/index.ts'
import type { Carried, Ended, OutNow, StepAt } from './face.ts'
import { askedForTask } from './asking.ts'
import { flowOf, triesLeftOut } from './flowOf.ts'
import { eventOf, inputOf } from './handed.ts'
import type { Held } from './held.ts'
import { asSaved, isTriedAgain, keptError, seenOf } from './kept.ts'
import { fileOf, readIn, runOf, storesOf, writeIn } from './places.ts'
import type { Away, Given, Out, RunRow, StepRow } from './rows.ts'
import { changeRun, endsOf, readOf, readRun, readStep, readSteps, stepOf, writeStep } from './rows.ts'
import { isFinal } from './states.ts'
import { stepsTable } from './tables.ts'
import { isWritten } from '../core/internal.ts'

/** What the project states of a kind of worker, as the runner reads it. */
interface KindOf {
  lost: number
  mayStop: boolean
  // Whether a task that was lost beside others is handed out alone from then on: `false` for a kind that never does.
  alone: boolean
  next?: { kind: string; after: string[] }
}

/** The key of one step of a run in the memory of the runner. */
export const stepKey = (run: string, at: StepAt): string => `${run}\n${at.repeat}\n${at.name}`

/** What the runner keeps in memory of a step that waits for a worker: how long a try may take, what it reserves, how often it is tried. */
export interface Queued {
  run: string
  step: StepAt
  kind: string
  ms: number
  reserve: number
  tries: { max: number; wait: number }
}

/** Reads what the project of a version states of a kind of worker. */
function kindOf(held: Held, version: string, kind: string): KindOf {
  const workers: unknown = held.env.description(version).project.workers
  const stated: unknown = isWritten(workers) ? workers[kind] : undefined
  const record = isWritten(stated) ? stated : {}
  const next = isWritten(record.next) ? record.next : undefined
  return {
    lost: typeof record.lost === 'number' ? record.lost : 10,
    mayStop: record.mayStop === true,
    alone: record.alone !== false,
    ...(next && typeof next.kind === 'string'
      ? { next: { kind: next.kind, after: Array.isArray(next.after) ? next.after.map(String) : [] } }
      : {}),
  }
}

/** The error of a task that is not out, or not to the worker that names it. */
const oldTry = (task: string): TentError =>
  new TentError(
    'T5108',
    `The task ${JSON.stringify(task).slice(0, 60)} is not out: it ended, or was handed out again.`,
    {
      fix: 'Drop what was kept of it: its work is the current try of another task.',
    },
  )

/** The error of work that no worker of its kind could carry out. */
const noWorker = (kind: string, why: string): TentError =>
  new TentError('T5107', `No worker of the kind ${JSON.stringify(kind)} carried the work out: ${why}.`, {
    fix: 'Join a worker of that kind, or name a `next` kind for the cause.',
  })

/** The steps of a task, as the rows say, where the memory of the runner holds them no more. */
function stepsOfTask(held: Held, task: string): { run: string; step: StepAt }[] {
  const kept = held.tasks.get(task)
  if (kept) return kept
  return outNowOf(held).find((one) => one.task === task)?.steps ?? []
}

/** Every task that is out, as the rows of the steps of the shared file and of each open file say. */
export function outNowOf(held: Held): OutNow[] {
  const found = new Map<string, OutNow>()
  for (const { store } of storesOf(held.env)) {
    const rows = readOf(store, { from: stepsTable.name, where: { col: 'state', is: 'started' } })
    for (const row of Array.isArray(rows) ? rows : []) {
      const step = stepOf(row)
      const out = step?.out
      if (!step || !out) continue
      const one = found.get(out.task) ?? {
        task: out.task,
        worker: out.worker,
        kind: out.kind,
        at: out.at,
        ms: out.ms,
        reserve: out.reserve,
        steps: [],
        ...(out.startedAt === undefined ? {} : { startedAt: out.startedAt }),
      }
      // The leave of its run, which the outside calls of the work are held to, also after the engine opened again.
      const leave = readRun(store, step.run)?.leave
      one.steps.push({ run: step.run, step: { name: step.name, repeat: step.repeat }, ...(leave ? { leave } : {}) })
      found.set(out.task, one)
    }
  }
  return [...found.values()]
}

/** Wakes a run in the write that saved the end of its step: it is taken up once that write has ended. */
function wake(held: Held, tx: Tx, run: string): void {
  const row = readRun(tx, run)
  if (!row || isFinal(row)) return
  changeRun(tx, run, { state: 'queued', wakeAt: null })
  held.later(run)
}

/**
 * The engine picked a worker for a task. Notes the hand-out in the row of each step, which moves `handed` on:
 * a step's try is that count. Answers what each step carries, or nothing for a step that waits no more.
 */
export async function outSteps(
  held: Held,
  steps: { run: string; step: StepAt }[],
  o: { task: string; worker: string; kind: string },
): Promise<(Carried | undefined)[]> {
  const { env } = held
  const answers: (Carried | undefined)[] = []
  const taken: { run: string; step: StepAt }[] = []
  for (const { run, step } of steps) {
    const queued = held.queued.get(stepKey(run, step))
    const row = readStep(readIn(env, run), run, step)
    const owner = runOf(env, run)
    if (!queued || !row || row.state !== 'started' || row.out || !owner) {
      answers.push(undefined)
      continue
    }
    held.queued.delete(stepKey(run, step))
    const away: Away = { ...(row.away ?? { handed: 0, lost: 0 }), handed: (row.away?.handed ?? 0) + 1 }
    const out: Out = { ...o, try: away.handed, at: env.clock.now(), ms: queued.ms, reserve: queued.reserve }
    // The run is running while its task is out, as it waits while its step stands in the queue.
    writeIn(env, run, (tx) => {
      writeStep(tx, run, step, { out, away }, false)
      if (readRun(tx, run)?.state === 'waiting') changeRun(tx, run, { state: 'running' })
    })
    held.outTries.set(stepKey(run, step), queued)
    taken.push({ run, step })
    const rows = readSteps(readIn(env, run), run)
    const saved = rows
      .filter((one) => one.state === 'done' || one.state === 'failed')
      .map((one) => ({
        name: one.name,
        repeat: one.repeat,
        ...(one.state === 'done' ? { result: one.result } : { failed: seenOf(one.error) }),
      }))
    const progress = isWritten(row.progress) ? row.progress : undefined
    answers.push({
      try: away.handed,
      ms: queued.ms,
      startedBy: owner.startedBy,
      ...(owner.leave ? { leave: owner.leave } : {}),
      // As the code of the flow is handed them on the main pass: read back through their types.
      ...(owner.input === undefined
        ? {}
        : { input: inputOf(flowOf(held, owner.version, owner.flow).record, owner.input) }),
      ...(owner.event === undefined ? {} : { event: eventOf(env.description(owner.version), owner.event) }),
      saved,
      ended: endsOf(rows),
      ...(progress
        ? {
            progress: { value: progress.value, files: Array.isArray(progress.files) ? progress.files.map(String) : [] },
          }
        : {}),
    })
  }
  if (taken.length) held.tasks.set(o.task, taken)
  return answers
}

/** The work of a task began: the moment is noted, and the time of its try runs from it. */
export function startedTask(held: Held, task: string): void {
  const { env } = held
  const startedAt = env.clock.now()
  let ms: number | undefined
  let first: StepAt | undefined
  for (const { run, step } of stepsOfTask(held, task)) {
    const out = readStep(readIn(env, run), run, step)?.out
    if (out?.task !== task) continue
    writeIn(env, run, (tx) => writeStep(tx, run, step, { out: { ...out, startedAt } }, false))
    ms = Math.max(ms ?? 0, out.ms)
    first ??= step
  }
  if (ms === undefined || !first) return
  const name = first.name
  // Work that hangs is ended by the time of its try: the task is taken back, and the try failed. One timer holds the
  // whole task, whose entries began together.
  held.timers.get(task)?.()
  const cancel = env.clock.setTimer(startedAt + ms, () => {
    held.timers.delete(task)
    const out = stepsOfTask(held, task).some(
      ({ run, step }) => readStep(readIn(env, run), run, step)?.out?.task === task,
    )
    if (!out) return
    env.take?.(task)
    void endedTask(held, task, [
      {
        failed: new TentError('T0008', `A try of the step ${JSON.stringify(name)} took longer than its time.`, {
          fix: 'Raise `time` of the step, or keep progress and hand the work back.',
        }),
      },
    ]).catch(() => undefined)
  })
  held.timers.set(task, cancel)
}

/** What a step that failed for good, or that is to be tried again, is written as. */
function failure(row: StepRow, error: unknown, tries: { max: number; wait: number }, now: number): Given<StepRow> {
  const failed = row.tries + 1
  if (!isTriedAgain(error) || failed >= tries.max)
    return { state: 'failed', tries: failed, error: keptError(error), endedAt: now }
  return { state: 'waiting', tries: failed, error: keptError(error), wakeAt: now + tries.wait * 6 ** (failed - 1) }
}

/**
 * What a try that failed is written as. One that ended for want of memory on a kind whose `next` names `'memory'`
 * goes there at once, counted as a failed try, with its progress, and starts the count of `lost` anew.
 */
function failedOf(
  held: Held,
  row: StepRow,
  end: { failed: unknown; cause?: 'memory' },
  version: string,
  tries: Queued['tries'],
  now: number,
): Given<StepRow> {
  const kind = row.out?.kind ?? row.away?.worker ?? 'any'
  const stated = kindOf(held, version, kind)
  const given = failure(row, end.failed, tries, now)
  if (end.cause !== 'memory' || !stated.next?.after.includes('memory') || given.state === 'failed') return given
  // It counts as a failed try, and is given at once to the kind that has more memory.
  return {
    tries: given.tries,
    error: given.error,
    away: { ...(row.away ?? { handed: 0 }), lost: 0, worker: stated.next.kind },
  }
}

/** How many tries of the run of an action may be lost: `limits.lost` of the action, 3 where it states none. */
function actionLost(held: Held, run: RunRow): number {
  const record: unknown = held.env.description(run.version).functions[run.flow]
  const limits: unknown = isWritten(record) ? record.limits : undefined
  const stated = isWritten(limits) ? limits.lost : undefined
  return typeof stated === 'number' ? stated : 3
}

/** What a try that was lost is written as: counted against `lost` of the kind or against `tries`, and given again, or failed. */
function lostOf(
  held: Held,
  row: StepRow,
  end: Ended & { lost: string },
  kind: string,
  owner: RunRow,
  tries: Queued['tries'],
  now: number,
): Given<StepRow> {
  const away: Away = row.away ?? { handed: 0, lost: 0 }
  if (end.lost === 'writer') return { away }
  const { version } = owner
  const ofKind = kindOf(held, version, kind)
  // The run of an action is given again `limits.lost` times of the action at the most, 3 where it states none.
  const stated = owner.kind === 'action' ? { ...ofKind, lost: Math.min(ofKind.lost, actionLost(held, owner)) } : ofKind
  // A try lost in silence alone on its worker may be what ended it: it counts against `tries`, and is given again at once.
  // The run of an action has one try: what is lost of it counts against `lost` alone.
  const silentAlone =
    owner.kind !== 'action' &&
    end.lost === 'silent' &&
    !('beside' in end && end.beside) &&
    !stated.mayStop &&
    stated.alone
  if (silentAlone) {
    const failed = row.tries + 1
    if (failed >= tries.max)
      return {
        state: 'failed',
        tries: failed,
        error: keptError(noWorker(kind, `its worker fell silent each of ${failed} tries`)),
        endedAt: now,
        away,
      }
    return { tries: failed, away }
  }
  const lost = away.lost + 1
  const alone = end.lost === 'silent' && 'beside' in end && end.beside && stated.alone ? { alone: true as const } : {}
  if (lost < stated.lost) return { away: { ...away, lost, ...alone, ...(away.alone ? { alone: true as const } : {}) } }
  // As many tries as `lost` allows were lost to the machines of the kind: it goes to `next`, or fails.
  if (stated.next?.after.includes('lost'))
    return {
      away: { handed: away.handed, lost: 0, worker: stated.next.kind, ...(away.alone ? { alone: true as const } : {}) },
    }
  return {
    state: 'failed',
    error: keptError(noWorker(kind, `${lost} tries were lost to its machines`)),
    endedAt: now,
    away: { ...away, lost },
  }
}

/** Saves the end of each step of a task in one write for each file, and wakes their runs. T5108 for a task that is not out. */
export async function endedTask(held: Held, task: string, ends: Ended[]): Promise<void> {
  const { env } = held
  const steps = stepsOfTask(held, task)
  const rows = steps.map(({ run, step }) => readStep(readIn(env, run), run, step))
  if (!steps.length || rows.some((row) => row?.out?.task !== task)) throw oldTry(task)
  held.tasks.delete(task)
  held.timers.get(task)?.()
  held.timers.delete(task)
  const now = env.clock.now()
  for (const [i, { run, step }] of steps.entries()) {
    const row = rows[i]
    const end = ends[i] ?? ends[0]
    const owner = runOf(env, run)
    if (!row?.out || !end || !owner) continue
    const key = stepKey(run, step)
    const tries = held.outTries.get(key)?.tries ?? triesLeftOut
    held.outTries.delete(key)
    let given: Given<StepRow>
    // An entry whose run was stopped while the task was out keeps nothing of what the task gave it.
    if (isFinal(owner)) given = {}
    else if ('done' in end) {
      const saved = asSaved(end.done)
      given = {
        state: 'done',
        ...(saved.value === undefined ? {} : { result: saved.value }),
        size: saved.size,
        endedAt: now,
      }
    } else if ('failed' in end)
      // A call that nobody agreed to has the step wait for the person, as here, and its try is no failed one.
      given = askedForTask(held, owner, row, end.failed, now) ?? failedOf(held, row, end, owner.version, tries, now)
    else given = lostOf(held, row, end, row.out.kind, owner, tries, now)
    writeIn(env, run, (tx) => {
      writeStep(tx, run, step, { ...given, out: null }, false)
      wake(held, tx, run)
      env.settled?.(tx, { task, run, step, entry: i, entries: steps.length, end, shared: fileOf(run) === undefined })
    })
    if (isFinal(owner)) continue
    env.told({
      kind: 'step',
      run,
      name: step.name,
      repeat: step.repeat,
      state: given.state === 'done' ? 'done' : given.state === 'failed' ? 'failed' : 'waiting',
      ...(given.ask ? { show: given.show, ask: given.ask.n } : {}),
    })
  }
}

/** No worker of its kind took a step within `wait`: it goes to `next` where that names `'wait'`, and fails otherwise. */
export function noneFor(held: Held, run: string, step: StepAt): void {
  const { env } = held
  const key = stepKey(run, step)
  const queued = held.queued.get(key)
  held.queued.delete(key)
  const row = readStep(readIn(env, run), run, step)
  const owner = runOf(env, run)
  if (row?.state !== 'started' || row.out || !owner) return
  const kind = row.away?.worker ?? queued?.kind ?? 'any'
  const stated = kindOf(held, owner.version, kind)
  const given: Given<StepRow> = stated.next?.after.includes('wait')
    ? { away: { ...(row.away ?? { handed: 0, lost: 0 }), lost: 0, worker: stated.next.kind } }
    : {
        state: 'failed',
        error: keptError(noWorker(kind, 'none could take it within `wait`')),
        endedAt: env.clock.now(),
      }
  writeIn(env, run, (tx) => {
    writeStep(tx, run, step, given, false)
    wake(held, tx, run)
  })
}

/**
 * A limit of use stopped a step that waits before it was handed out. Its try fails with the error, and it is tried
 * again after its wait as any failed try is, or with `final` its step fails at once: a limit that it can never fit.
 */
export function limitedFor(held: Held, run: string, step: StepAt, error: TentError, final: boolean): void {
  const { env } = held
  const key = stepKey(run, step)
  const queued = held.queued.get(key)
  held.queued.delete(key)
  const row = readStep(readIn(env, run), run, step)
  if (row?.state !== 'started' || row.out || !runOf(env, run)) return
  const now = env.clock.now()
  const given: Given<StepRow> = final
    ? { state: 'failed', tries: row.tries + 1, error: keptError(error), endedAt: now }
    : failure(row, error, queued?.tries ?? triesLeftOut, now)
  writeIn(env, run, (tx) => {
    writeStep(tx, run, step, given, false)
    wake(held, tx, run)
  })
  env.told({
    kind: 'step',
    run,
    name: step.name,
    repeat: step.repeat,
    state: given.state === 'failed' ? 'failed' : 'waiting',
  })
}

/** Keeps what the work of a task kept of where it is. T5108 for a task that is not out. */
export async function progressOfTask(
  held: Held,
  task: string,
  kept: { value: unknown; files: string[] },
): Promise<void> {
  const { env } = held
  const steps = stepsOfTask(held, task)
  for (const { run, step } of steps) {
    const row = readStep(readIn(env, run), run, step)
    if (row?.out?.task !== task) throw oldTry(task)
    writeIn(env, run, (tx) =>
      writeStep(tx, run, step, { progress: { value: asSaved(kept.value).value, files: kept.files } }, false),
    )
  }
  if (!steps.length) throw oldTry(task)
}

/** Whether something waits for a run: a caller of `wait`, or a run whose caller waits for it, up its calls. */
export function waitedRun(held: Held, run: string): boolean {
  for (let id: string | undefined = run, depth = 0; id && depth < 200; depth += 1) {
    if (held.waiters.has(id)) return true
    id = runOf(held.env, id)?.parent
  }
  return false
}

/**
 * Ends what a run has out and in the queue: it was stopped. A task is taken back where every run it holds a step of
 * has ended; a batch whose other entries go on goes on, and nothing else of it is touched.
 */
export function stopWork(held: Held, run: string): void {
  for (const [key, queued] of held.queued)
    if (queued.run === run) {
      held.queued.delete(key)
      held.env.unqueue?.(run, queued.step)
    }
  for (const [task, steps] of held.tasks) {
    if (!steps.some((one) => one.run === run)) continue
    const goesOn = steps.some((one) => {
      const owner = one.run === run ? undefined : runOf(held.env, one.run)
      return owner !== undefined && !isFinal(owner)
    })
    if (goesOn) continue
    held.tasks.delete(task)
    held.timers.get(task)?.()
    held.timers.delete(task)
    held.env.take?.(task)
  }
}
