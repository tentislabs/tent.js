import { TentError } from '../core/index.ts'
import type { FileName, Tx } from '../data/index.ts'
import { addRunOf } from './adding.ts'
import { answerStep, madeOf, yesOf } from './asking.ts'
import { ended, endOf } from './ending.ts'
import { deliver, loadWaits } from './eventWaits.ts'
import type { RunsAsked, Runner, RunnerEnv, RunView } from './face.ts'
import { dueIn, earliestWake, fileClosing, fileOpened, queuedIn } from './fileRuns.ts'
import { findIn } from './finding.ts'
import { flowOf } from './flowOf.ts'
import {
  endedTask,
  limitedFor,
  noneFor,
  outNowOf,
  outSteps,
  progressOfTask,
  startedTask,
  stopWork,
  waitedRun,
} from './handOut.ts'
import type { Held } from './held.ts'
import { endedInMany } from './manyCount.ts'
import { moveRun, replayRun } from './moving.ts'
import { fileOf, readIn, runOf, storeOf, storesOf, writeIn } from './places.ts'
import type { RunRow } from './rows.ts'
import { changeRun, earliest, readRun, readRunRows, removeRun, system } from './rows.ts'
import { fireDue, syncSchedule, timesOf } from './schedule.ts'
import { replayAllOf, stopAllOf } from './bulk.ts'
import { inEveryFile } from './everyFile.ts'
import { inTurn, ordersTurns } from './pace.ts'
import { pausedIn, writePaused } from './pausing.ts'
import { stoppedBy } from './stopOn.ts'
import { hasOnStop, raiseEnded, stopMark, stoppingOf } from './stopping.ts'
import { scheduleTable } from './tables.ts'
import { takeUp } from './takeUp.ts'
import { countAgain, countOut } from './together.ts'
import { heldBy, releaseThread } from './threads.ts'
import { startedBy } from './triggers.ts'
import { pastKeep } from './removal.ts'
import { isFinal } from './states.ts'
import { readView } from './views.ts'
import { waitingStepNamesOf } from './waitingStepNamesOf.ts'

/**
 * Takes what the engine knows of one app. Answers the runner of that app: it adds runs, takes up every run that is
 * due, carries each pass out with the saved results of its steps, and keeps one timer, at the earliest wake of a
 * run and the next turn of a schedule. Everything is kept in the run tables of the store it was handed.
 */
export function createRunner(env: RunnerEnv): Runner {
  // The runs that were added or woken inside a write, which are taken up once that write has ended.
  const pending = new Set<string>()
  let flushing = false
  let hurried = false
  let armedAt: number | undefined

  const held: Held = {
    env,
    drivers: new Map(),
    atWork: new Map(),
    waiters: new Map(),
    events: new Map(),
    turns: new Map(),
    served: new Map(),
    queued: new Map(),
    tasks: new Map(),
    outTries: new Map(),
    timers: new Map(),
    working: new Map(),
    paused: new Set(pausedIn(env.store)),
    started: false,
    closed: false,
    epoch: 0,
    take: (run) => {
      if (held.started && !held.closed) takeUp(held, run)
    },
    later: (run, soon) => {
      pending.add(run)
      if (soon && !hurried) {
        hurried = true
        queueMicrotask(flush)
      }
      if (flushing) return
      flushing = true
      setImmediate(flush)
    },
    rearm: () => {
      if (held.closed || !held.started) return
      const at = dueAt()
      if (at === armedAt && held.cancel) return
      held.cancel?.()
      delete held.cancel
      armedAt = at
      if (at !== undefined) held.cancel = env.clock.setTimer(at, wakeNow)
    },
    stop: (run) => stop(run),
    fire: (tx, what) => runner.fired(tx, what),
    stopMany: (run, step) => {
      const stopping = readRunRows(readIn(env, run), { col: 'parent', is: run }).filter(
        (one) => one.parentStep?.name === step.name && one.parentStep.repeat === step.repeat && !isFinal(one),
      )
      for (const one of stopping) stop(one.id)
    },
    freed: (counted) => {
      if (held.closed) return
      // A run that waited its turn under that count is taken up, the one that waited longest first.
      const waiting = counted === undefined ? undefined : held.turns.get(counted)
      // A run that is taken up at this very moment finds its own turn. Of the others, the higher `order` goes
      // first, and with `turns` each key in turn.
      // The rows are read only for a flow that orders its turns so.
      const ids = [...(waiting ?? [])].filter((run) => !held.atWork.has(run))
      const first = ids.length ? runOf(env, ids[0]) : undefined
      const free = first && ordersTurns(held, first) ? ids.flatMap((run) => runOf(env, run) ?? []) : []
      const served = held.served.get(counted ?? '') ?? new Map<string, number>()
      const [next] = free.length ? inTurn(held, free, served) : []
      const id = next?.id ?? ids[0]
      if (id !== undefined && counted !== undefined) {
        // The key that takes its turn is noted, so that with `turns` the keys take turns.
        if (next) held.served.set(counted, served.set(next.key ?? '', Math.max(0, ...served.values()) + 1))
        waiting?.delete(id)
        held.take(id)
      }
      held.rearm()
    },
  }

  /** The earliest moment at which a run of the shared file or of an open file wakes, or a schedule has its next turn. */
  function dueAt(): number | undefined {
    const wake = earliestWake(held)
    const turn = earliest(env.store, scheduleTable.name, 'nextAt')
    return wake === undefined ? turn : turn === undefined ? wake : Math.min(wake, turn)
  }

  function find(o: RunsAsked & { of?: FileName }): RunView[]
  function find(o: RunsAsked & { of: 'all' }): Promise<RunView[]>
  function find(o: RunsAsked & { of?: FileName | 'all' }): RunView[] | Promise<RunView[]> {
    return findIn(env, o)
  }

  /** The timer fired: every waiting run whose time has come is taken up, and every schedule whose turn it is fires once. */
  function wakeNow(): void {
    delete held.cancel
    armedAt = undefined
    if (held.closed) return
    // Of the starts that wait for their pace, the higher `order` goes first, and with `turns` each key in turn.
    const due = storesOf(env).flatMap(({ store }) => dueIn(store, env.clock.now(), false))
    for (const run of inTurn(held, due, undefined)) held.take(run.id)
    fireTurns()
    held.rearm()
  }

  /** Fires each timed trigger whose turn has come, with the moment it was due as the event of its run. */
  function fireTurns(): void {
    fireDue(held, (tx, flow, at) => {
      if (held.live === undefined) return
      const event = { kind: 'time', at: new Date(at).toISOString() }
      try {
        addRunOf(held, { flow, version: held.live, event, startedBy: system }, tx, stopLater)
      } catch (error) {
        // A turn that `together` refuses starts no run, and the schedule goes on to its next time.
        if (!(error instanceof TentError && error.code === 'T7103')) throw error
      }
    })
  }

  /** Stops a run, and every run it waits for. A run whose `onStop` is at work is stopped at once. */
  function stop(id: string): void {
    const run = runOf(env, id)
    if (!run || isFinal(run)) return
    writeIn(env, id, (tx) => markStopped(tx, run))
    stoppedNow(run)
  }

  /**
   * Writes a run as stopped, inside a write of its file, and raises `run.stopped` there. Where its flow states
   * `onStop`, the run is written as one whose `onStop` follows, and is stopped once that has ended.
   */
  function markStopped(tx: Tx, run: RunRow): void {
    if (hasOnStop(held, run)) {
      changeRun(tx, run.id, { state: 'queued', wakeAt: null, error: stopMark(tx, run) })
      return
    }
    // A second stop of a run whose `onStop` works ends the stop: its mark and the progress it kept leave the row.
    const marked = stoppingOf(run) ? { error: null } : {}
    changeRun(tx, run.id, { state: 'stopped', endedAt: env.clock.now(), wakeAt: null, ...marked })
    endedInMany(held, tx, run, 'stopped')
    releaseThread(held, tx, run)
    raiseEnded(held, tx, run, 'stopped')
  }

  /** Ends what this program holds of a run that was written as stopped, and stops every run that it called. */
  function stoppedNow(run: RunRow): void {
    const id = run.id
    // A run that waited its turn waits no more: the next one is taken up in its place.
    for (const waiting of held.turns.values()) waiting.delete(id)
    // What it has out with a worker, and in the queue, ends with it.
    stopWork(held, id)
    held.atWork.get(id)?.pass?.finish({ kind: 'stopped' })
    // A run whose `onStop` follows is taken up for it, and whoever waits for it is answered once it has ended.
    const row = runOf(env, id)
    if (row && row.state !== 'stopped' && stoppingOf(row)) held.later(id)
    else ended(held, run, 'stopped')
    // A run that it called lives in its file, but for one that always lives in the shared file.
    const places = fileOf(id) ? [readIn(env, id), env.store] : [env.store]
    for (const store of places) for (const called of readRunRows(store, { col: 'parent', is: id })) stop(called.id)
    held.rearm()
  }

  const stopLater = (run: string): void => void setImmediate(() => stop(run))

  /** Takes up the runs that wait to be taken up: each that nothing works on, and else its work goes on with another pass. */
  function flush(): void {
    flushing = false
    hurried = false
    if (!pending.size) return
    const runs = [...pending]
    pending.clear()
    for (const one of runs) {
      const work = held.atWork.get(one)
      if (work) work.again = true
      else held.take(one)
    }
    held.rearm()
  }

  const runner: Runner = {
    live(version) {
      held.live = version
      syncSchedule(held)
      // Every waiting run of a flow that states `moveRuns: 'whenSafe'` is tried against the version that is live now.
      const waiting = storesOf(env).flatMap(({ store }) =>
        readRunRows(store, { col: 'state', in: ['queued', 'waiting'] }),
      )
      for (const run of waiting) {
        if (run.version === version || held.atWork.has(run.id)) continue
        let moves = false
        try {
          moves = flowOf(held, version, run.flow).record.moveRuns === 'whenSafe'
        } catch {
          // A flow that the new version does not hold moves none of its runs.
        }
        if (moves) moveRun(held, run.id, version)
      }
      held.rearm()
    },
    waits: () => [...held.events.keys()].sort(),
    handed(tx, what) {
      // A file that was opened a moment ago may not have had its waits read yet: they are read in this write.
      loadWaits(held, { store: tx, ...(what.file ? { file: what.file } : {}) })
      for (const run of deliver(held, tx, what.event, what.data, what.file)) held.later(run)
    },
    opened: (file) => fileOpened(held, file),
    closing: (file) => fileClosing(held, file),
    add: (o, tx) => addRunOf(held, o, tx, stopLater),
    fired(tx: Tx, what) {
      if ('event' in what && what.file) loadWaits(held, { store: tx, file: what.file })
      if ('event' in what) for (const run of deliver(held, tx, what.event, what.data, what.file)) held.later(run)
      // The runs that the event stops are stopped in its write; what this program holds of them, once it has ended.
      if ('event' in what)
        for (const run of stoppedBy(held, tx, what)) {
          markStopped(tx, run)
          setImmediate(() => {
            const row = held.closed ? undefined : runOf(env, run.id)
            if (row && (row.state === 'stopped' || stoppingOf(row))) stoppedNow(row)
          })
        }
      if (held.live === undefined) return
      const version = held.live
      for (const { flow, event } of startedBy(tx, env.description(version), what)) {
        // Of the flows that a write sets off, those that a person agreed to run as agreed.
        const leave = what.agreed?.includes(flow) ? 'agreed' : what.leave
        addRunOf(
          held,
          {
            flow,
            version,
            event,
            startedBy: system,
            ...(leave ? { leave } : {}),
            ...(what.file ? { file: what.file } : {}),
          },
          tx,
          stopLater,
          true,
        )
      }
    },
    // A `where` through a link reads the linked row in the file of the write that it would follow.
    wouldStart: (what) =>
      held.live === undefined
        ? []
        : startedBy((what.file && env.files?.of(what.file)) || env.store, env.description(held.live), what).map(
            (one) => one.flow,
          ),
    yes: (at, call) => yesOf(held, at, call),
    made: (at, call, answer) => madeOf(held, at, call, answer, flowOf(held, at.version, at.flow).limits.result),
    wait(id) {
      const run = runOf(env, id)
      if (!run) return Promise.reject(new TentError('T0001', `No run ${JSON.stringify(id).slice(0, 80)} is there.`))
      const end = endOf(run)
      if (end) return 'answer' in end ? Promise.resolve(end.answer) : Promise.reject(end.error)
      const waiting = new Promise<unknown>((done, failed) => {
        const waiters = held.waiters.get(id) ?? []
        held.waiters.set(id, waiters)
        waiters.push({ done, failed })
      })
      // The time a run waits for a run it called does not count as its work: it waits meanwhile.
      const caller = run.parent ? held.atWork.get(run.parent) : undefined
      const pass = caller?.pass
      if (!run.parent || !caller || !pass) return waiting
      const parent = run.parent
      const counted = caller.counted
      caller.calls += 1
      if (caller.calls === 1) {
        countOut(held, caller)
        pass.idleSince = performance.now()
        if (runOf(env, parent)?.state === 'running') {
          writeIn(env, parent, (tx) => changeRun(tx, parent, { state: 'waiting', wakeAt: null }))
          env.told({ kind: 'run', run: parent, state: 'waiting' })
        }
      }
      const back = (): void => {
        caller.calls -= 1
        if (caller.calls > 0 || pass.idleSince === undefined) return
        pass.idle += performance.now() - pass.idleSince
        delete pass.idleSince
        if (pass.over || held.atWork.get(parent) !== caller) return
        countAgain(held, caller, counted)
        env.told({ kind: 'run', run: parent, state: 'running' })
      }
      return waiting.finally(back)
    },
    read(id) {
      const store = storeOf(env, id)
      return store ? readView(store, id) : undefined
    },
    heldBy: (thread) => heldBy(env.store, thread),
    find,
    approve: (run, step, data, o) => answerStep(held, run, step, true, data, o),
    refuse: (run, step, data, o) => answerStep(held, run, step, false, data, o),
    stop,
    stopAll: (o, how) => stopAllOf(held, o, how?.dry === true),
    replayAll: (o, how) => replayAllOf(held, o, how?.dry === true),
    pause(flow) {
      // A name that is no flow of the live version is T0001.
      if (held.live !== undefined) flowOf(held, held.live, flow)
      held.paused.add(flow)
      writePaused(env.store, [...held.paused])
      held.rearm()
    },
    async resume(flow) {
      if (!held.paused.delete(flow)) return
      writePaused(env.store, [...held.paused])
      // What waited while the flow was paused goes in its order, and by `order` and `turns` where the flow states them:
      // the runs whose time came, and the starts that were kept.
      const now = env.clock.now()
      const due = storesOf(env)
        .flatMap(({ store }) =>
          readRunRows(store, {
            all: [
              { col: 'flow', is: flow },
              { col: 'state', in: ['queued', 'waiting'] },
            ],
          }),
        )
        .filter((run) => run.state === 'queued' || (run.wakeAt !== undefined && run.wakeAt <= now))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      for (const run of inTurn(held, due, undefined)) held.take(run.id)
      held.rearm()
      // A file of a tenant that holds a run of the flow and is closed is opened: the runner takes its runs up there.
      await inEveryFile(
        env.store,
        env.files,
        (store) =>
          readRunRows(store, {
            all: [
              { col: 'flow', is: flow },
              { col: 'state', in: ['queued', 'waiting'] },
            ],
          }),
        (found) => found.length > 0,
      )
    },
    paused: () => [...held.paused].sort(),
    catchUp(flow, o) {
      const version = held.live
      // A name that is no flow of the live version is T0001.
      if (version !== undefined) flowOf(held, version, flow)
      const times = timesOf(held, flow, o.from, o.to)
      if (o.dry === true || version === undefined) return { times, runs: [] }
      // Each time is started as the clock would have started it, held by the flow's `together` and `pace`.
      const runs = times.map((at) =>
        addRunOf(
          held,
          { flow, version, event: { kind: 'time', at: new Date(at).toISOString() }, startedBy: system },
          undefined,
          stopLater,
        ),
      )
      return { times, runs: runs.filter((run) => run !== '') }
    },
    used(id, o) {
      writeIn(env, id, (tx) => {
        const run = readRun(tx, id)
        if (!run) return
        const same = (one: object): boolean =>
          Reflect.get(one, 'day') === o.day &&
          Reflect.get(one, 'name') === o.name &&
          Reflect.get(one, 'answeredBy') === o.answeredBy
        const before = run.used.find(same)
        const units: Record<string, number> = { ...Object(before ? Reflect.get(before, 'units') : {}) }
        for (const [unit, amount] of Object.entries(o.units)) units[unit] = (units[unit] ?? 0) + amount
        const used = [
          ...run.used.filter((one) => !same(one)),
          { day: o.day, name: o.name, answeredBy: o.answeredBy, units },
        ]
        changeRun(tx, id, { used })
      })
    },
    move: (run, version, o) => moveRun(held, run, version, o),
    replay: (run, o) => replayRun(held, run, o),
    remove(o, tx) {
      const by = o.startedBy
      const before = o.endedBefore
      // A run is removed by its own end where it stands at the top of its calls, and else with its top.
      const fitting = (runs: RunRow[]): RunRow[] =>
        (before === undefined ? runs : pastKeep(held, runs, before)).filter(
          (run) => !by || (run.startedBy.kind === by.kind && run.startedBy.id === by.id),
        )
      const removeIn = (to: Tx, runs: RunRow[]): number => {
        for (const run of runs) removeRun(to, run.id)
        if (runs.length)
          env.removed(
            runs.map((run) => run.id),
            to,
          )
        return runs.length
      }
      if (tx) return removeIn(tx, fitting(readRunRows(tx, undefined)))
      // With no write handed in, the shared file and each file that is open is asked, and written only where a run goes.
      let removed = 0
      for (const { store } of storesOf(env)) {
        const runs = fitting(readRunRows(store, undefined))
        if (runs.length) removed += store.write((to) => removeIn(to, runs)).value
      }
      return removed
    },
    out: (steps, o) => outSteps(held, steps, o),
    started: (task) => startedTask(held, task),
    ended: (task, ends) => endedTask(held, task, ends),
    none: (run, step) => noneFor(held, run, step),
    limited: (run, step, error, final) => limitedFor(held, run, step, error, final),
    progress: (task, kept) => progressOfTask(held, task, kept),
    outNow: () => outNowOf(held),
    waited: (run) => waitedRun(held, run),
    waitingStepNames() {
      const names = new Map<string, Set<string>>()
      for (const { store } of storesOf(env))
        for (const [flow, steps] of Object.entries(waitingStepNamesOf(store)))
          names.set(flow, new Set([...(names.get(flow) ?? []), ...steps]))
      return Object.fromEntries(
        [...names].sort(([a], [b]) => (a < b ? -1 : 1)).map(([flow, steps]) => [flow, [...steps].sort()]),
      )
    },
    drive(kind, driver, o) {
      held.drivers.set(kind, { driver, ...(o?.tries === undefined ? {} : { tries: o.tries }) })
    },
    start(o = {}) {
      held.closed = false
      held.started = true
      // The pause is read anew: another machine may have written it while this one was a reader.
      held.paused = new Set(pausedIn(env.store))
      loadWaits(held)
      // The runs that stand at the start are those that were under way: with `hold` they wait for `takeUp`, and a run
      // added meanwhile runs as any new run does.
      const due = storesOf(env).flatMap(({ store }) => dueIn(store, env.clock.now(), true).map((run) => run.id))
      // A run whose step waited in the queue of the engine for a worker is taken up again: nothing of the queue was written.
      const queued = storesOf(env).flatMap(({ store }) =>
        queuedIn(store).map((run) => ({ run, row: readRun(store, run) })),
      )
      held.atStart = () => {
        held.atStart = undefined
        for (const run of due) held.take(run)
        for (const { run, row } of queued) {
          // The run of an action that nobody called from a step waited for its caller, who is gone with the program.
          if (row?.kind === 'action' && !row.parent) stop(run)
          else held.take(run)
        }
        // A turn of the schedule that was missed while the program was off fires now, once.
        fireTurns()
        held.rearm()
      }
      if (!o.hold) runner.takeUp()
    },
    takeUp() {
      if (held.closed || !held.started) return
      held.atStart?.()
    },
    async close(o = {}) {
      held.closed = true
      held.epoch += 1
      held.cancel?.()
      delete held.cancel
      armedAt = undefined
      // A run stops at a step boundary: the step that is under way is done and saved, and no next one begins.
      const works = [...held.atWork.values()]
      for (const work of works) if (work.pass) work.pass.over = true
      // A step that waits for a run it called is no work that a closing waits for: that run goes on no more. Work
      // that never settles holds the closing no longer than it is given: its result is then not saved, and the step
      // runs again from its start when the app is opened again.
      let timer: NodeJS.Timeout | undefined
      let timeUp = false
      const given =
        o.within === undefined
          ? undefined
          : new Promise<void>((done) => {
              timer = setTimeout(() => {
                timeUp = true
                done()
              }, o.within)
            })
      for (const { pass, calls } of works)
        while (!timeUp && pass && calls === 0 && pass.inFlight.size)
          await Promise.race([Promise.allSettled([...pass.inFlight]), ...(given ? [given] : [])])
      clearTimeout(timer)
      if (timeUp)
        for (const { pass, calls } of works) if (pass && calls === 0 && pass.inFlight.size) pass.stopped = true
      held.atWork.clear()
      held.working.clear()
      held.turns.clear()
      held.started = false
      // A caller that waits for a run is answered: the run goes on no more in this runner, which no longer tells its end.
      const closing = new TentError('T0013', 'The app was closed while this call waited for its run.', {
        fix: 'Ask for the run again once the app is open: `{ run }` of its call, or `app.runs.wait`.',
      })
      for (const waiters of held.waiters.values()) for (const waiter of waiters) waiter.failed(closing)
      held.waiters.clear()
      const at = dueAt()
      return at === undefined ? {} : { dueAt: at }
    },
  }
  return runner
}
