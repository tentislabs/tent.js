import { limitDefaults } from '../core/internal.ts'
import type { FileName, Store } from '../data/index.ts'
import { applySteps } from '../data/index.ts'
import { dropWaits, loadWaits } from './eventWaits.ts'
import type { Closing } from './face.ts'
import type { Held } from './held.ts'
import { storesOf } from './places.ts'
import type { RunRow } from './rows.ts'
import { earliest, readOf, readRun, readRunRows, removeRun, stepOf } from './rows.ts'
import { runsTable, stepsTable } from './tables.ts'
import { projectLimit } from './projectLimit.ts'
import { pastKeep } from './removal.ts'
import { runTableSteps } from './tableSteps.ts'
import { unfinished } from './states.ts'

/** The earliest moment at which a waiting run, or a start that waits for its pace, must wake, but of a paused flow. */
const wakeIn = (store: Store, paused: string[] = []): number | undefined =>
  earliest(store, runsTable.name, 'wakeAt', {
    all: [
      { col: 'state', in: ['waiting', 'queued'] },
      ...(paused.length ? [{ not: { col: 'flow', in: paused } }] : []),
    ],
  })

/** The earliest moment at which a waiting run must wake, among the shared file and the files that are open. */
export function earliestWake(held: Held): number | undefined {
  let first: number | undefined
  const paused = [...held.paused]
  for (const { store } of storesOf(held.env)) {
    const wake = wakeIn(store, paused)
    if (wake !== undefined && (first === undefined || wake < first)) first = wake
  }
  return first
}

/**
 * The runs of one store that are due: each waiting run whose time has come, and each start that waits for its pace
 * whose moment came; with `begun` each run that was queued or under way too.
 */
export function dueIn(store: Store, now: number, begun: boolean): RunRow[] {
  const woken = {
    all: [
      { col: 'state', in: ['waiting', 'queued'] },
      { col: 'wakeAt', atMost: new Date(now) },
    ],
  }
  return readRunRows(store, begun ? { any: [{ col: 'state', in: ['queued', 'running'] }, woken] } : woken)
}

/** The waiting runs of one store whose step was begun and is out to no worker: a step that waited in the queue of the engine. */
export function queuedIn(store: Store): string[] {
  const rows = readOf(store, { from: stepsTable.name, where: { col: 'state', is: 'started' } })
  const runs = new Set<string>()
  for (const row of Array.isArray(rows) ? rows : []) {
    const step = stepOf(row)
    if (step && !step.out) runs.add(step.run)
  }
  return [...runs].filter((run) => readRun(store, run)?.state === 'waiting')
}

/** How long a run that has ended is kept, by the project of the version that runs now. */
const runsKept = (held: Held): number | undefined =>
  held.live === undefined ? limitDefaults.project.runsKept : projectLimit(held, held.live, 'runsKept')

/**
 * A file of a tenant was opened. Its runs are the runner's from here on: the waits of its steps are noted, each
 * run that is due is taken up, and each that ended longer ago than `limits.runsKept` is removed. The file may
 * have been opened by a write that is still under way, so the work is done once that has ended.
 */
export function fileOpened(held: Held, file: FileName): void {
  setImmediate(() => {
    if (held.closed || !held.started) return
    const { env } = held
    const isOpen = env.files?.open().some((one) => one.table === file.table && one.id === file.id)
    const store = isOpen ? env.files?.of(file) : undefined
    if (!store) return
    // A file that holds the run tables of an earlier layout gains what they lack, its rows kept.
    const steps = runTableSteps(store.layout(), { make: false })
    if (steps.length) store.write((tx) => applySteps(tx, store, steps), { steps: true })
    loadWaits(held, { store, file })
    const kept = runsKept(held)
    const before = kept === undefined ? undefined : env.clock.now() - kept
    const old = before === undefined ? [] : pastKeep(held, readRunRows(store, undefined), before)
    if (old.length)
      store.write((tx) => {
        for (const run of old) removeRun(tx, run.id)
        env.removed(
          old.map((run) => run.id),
          tx,
        )
      })
    for (const run of dueIn(store, env.clock.now(), true)) held.take(run.id)
    held.rearm()
  })
}

/**
 * A file of a tenant is about to close. Answers what the directory keeps of its runs: the earliest moment one of
 * them must wake, which is now for a run that was begun and has not ended, the versions that its unfinished runs
 * are pinned to, and the events they wait for. The runner notes the waits of the file no more.
 */
export function fileClosing(held: Held, file: FileName): Closing {
  const store = held.env.files?.of(file)
  dropWaits(held, file)
  return store ? closingOf(store, held.env.clock.now(), [...held.paused]) : { versions: [], waits: [] }
}

/**
 * What a store says of its runs at a moment, as the directory keeps it of a file that closes: a run of a flow that
 * is paused wakes nothing. It only reads.
 */
export function closingOf(store: Store, now: number, paused: string[] = []): Closing {
  const runs = readRunRows(store, { col: 'state', in: unfinished })
  // A start that waits for its pace wakes at its moment, as a waiting run does.
  const begun = runs.some(
    (run) =>
      run.state !== 'waiting' && !(run.state === 'queued' && run.wakeAt !== undefined) && !paused.includes(run.flow),
  )
  const wake = begun ? now : wakeIn(store, paused)
  const steps = readOf(store, { from: stepsTable.name, where: { col: 'state', is: 'waiting' } })
  const waits = new Set<string>()
  for (const row of Array.isArray(steps) ? steps : []) {
    const event = stepOf(row)?.waitsFor?.event
    if (event !== undefined) waits.add(event)
  }
  return {
    ...(wake === undefined ? {} : { dueAt: wake }),
    versions: [...new Set(runs.map((run) => run.version))].sort(),
    waits: [...waits].sort(),
  }
}
