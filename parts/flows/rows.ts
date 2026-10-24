import type { Caller } from '../core/index.ts'
import type { Plan } from '../core/internal.ts'
import type { Row, Store, Tx } from '../data/index.ts'
import type { By, Leave, RunState, StepAt, StepEnded } from './face.ts'
import { runsTable, scheduleTable, stepsTable } from './tables.ts'
import { isWritten } from '../core/internal.ts'

/** The system, as the caller that reads and writes the tables of the runner, and as the starter of a run nobody started. */
export const system = { kind: 'system' } as const satisfies Caller & By

/** What the run tables are read from: a store, or the write that is open. */
export type Source = Store | Tx

const isStore = (source: Source): source is Store => 'write' in source

/** Carries a plan out on a store or inside a write. */
export const readOf = (source: Source, plan: Plan): unknown =>
  isStore(source) ? source.read(plan, system).value : source.read(plan, system)

/** Carries a piece of writing out: in a write of its own on a store, and as part of the write that is open. */
export const inWrite = <T>(source: Source, work: (tx: Tx) => T): T =>
  isStore(source) ? source.write(work).value : work(source)

/** A step whose result is larger than this many bytes is read without its result, which is read when a pass comes to it. */
const smallResult = 4096

/** One row of `_t_runs`, as the runner holds it. */
export interface RunRow {
  id: string
  flow: string
  kind: string
  version: string
  state: RunState
  input?: unknown
  event?: unknown
  startedBy: By
  as: 'system' | 'starter'
  parent?: string
  parentStep?: StepAt
  top: string
  leave?: Leave
  thread?: string
  given?: object
  wakeAt?: number
  answer?: unknown
  error?: Record<string, unknown>
  used: object[]
  workedMs: number
  createdAt: number
  endedAt?: number
  // What the run is about, by which a start joins it and an event stops it; and the run it goes on from.
  key?: string
  from?: string
  // The trace the run stands in, which it carries on when it wakes, also in another program.
  trace?: string
}

/** One row of `_t_steps`, as the runner holds it. `whole` is false where its result was left unread for its size. */
export interface StepRow {
  run: string
  name: string
  repeat: number
  state: 'started' | 'waiting' | 'done' | 'failed'
  result?: unknown
  size: number
  error?: Record<string, unknown>
  show?: unknown
  ask?: { n: number; name?: string; nth?: number }
  agreed?: { name: string; nth: number; made?: true; answer?: unknown }[]
  // What the step waits for: an event, with the filter over its data, or a person.
  waitsFor?: { event?: string; where?: object; person?: true }
  wakeAt?: number
  tries: number
  startedAt?: number
  endedAt?: number
  // What the work of the step kept of where it is.
  progress?: unknown
  // The try that is out to a worker now, and what the tries before it left.
  out?: Out
  away?: Away
  // The count of the runs of `step.many`.
  many?: Record<string, unknown>
  whole: boolean
}

/** A try of a step that is out to a worker: its task, the worker, its kind, its number, when it was handed out and started, and its times. */
export interface Out {
  task: string
  worker: string
  kind: string
  try: number
  at: number
  ms: number
  reserve: number
  startedAt?: number
}

/** What the tries of a step before the one that is out left: how many were handed out and lost, the kind it is at, and whether it goes alone. */
export interface Away {
  handed: number
  lost: number
  worker?: string
  alone?: true
}

const isOut = (value: unknown): value is Out =>
  isWritten(value) && typeof value.task === 'string' && typeof value.try === 'number'

const awayOf = (value: unknown): Away | undefined =>
  isWritten(value)
    ? {
        handed: Number(value.handed ?? 0),
        lost: Number(value.lost ?? 0),
        ...(typeof value.worker === 'string' ? { worker: value.worker } : {}),
        ...(value.alone === true ? { alone: true as const } : {}),
      }
    : undefined

/** The milliseconds of a moment as a store answers it, or nothing. */
const ms = (value: unknown): number | undefined =>
  value instanceof Date ? value.getTime() : typeof value === 'number' ? value : undefined

const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

const states: RunState[] = ['queued', 'running', 'waiting', 'done', 'failed', 'stopped']
const leaves: Leave[] = ['agreed', 'trusted', 'none']

/** Reads what a store answered as one row of `_t_runs`. */
function runOf(row: unknown): RunRow | undefined {
  if (!isWritten(row) || typeof row.id !== 'string') return undefined
  const by = isWritten(row.startedBy) ? row.startedBy : {}
  const kind = by.kind === 'user' || by.kind === 'key' || by.kind === 'visitor' ? by.kind : 'system'
  const step = isWritten(row.parentStep) ? row.parentStep : undefined
  const wakeAt = ms(row.wakeAt)
  const endedAt = ms(row.endedAt)
  const leave = leaves.find((one) => one === row.leave)
  const [parent, thread, key, from, trace] = [
    textOf(row.parent),
    textOf(row.thread),
    textOf(row.key),
    textOf(row.from),
    textOf(row.trace),
  ]
  return {
    id: row.id,
    flow: String(row.flow),
    kind: String(row.kind),
    version: String(row.version),
    state: states.find((one) => one === row.state) ?? 'failed',
    startedBy: {
      kind,
      ...(typeof by.id === 'string' ? { id: by.id } : {}),
      ...(by.fresh === true ? { fresh: true as const } : {}),
    },
    as: row.as === 'starter' ? 'starter' : 'system',
    top: String(row.top),
    used: Array.isArray(row.used) ? row.used.filter(isWritten) : [],
    workedMs: typeof row.workedMs === 'number' ? row.workedMs : 0,
    createdAt: ms(row.createdAt) ?? 0,
    ...(row.input === undefined ? {} : { input: row.input }),
    ...(row.event === undefined ? {} : { event: row.event }),
    ...(parent ? { parent } : {}),
    ...(step ? { parentStep: { name: String(step.name), repeat: Number(step.repeat) } } : {}),
    ...(leave ? { leave } : {}),
    ...(thread ? { thread } : {}),
    ...(isWritten(row.given) ? { given: row.given } : {}),
    ...(wakeAt === undefined ? {} : { wakeAt }),
    ...(row.answer === undefined ? {} : { answer: row.answer }),
    ...(isWritten(row.error) ? { error: row.error } : {}),
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(key ? { key } : {}),
    ...(from ? { from } : {}),
    ...(trace ? { trace } : {}),
  }
}

/** Reads what a store answered as one row of `_t_steps`. */
export function stepOf(row: unknown, whole = true): StepRow | undefined {
  if (!isWritten(row) || typeof row.run !== 'string') return undefined
  const state = row.state === 'started' || row.state === 'waiting' || row.state === 'failed' ? row.state : 'done'
  const ask = isWritten(row.ask) && typeof row.ask.n === 'number' ? row.ask : undefined
  const waits = isWritten(row.waitsFor) ? row.waitsFor : undefined
  const [wakeAt, startedAt, endedAt] = [ms(row.wakeAt), ms(row.startedAt), ms(row.endedAt)]
  return {
    run: row.run,
    name: String(row.name),
    repeat: Number(row.repeat),
    state,
    size: typeof row.size === 'number' ? row.size : 0,
    tries: typeof row.tries === 'number' ? row.tries : 0,
    whole,
    ...(row.result === undefined ? {} : { result: row.result }),
    ...(isWritten(row.error) ? { error: row.error } : {}),
    ...(row.show === undefined ? {} : { show: row.show }),
    ...(row.progress === undefined || row.progress === null ? {} : { progress: row.progress }),
    ...(isOut(row.out) ? { out: row.out } : {}),
    ...(awayOf(row.away) ? { away: awayOf(row.away) } : {}),
    ...(isWritten(row.many) ? { many: row.many } : {}),
    ...(ask
      ? {
          ask: {
            n: Number(ask.n),
            ...(typeof ask.name === 'string' ? { name: ask.name } : {}),
            ...(typeof ask.nth === 'number' ? { nth: ask.nth } : {}),
          },
        }
      : {}),
    ...(Array.isArray(row.agreed)
      ? {
          agreed: row.agreed.filter(isWritten).map((one) => ({
            name: String(one.name),
            nth: Number(one.nth),
            ...(one.made === true ? { made: true as const } : {}),
            ...(one.answer === undefined ? {} : { answer: one.answer }),
          })),
        }
      : {}),
    ...(waits
      ? {
          waitsFor: {
            ...(typeof waits.event === 'string' ? { event: waits.event } : {}),
            ...(isWritten(waits.where) ? { where: waits.where } : {}),
            ...(waits.person === true ? { person: true as const } : {}),
          },
        }
      : {}),
    ...(wakeAt === undefined ? {} : { wakeAt }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(endedAt === undefined ? {} : { endedAt }),
  }
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Answers one run by its id, or nothing where there is none. */
export const readRun = (source: Source, id: string): RunRow | undefined =>
  runOf(readOf(source, { from: runsTable.name, one: 'get', id }))

/** Answers the runs that a filter fits, in the order of their ids. */
export const readRunRows = (source: Source, where: Plan['where'], more: Partial<Plan> = {}): RunRow[] =>
  listOf(readOf(source, { from: runsTable.name, ...(where ? { where } : {}), ...more })).flatMap(
    (row) => runOf(row) ?? [],
  )

/** The columns of a step but its result. */
const besideResult = Object.keys(stepsTable.columns).filter((name) => name !== 'result')

/**
 * Answers the saved steps of a run, in two reads: each step whose result is small whole, and of every other
 * step everything but its result.
 */
export function readSteps(source: Source, run: string): StepRow[] {
  const small = listOf(
    readOf(source, {
      from: stepsTable.name,
      where: {
        all: [
          { col: 'run', is: run },
          { col: 'size', atMost: smallResult },
        ],
      },
    }),
  )
  const large = listOf(
    readOf(source, {
      from: stepsTable.name,
      where: {
        all: [
          { col: 'run', is: run },
          { col: 'size', above: smallResult },
        ],
      },
      pick: besideResult,
    }),
  )
  return [...small.flatMap((row) => stepOf(row) ?? []), ...large.flatMap((row) => stepOf(row, false) ?? [])]
}

/** The moments that the steps of a run which have ended ended at. */
export const endsOf = (rows: Iterable<StepRow>): StepEnded[] =>
  [...rows].flatMap((row) =>
    (row.state === 'done' || row.state === 'failed') && row.endedAt !== undefined
      ? [{ name: row.name, repeat: row.repeat, at: row.endedAt }]
      : [],
  )

/** Answers one step whole, by its run, its name and its repeat number. */
export const readStep = (source: Source, run: string, at: StepAt): StepRow | undefined =>
  stepOf(readOf(source, { from: stepsTable.name, one: 'get', id: { run, name: at.name, repeat: at.repeat } }))

/** A moment as a store takes it, and `null` for none, which clears the column. */
const moment = (at: number | undefined | null): Date | null | undefined =>
  at === undefined ? undefined : at === null ? null : new Date(at)

/** The values of a row as a write takes them: a moment as a `Date`, and what is left out left as it stands. */
function values(given: Record<string, unknown>, moments: string[]): Row {
  const made: Row = {}
  for (const [name, value] of Object.entries(given)) {
    if (value === undefined) continue
    made[name] = moments.includes(name) && (typeof value === 'number' || value === null) ? moment(value) : value
  }
  return made
}

const runMoments = ['wakeAt', 'createdAt', 'endedAt']
const stepMoments = ['wakeAt', 'startedAt', 'endedAt']

/** What a write gives a column: its value, or `null` to clear it. */
export type Given<Held> = { [Name in keyof Held]?: Held[Name] | null }

/** Adds a run. */
export const addRun = (tx: Tx, run: RunRow): void => void tx.add(runsTable.name, values({ ...run }, runMoments), system)

/** Changes columns of a run. */
export const changeRun = (tx: Tx, id: string, given: Given<RunRow>): void =>
  void tx.change(runsTable.name, id, values(given, runMoments), system)

/** Writes a step: adds its row where `fresh` says that there is none, and changes it otherwise. */
export function writeStep(tx: Tx, run: string, at: StepAt, given: Given<StepRow>, fresh: boolean): void {
  const { whole: _, ...columns } = given
  const made = values(columns, stepMoments)
  // A step is read by the size of its result, so a row that holds no result yet holds the size of none.
  if (fresh) tx.add(stepsTable.name, { size: 0, tries: 0, ...made, run, name: at.name, repeat: at.repeat }, system)
  else tx.change(stepsTable.name, { run, name: at.name, repeat: at.repeat }, made, system)
}

/** Removes a run with its steps. */
export function removeRun(tx: Tx, run: string): void {
  for (const step of readSteps(tx, run))
    tx.remove(stepsTable.name, { run, name: step.name, repeat: step.repeat }, system)
  tx.remove(runsTable.name, run, system)
}

/** One row of `_t_schedule`. */
export interface ScheduleRow {
  flow: string
  trigger: string
  nextAt: number
}

/** Answers every row of the schedule. */
export const readSchedule = (source: Source): ScheduleRow[] =>
  listOf(readOf(source, { from: scheduleTable.name })).flatMap((row) =>
    isWritten(row) ? [{ flow: String(row.flow), trigger: String(row.trigger), nextAt: ms(row.nextAt) ?? 0 }] : [],
  )

/** Writes one row of the schedule, and removes it where it is handed no moment. */
export function writeSchedule(tx: Tx, row: { flow: string; trigger: string; nextAt?: number }, fresh: boolean): void {
  const key = { flow: row.flow, trigger: row.trigger }
  if (row.nextAt === undefined) tx.remove(scheduleTable.name, key, system)
  else if (fresh) tx.add(scheduleTable.name, { ...key, nextAt: new Date(row.nextAt) }, system)
  else tx.change(scheduleTable.name, key, { nextAt: new Date(row.nextAt) }, system)
}

/** The earliest moment among the given column of the rows that a plan answers first, or nothing. */
export function earliest(source: Source, from: string, column: string, where?: Plan['where']): number | undefined {
  const [first] = listOf(
    readOf(source, {
      from,
      // A row that holds no moment lies after no moment, and is left out with no read of it.
      where: { all: [...(where ? [where] : []), { col: column, atLeast: new Date(0) }] },
      sort: [{ by: column }],
      limit: 1,
      pick: [column],
    }),
  )
  return isWritten(first) ? ms(first[column]) : undefined
}
