import type { Plan } from '../core/internal.ts'
import type { RunsAsked, RunView, StepView } from './face.ts'
import { thrownOf } from './kept.ts'
import type { RunRow, Source, StepRow } from './rows.ts'
import { readOf, readRun, readRunRows, stepOf } from './rows.ts'
import { stepsTable } from './tables.ts'

/** Answers the steps of a run whole, in the order in which they began. */
export function stepsInOrder(source: Source, run: string): StepRow[] {
  const rows = readOf(source, { from: stepsTable.name, where: { col: 'run', is: run } })
  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => stepOf(row) ?? [])
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
}

/** One step as whoever reads its run sees it. */
function stepView(step: StepRow): StepView {
  return {
    name: step.name,
    repeat: step.repeat,
    state: step.state,
    ...(step.startedAt !== undefined && step.endedAt !== undefined
      ? { ms: Math.max(0, step.endedAt - step.startedAt) }
      : {}),
    ...(step.show === undefined ? {} : { show: step.show }),
    ...(step.ask ? { ask: step.ask.n } : {}),
    ...(step.result === undefined ? {} : { result: step.result }),
    ...(step.error ? { error: thrownOf(step.error) } : {}),
  }
}

/** A run as whoever reads it sees it, with its steps. */
function viewOf(source: Source, run: RunRow): RunView {
  return {
    id: run.id,
    flow: run.flow,
    kind: run.kind,
    version: run.version,
    state: run.state,
    startedBy: run.startedBy,
    as: run.as,
    top: run.top,
    used: run.used,
    steps: stepsInOrder(source, run.id).map(stepView),
    ...(run.thread ? { thread: run.thread } : {}),
    ...(run.parent ? { parent: run.parent } : {}),
    ...(run.parentStep ? { parentStep: run.parentStep } : {}),
    ...(run.input === undefined ? {} : { input: run.input }),
    ...(run.event === undefined ? {} : { event: run.event }),
    ...(run.answer === undefined ? {} : { answer: run.answer }),
    ...(run.error ? { error: thrownOf(run.error) } : {}),
    ...(run.given ? { given: run.given } : {}),
    ...(run.key === undefined ? {} : { key: run.key }),
    ...(run.from === undefined ? {} : { from: run.from }),
    ...(run.trace ? { trace: run.trace } : {}),
  }
}

/** Answers one run by its id, as whoever reads it sees it. */
export function readView(source: Source, id: string): RunView | undefined {
  const run = readRun(source, id)
  return run ? viewOf(source, run) : undefined
}

/**
 * Answers the runs of one store that fit what is asked, the newest first, and of those as many as `newest` says,
 * each with the moment it was added, by which the runs of several files are laid in one order.
 */
export function foundViews(source: Source, o: RunsAsked): { at: number; view: RunView }[] {
  const by = o.startedBy
  // Who caused a run is kept as one value, so it is held here and not by the store.
  const runs = readRunRows(source, { all: filtersOf(o) }, { sort: [{ by: 'createdAt', down: true }] }).filter(
    (run) => !by || (run.startedBy.kind === by.kind && run.startedBy.id === by.id),
  )
  return (o.newest === undefined ? runs : runs.slice(0, o.newest)).map((run) => ({
    at: run.createdAt,
    view: viewOf(source, run),
  }))
}

/** The filters by which a store finds the runs that are asked for, but who caused them. */
export function filtersOf(o: RunsAsked): NonNullable<Plan['where']>[] {
  return [
    ...(o.flow === undefined ? [] : [{ col: 'flow', is: o.flow }]),
    ...(o.thread === undefined ? [] : [{ col: 'thread', is: o.thread }]),
    ...(o.top === undefined ? [] : [{ col: 'top', is: o.top }]),
    ...(o.states === undefined ? [] : [{ col: 'state', in: o.states }]),
    ...(o.key === undefined ? [] : [{ col: 'key', is: o.key }]),
    ...(o.since === undefined ? [] : [{ col: 'createdAt', atLeast: new Date(o.since) }]),
    ...(o.before === undefined ? [] : [{ col: 'createdAt', below: new Date(o.before) }]),
  ]
}
