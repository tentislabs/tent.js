import { existsSync } from 'node:fs'
import { runEnded } from '../ai/runFiles.ts'
import { join } from 'node:path'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { codes } from '../../core/internal.ts'
import { applySteps } from '../../data/index.ts'
import type { At, Fired, RunnerEnv, StepAt, Waiting } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { failureOf, isShown } from '../door/failure.ts'
import { holdsWorkKeys } from '../keys/kept.ts'
import { storedLimit } from '../limits.ts'
import { runsKeptGone } from '../stored/keptFile.ts'
import type { Opened } from '../opened.ts'
import { addVersion, holdVersion, versionsOf } from '../versions.ts'
import { listAt } from '../files.ts'
import { arrowOf, flowBodyOf } from './code.ts'
import type { Flowing } from './face.ts'
import { fileOfRow } from './fileOf.ts'
import { dbOf, inRunContext, servedFor } from './inside.ts'
import { driveActions, heavyAction } from './heavyAction.ts'
import { agreedOr, flowHeld, setOffHeld } from './leave.ts'
import { offeredFlow } from './offered.ts'
import { called } from '../door/call.ts'
import { forgetOnce, onceIn } from './once.ts'
import { noteRunFile, openOf } from './openWrite.ts'
import { stepBound, stepSeal } from './sealedSteps.ts'
import { callerOfBy, callFlow, flowOf, inputFor, startFlow } from './words.ts'
import { said, saidTold } from './said.ts'
import { driveAgents, holdsAgent } from '../ai/driving.ts'
import { driveImports, withImportFlow } from '../import/asRun.ts'
import { offeredAgent } from '../ai/offered.ts'
import { roundSaved } from '../ai/told.ts'
import { asPiece, measured } from '../counts/cpu.ts'
import { runCounted } from '../counts/runs.ts'
import { insideRun, runAdded, runTold, runUnder } from '../trace/runs.ts'
import { noteTouched } from '../touched.ts'

/** Whether an agent of the app scores a share of its runs: only then is a run that ended looked at for a score. */
const scoresRuns = (o: Opened): boolean =>
  Object.values(o.description.flows).some((flow) => Reflect.get(Object(flow.agent), 'score') !== undefined)

/** Writes the failure of the work of a step into the log, under the flow and the step, and hands it on. */
function logged<T>(o: Opened, at: At, work: () => T): T {
  const failed = (error: unknown): never => {
    const ref = at.step ? failureOf(o, `${at.flow}: ${at.step.name}`, error).ref : undefined
    // The step keeps the reference under which the log holds what went wrong, which a driver may tell its model.
    if (ref && typeof error === 'object' && error !== null) Reflect.set(error, 'ref', ref)
    throw error
  }
  let answer: T
  try {
    answer = work()
  } catch (error) {
    return failed(error)
  }
  const waited: unknown = answer
  if (waited instanceof Promise) waited.catch(failed).catch(() => undefined)
  return answer
}

/** Makes the versions loadable again that runs which have not ended are pinned to, so that a restart loses none of them. */
async function holdNeeded(o: Opened, versions: string[]): Promise<void> {
  for (const version of versions) {
    if (version === o.version || o.versions?.has(version)) continue
    const kept = versionsOf(o)
    try {
      // In development a version is the list of its files, which stands beside its place.
      const place = join(kept, version)
      if (listAt(place)) await addVersion(o, place)
      else if (existsSync(place)) await holdVersion(o, version)
    } catch {
      // A version that cannot be loaded any more fails its runs when they are taken up, each with T0007.
    }
  }
}

/**
 * Takes what the engine holds of an app that needs a runner. Loads the flows, makes the run tables where the data
 * holds none yet, makes the runner of the app over its store and its clock, names the live version, and starts
 * it: every run that is due is taken up. With `later`, the runs that were under way wait for the opening to answer.
 * From here on the engine holds the flows of the app.
 */
export async function startRunner(o: Opened, how: { later?: true } = {}): Promise<Flowing> {
  if (o.flows) return o.flows
  const { closingOf, createRunner, neededVersions, replayTo, runTableSteps, threadsTable } = await import(
    '../../flows/index.ts'
  )
  // A run table that the data lacks is made, and one of an earlier layout gains what it lacks, its rows kept. An app
  // with an agent keeps which run holds each conversation.
  const threads = holdsAgent(o) && !o.store.layout().some((one) => one.name === threadsTable.name)
  const steps = [
    ...runTableSteps(o.store.layout(), { make: true }),
    ...(threads ? [{ do: 'addTable' as const, table: threadsTable.name, layout: threadsTable }] : []),
  ]
  if (steps.length) o.store.write((tx) => applySteps(tx, o.store, steps), { steps: true })
  // The hub of the work of workers, once it is loading: an app loads it where its description or its runs ask for it.
  let hubMade: Promise<void> | undefined
  /** The caller who caused a run, whom what its steps use is counted by: nobody where that user is gone. */
  const causer = (run: string): Caller | undefined => {
    const row = runner.read(run)
    try {
      return row ? callerOfBy(o, row.startedBy) : undefined
    } catch {
      return undefined
    }
  }
  const env: RunnerEnv = {
    store: o.store,
    ...(o.files ? { files: o.files } : {}),
    clock: o.clock,
    // The runner reads the flow that the engine makes for imports beside the app's own.
    description: (version) => withImportFlow(servedFor(o, version).description),
    body: (version, flow, which) => flowBodyOf(servedFor(o, version), flow, which),
    arrow: (version, flow, which) => arrowOf(servedFor(o, version), flow, which),
    // The input of a run that goes on as a new one is held to its flow as every start is.
    input: (version, flow, given) => {
      const { flows } = servedFor(o, version).description
      return Object.hasOwn(flows, flow) ? inputFor(o, flow, flows[flow], given, { kind: 'system' }) : given
    },
    seal: (at, value) => stepSeal(o).close(value, stepBound(at)),
    open: (at, sealed) => stepSeal(o).open(sealed, stepBound(at)),
    // A step is a piece of work of its own, which the processor time of what it does is booked to.
    inside: (at, work) =>
      asPiece(o, at.flow, causer(at.run), () => logged(o, at, () => insideRun(o, at, () => inRunContext(o, at, work)))),
    db: (at) => dbOf(o, at),
    caller: (by) => callerOfBy(o, by),
    // Where the app lets workers join, the work of a step that states a kind of worker is handed to them.
    queue: (w: Waiting) =>
      o.work
        ? o.work.queue(w)
        : unwaited(
            o,
            'Handing a step to the workers',
            makeHub().then(() => o.work?.queue(w)),
          ),
    unqueue: (run: string, step: StepAt) => o.work?.unqueue(run, step),
    take: (task: string) => o.work?.take(task),
    // The pass is carried out again beside the runner, up to the end of the step, with nothing saved by it.
    // Its processor time is read whole around it, and booked to the run as `cpuMs`.
    onThread: (at, working) =>
      measured(o, at.flow, causer(at.run), async () => {
        const run = runner.read(at.run)
        // The run of an action carries the action out, as its caller asked it, on the thread it is handed.
        if (run?.kind === 'action') {
          const reads = Reflect.get(Object(run.given), 'reads') === true
          return called(o, run.flow, run.input, {
            caller: at.as,
            inline: true,
            ...(reads ? { reads: true } : {}),
            say: (value) => said(o, at, value),
          })
        }
        const body = flowBodyOf(servedFor(o, at.version), at.flow)
        const { step } = at
        if (!run || !body || !step)
          throw new TentError('T0013', `No step of ${at.flow} can be carried out beside its run.`)
        // A step that is done answers its result there, and one that failed for good its error, as on the main pass.
        const saved = (name: string, repeat: number): { result: unknown } | { error: TentError } | undefined => {
          const held = run.steps.find((one) => one.name === name && one.repeat === repeat)
          if (held?.state === 'done') return { result: held.result }
          return held?.state === 'failed' && held.error ? { error: held.error } : undefined
        }
        // The code on the thread is handed what the main pass is handed: the input and the event read back through their types, and the user.
        const handed = at.handed ?? { input: run.input, event: run.event }
        return inRunContext(o, at, () =>
          replayTo(body, {
            event: handed.event,
            input: handed.input,
            ...(handed.user ? { user: handed.user } : {}),
            db: dbOf(o, at),
            step,
            saved,
            ...(at.ended ? { ended: at.ended } : {}),
            ...(working ? { working } : {}),
          }),
        )
      }),
    told: (what) => {
      runTold(o, what)
      // Under `tent test`, the test that runs touched the flow whose run works.
      if (what.kind === 'run' && what.state === 'running') noteTouched('flows', runner.read(what.run)?.flow ?? '')
      tenants?.told(what)
      runCounted(o, runner, what, causer)
      // The text of a round is gone from memory in the write that saves the round, and the pages that follow it are told.
      if (what.kind === 'step' && what.state === 'done') roundSaved(o, what.run, what.name)
      saidTold(o, what)
      // What a run read of the files of tenants is forgotten once it ended.
      if (what.kind === 'run' && ['done', 'failed', 'stopped'].includes(what.state)) runEnded(o, what.run)
      // A run whose agent scores a share of its runs is scored once it ended, outside it, with no one waiting.
      if (what.kind === 'run' && what.state === 'done' && scoresRuns(o))
        unwaited(
          o,
          'Scoring a run',
          import('../ai/scores.ts').then(({ scoreWhenDue }) => scoreWhenDue(o, what.run)),
        )
      o.hub?.told(what)
      // The readers are told it too, for the pages that follow the run there.
      o.machine.writer?.runs({ t: 'run', told: what })
      if (what.kind === 'run' && (what.state === 'failed' || what.state === 'stopped')) raiseEnd(what.run)
      if (what.kind !== 'step' || what.state !== 'done') return
      const flow = runner.read(what.run)?.flow ?? ''
      o.raise('step.done', { app: o.app, flow, run: what.run, step: what.name })
    },
    joined: (what) => pacedLine(o, 'joined the run of its key that was under way', what),
    dropped: (what) => pacedLine(o, 'was dropped by `pace.drop`', what),
    removed: (runs, tx) => {
      const now = o.clock.now()
      forgetOnce(tx, runs, now)
      // The files kept for the runs lie in the shared file: a run of a tenant's file lets them go once its write is done.
      if (!o.tenantFiles) runsKeptGone(tx, runs, now)
      else
        unwaited(
          o,
          'Letting go of the files kept for removed runs',
          Promise.resolve().then(() => o.store.write((shared) => runsKeptGone(shared, runs, now))),
        )
    },
    remembered: async (at, r) => (await import('../remember/remembered.ts')).rememberedStep(o, at, r, flowRecordOf(at)),
    remember: (at, r, answer) =>
      unwaited(
        o,
        'Remembering the answer of a step',
        import('../remember/remembered.ts').then(({ keepStep }) => keepStep(o, at, r, flowRecordOf(at), answer)),
      ),
    // The machine time of a try that a worker held is booked in the write that settles it.
    settled: (tx, s) => o.work?.settled(tx, s),
    // What the work of a step says goes to whoever follows its run.
    say: (at, value) => said(o, at, value),
  }
  /** Raises `run.failed` or `run.stopped` for whoever listens to the engine, once the write that ended the run has ended. */
  function raiseEnd(id: string): void {
    const run = runner.read(id)
    if (!run) return
    const told = { app: o.app, flow: run.flow, run: id, ...(run.key === undefined ? {} : { key: run.key }) }
    if (run.state === 'stopped') {
      o.raise('run.stopped', told)
      return
    }
    // What a caller would see of the error: its own words where it is the caller's to see, and else the sentence of T0009.
    const seen = isShown(run.error)
      ? { code: run.error.code, message: run.error.message }
      : { code: 'T0009', message: codes.T0009.sentence }
    const step = run.steps.find((one) => one.state === 'failed')?.name
    const failure = { ...seen, ...(step === undefined ? {} : { step }) }
    o.raise('run.failed', { ...told, failure })
  }
  /** The record of the flow of a run, as its version describes it. */
  function flowRecordOf(at: At): Record<string, unknown> {
    const description = servedFor(o, at.version).description
    return Object(
      Object.hasOwn(description.flows, at.flow) ? description.flows[at.flow] : description.functions[at.flow],
    )
  }
  const runner = createRunner(env)
  // A run stands in the trace of what added it: the call, the step or the request under way.
  const add = runner.add.bind(runner)
  runner.add = (asked, tx) => {
    const under = runUnder()
    const run = add({ ...asked, trace: under.trace }, tx)
    runAdded(o, run, under)
    return run
  }
  // The runs of an agent are its driver's, and those of an import the engine's.
  await driveAgents(o, runner)
  driveImports(o, runner)
  driveActions(runner)
  /** Loads the hub of the work of workers, once: what hands a step to a worker, or carries a background step out here. */
  const makeHub = (): Promise<void> =>
    (hubMade ??= (async () => {
      const { workHub } = await import('../work/hub.ts')
      // An app that lets no worker join loads nothing of the link: its heavy work runs here, or waits.
      const keys = o.workerKeys ?? []
      const joins = keys.length > 0 || holdsWorkKeys(o)
      const linking = joins ? (await import('../work/linking.ts')).linking : undefined
      o.work = workHub({
        o,
        runner,
        callerOf: (by) => callerOfBy(o, by),
        keys,
        insecure: o.machine.insecure,
        ...(linking ? { linking } : {}),
        // Work whose kind lets it run here is carried out on this program, as `background` is on one machine.
        here: ({ task, run, step, version, carried }) => {
          const row = runner.read(run)
          if (!row) return
          const as: Caller = row.as === 'starter' ? callerOfBy(o, row.startedBy) : { kind: 'system' }
          const at = {
            run,
            flow: row.flow,
            version,
            as,
            step,
            // The code is handed what the main pass is handed, and the user where the run runs as its starter.
            handed: { input: carried.input, event: carried.event, ...(as.user ? { user: as.user } : {}) },
          }
          Promise.resolve(env.onThread(at))
            .then(
              (done) => runner.ended(task, [{ done }]),
              (error: unknown) =>
                runner.ended(task, [
                  { failed: error instanceof TentError ? error : new TentError('T0009', String(error)) },
                ]),
            )
            .catch(() => undefined)
        },
      })
    })())
  // The work of workers is loaded where the description names a kind of worker, a key lets one join, also one kept
  // in a row, or a task was out before the opening: an app with none loads it at the first step that goes to work.
  const named = Object.keys(Object(o.description.project.workers ?? {})).length > 0
  const joins = (o.workerKeys ?? []).length > 0 || holdsWorkKeys(o)
  if (named || joins || runner.outNow().length > 0) await makeHub()
  // An app that keeps a data file for each tenant keeps a timer over its closed files, and hands events from file to file.
  const tenants = o.files ? (await import('./tenants.ts')).tenantsOf(o, runner) : undefined
  const handing = tenants ? (await import('./handing.ts')).handingOf(o, runner, tenants) : undefined
  /** The versions that runs which have not ended are pinned to: of the shared file, of each open file, and by the directory of each closed one. */
  const needed = (): string[] => [
    ...new Set([
      ...neededVersions(o.store),
      ...(o.files?.open() ?? []).flatMap((file) => {
        const store = o.files?.of(file)
        return store ? neededVersions(store) : []
      }),
      ...(tenants?.versions() ?? []),
    ]),
  ]
  const flowing: Flowing = {
    runner,
    fileOpened: (file) => tenants?.opened(file),
    fileClosing: (file) => tenants?.closing(file) ?? runner.closing(file),
    holds: (file) => tenants?.holds(file) === true,
    filesDue: () => tenants?.dueAt(),
    close: () => tenants?.close(),
    async live(version) {
      runner.live(version)
      const flows = Object.values(servedFor(o, version).description.flows)
      if (!tenants || !flows.some((one) => one.moveRuns === 'whenSafe')) return
      for (const file of tenants.withRuns()) await tenants.open(file)
      runner.live(version)
    },
    due(file) {
      const store = o.tenantFiles?.isOpen(file) ? o.files?.of(file) : undefined
      return store ? closingOf(store, o.clock.now(), runner.paused()).dueAt : undefined
    },
    async again(how = {}) {
      await holdNeeded(o, needed())
      runner.live(o.version)
      runner.start(how)
      await tenants?.start()
      await handing?.left()
      flowing.upkeep()
    },
    // Finished runs are kept for `runsKept`, and removed when the app opens and once a day after.
    upkeep: () => void runner.remove({ endedBefore: o.clock.now() - storedLimit(o.description, 'runsKept') }),
    needs: (version) => needed().includes(version),
    beforeHard(version, stop, dry) {
      const to = servedFor(o, version).description.flows
      const left: string[] = []
      // The runs of the shared file, of each open file, and of each closed file that holds one, which is opened for it.
      const places = [undefined, ...(o.files?.open() ?? []), ...(tenants?.withRuns() ?? [])]
      const runs = places.flatMap((file) =>
        runner.find({ states: ['queued', 'running', 'waiting'], ...(file ? { of: file } : {}) }),
      )
      for (const run of runs) {
        if (run.version === version) continue
        const moves = run.state !== 'running' && Object.hasOwn(to, run.flow) && to[run.flow].moveRuns === 'whenSafe'
        if (!moves || !runner.move(run.id, version, dry ? { dry: true } : {}).moved) left.push(run.id)
      }
      if (stop && !dry) for (const run of left) runner.stop(run)
      return { refused: !stop && left.length > 0, runs: left }
    },
    // A start of a flow that asks or sends, under a tool call that may not, is refused before it starts.
    start: (cx, flow, input) =>
      startFlow(o, runner, agreedOr(cx, flow, flowHeld(cx.app.description, flow)), flow, input),
    emit: (cx, event, data) => {
      // Under `tent test`, the event a test raised: a flow that listens for it later is its concern.
      noteTouched('events', event)
      const open = openOf(cx)
      if (!open) return
      const fired = { event, data, ...(open.file ? { file: open.file } : {}) }
      const held = setOff(cx, fired)
      runner.fired(open.tx, { ...fired, ...leaveOf(held) })
      handing?.emitted(open.tx, open.file, event, data)
    },
    call: (cx, flow, input) => {
      const record = flowOf(cx, flow)
      return record ? callFlow(o, runner, cx, flow, record, input) : undefined
    },
    offered: (flow, given, asked) =>
      offeredAgent(o, runner, flow, given, asked) ?? offeredFlow(o, runner, flow, given, asked),
    action: (cx, parent, input, given) => heavyAction(o, runner, cx, parent, input, given),
    once: (cx, change, input, carry) => onceIn(o, cx, change, input, carry),
    wrote: (cx, w) => {
      // The row names the file of its write: what follows in the same write is of that file too.
      const file = o.files ? fileOfRow(cx.app.description, w.table, w.row) : undefined
      if (file) noteRunFile(cx, file)
      const open = openOf(cx)
      if (!open) return
      const fired = {
        table: w.table,
        kind: w.kind,
        row: w.row,
        ...(w.before ? { before: w.before } : {}),
        ...(w.columns ? { columns: w.columns } : {}),
        ...(open.file ? { file: open.file } : {}),
      }
      runner.fired(open.tx, { ...fired, ...leaveOf(setOff(cx, fired)) })
    },
  }
  o.flows = flowing
  await flowing.again(how.later ? { hold: true } : {})
  return flowing
}

/**
 * Takes an app, the words of a piece of work that nobody waits for, and its promise. A failure of it is a line of
 * the log, and never a promise that nobody catches, which would end the program with every app in it.
 */
function unwaited(o: Opened, what: string, work: Promise<unknown>): void {
  work.catch((error: unknown) => {
    try {
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    } catch {
      // The log of an app that closed meanwhile takes no line.
    }
  })
}

/** Writes a start that joined the run of its key, or that was dropped, into the log: no start is lost in silence. */
function pacedLine(o: Opened, happened: string, what: { run?: string; flow: string; key?: string }): void {
  o.log.write('lines', {
    at: o.clock.now(),
    level: 'info',
    message: `A start of ${what.flow} ${happened}.`,
    data: JSON.stringify(what),
    name: what.flow,
    ...(what.run === undefined ? {} : { run: what.run }),
  })
}

/**
 * A write or an event under a tool call that may not set off what it would set off - a flow that sends, or one
 * that asks - is refused before it lands, unless the person agreed to it: answers the call context it lands in.
 */
function setOff(cx: CallContext, fired: Fired): CallContext {
  if (cx.run?.leave !== 'none' && cx.run?.leave !== 'trusted') return cx
  const runner = cx.app.flows?.runner
  const { held, flow } = setOffHeld(cx.app.description, runner?.wouldStart(fired) ?? [])
  return flow ? agreedOr(cx, flow, held) : cx
}

/** What the tool call above a call may do, where its run carries one. */
function leaveOf(cx: { run?: { leave?: unknown } }): { leave?: 'agreed' | 'trusted' | 'none' } {
  const leave = cx.run?.leave
  return leave === 'agreed' || leave === 'trusted' || leave === 'none' ? { leave } : {}
}
