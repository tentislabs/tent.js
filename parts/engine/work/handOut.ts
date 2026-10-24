import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { rowIds } from '../../data/index.ts'
import type { By, Carried, Runner, Waiting } from '../../flows/index.ts'
import type { Link } from '../copy/link.ts'
import { failureOf } from '../door/failure.ts'
import { dbOf } from '../flows/inside.ts'
import type { Opened } from '../opened.ts'
import { settledNow } from './settled.ts'
import type { InQueue, Joined, OutTask } from './state.ts'
import { framed, keptOfRun } from './taskFiles.ts'
import { freePlaces } from './counted.ts'
import { parentHeader } from '../trace/ids.ts'
import { runParent } from '../trace/runs.ts'

/** What a hand-out works with: the app, its runner, how a starter's caller is built, and what it is told after. */
export interface HandingOut {
  o: Opened
  runner: Runner
  callerOf(by: By): Caller
  fetch(): number
  pump(): void
  over(): boolean
}

const send = (link: Link, message: object): void => link.send(JSON.stringify(message))

/** The caller of a run as its task is carried out, and the rows of its step, read as that caller. */
async function handedOf(
  h: HandingOut,
  out: OutTask,
  w: Waiting,
  carried: Carried,
): Promise<{ as: Caller; rows?: Record<string, unknown> }> {
  const row = h.runner.read(w.run)
  const as: Caller = row?.as === 'starter' ? h.callerOf(carried.startedBy) : { kind: 'system' }
  if (!w.rows) return { as }
  // The rows of the step are read as the caller of the run, and travel with the task: as a file past `inFrame`.
  const at = { run: w.run, flow: w.flow, version: w.version, as, step: w.step }
  const rows: Record<string, unknown> = {}
  // A plan may name the input of the run and its caller, as the plan of a function does.
  const given: Record<string, unknown> = Object(carried.input)
  const resolve = (ref: object): unknown => {
    const named: unknown = Reflect.get(ref, 'input')
    if (typeof named === 'string') return given[named]
    const of: unknown = Reflect.get(ref, 'caller')
    return of === 'id' ? as.user?.id : undefined
  }
  for (const [name, plan] of Object.entries(w.rows)) {
    const stored: unknown = Reflect.get(plan, 'plan') ?? plan
    const sent = await framed(h.o, out, await dbOf(h.o, at).read(Object(stored), resolve))
    rows[name] = 'file' in sent ? { file: sent.file } : sent.value
  }
  return { as, rows }
}

/**
 * Hands one task out to a worker: one try of one step, or a batch of the entries of one definition, each the one
 * step of a run of its own. The runner notes it, and the `work` message leaves once that write is settled. A task
 * that did not say `started` within `workFetch` is taken back, and lost by the worker's word.
 */
export async function handOut(h: HandingOut, entries: InQueue[], j: Joined): Promise<void> {
  const { o, runner } = h
  const [{ w }] = entries
  const task = rowIds.next()
  const batch =
    entries.length > 1 || entries.some((one) => Reflect.get(Object(o.description.functions[one.w.flow]), 'batch'))
  const out: OutTask = {
    task,
    kind: w.kind,
    version: w.version,
    steps: entries.map((one) => ({ run: one.w.run, step: one.w.step })),
    at: o.clock.now(),
    sent: false,
    started: false,
    beside: j.out.size > 0,
    // A batch is one try, which reserves what the longest of its entries does.
    reserve: Math.max(...entries.map((one) => one.w.reserve)),
    ...(w.alone ? { alone: true } : {}),
    ...(w.uses ? { uses: w.uses } : {}),
    mays: new Map(),
  }
  // The worker holds the task from the moment it was picked for it.
  j.out.set(task, out)
  for (const other of j.out.values()) if (other !== out) other.beside = true
  const carried = await runner.out(out.steps, { task, worker: j.id, kind: w.kind })
  await settledNow(o)
  if (carried.every((one) => !one) || h.over()) {
    j.out.delete(task)
    freePlaces(o, task)
    return
  }
  const handed: { entry: InQueue; carried: Carried; as: Caller; rows?: Record<string, unknown> }[] = []
  try {
    for (const [i, entry] of entries.entries()) {
      const one = carried[i]
      if (one) handed.push({ entry, carried: one, ...(await handedOf(h, out, entry.w, one)) })
    }
  } catch (error) {
    j.out.delete(task)
    freePlaces(o, task)
    // An error of the engine itself, where the rows were read, is no refusal of rights: it is written into the log.
    const failed = error instanceof TentError ? error : new TentError('T0009', 'An error occurred.')
    if (!(error instanceof TentError)) failureOf(o, 'a hand-out of work', error)
    await runner.ended(task, [{ failed }])
    return
  }
  out.steps = handed.map(({ entry, carried: one }) => ({
    run: entry.w.run,
    step: entry.w.step,
    ...(one.leave ? { leave: one.leave } : {}),
  }))
  // The files the engine keeps for the progress the step kept are the task's to read, and to let go with its next.
  if (!batch) out.kept = keptOfRun(o, w.run, Object(handed[0].carried.progress).value)
  const work = batch
    ? {
        t: 'work',
        task: {
          id: task,
          batch: true,
          definition: w.flow,
          version: w.version,
          kind: w.kind,
          ms: Math.max(...handed.map(({ carried: one }) => one.ms)),
          entries: handed.map(({ entry, carried: one, as, rows }) => ({
            run: entry.w.run,
            try: one.try,
            as,
            ...(one.leave ? { leave: one.leave } : {}),
            input: one.input,
            ...(rows ? { rows } : {}),
            files: [],
          })),
          files: out.files ?? [],
        },
      }
    : {
        t: 'work',
        task: {
          id: task,
          of: w.of,
          run: w.run,
          flow: w.flow,
          step: w.step.name,
          repeat: w.step.repeat,
          try: handed[0].carried.try,
          version: w.version,
          kind: w.kind,
          as: handed[0].as,
          ...(handed[0].carried.leave ? { leave: handed[0].carried.leave } : {}),
          ...(handed[0].carried.input === undefined ? {} : { input: handed[0].carried.input }),
          ...(handed[0].carried.event === undefined ? {} : { event: handed[0].carried.event }),
          saved: handed[0].carried.saved,
          ...(handed[0].carried.ended ? { ended: handed[0].carried.ended } : {}),
          ...(handed[0].rows ? { rows: handed[0].rows } : {}),
          files: out.files ?? [],
          ...(handed[0].carried.progress ? { progress: handed[0].carried.progress } : {}),
          ms: handed[0].carried.ms,
        },
      }
  // The work on the worker stands in the trace of the step it carries out, by the header of the standard.
  const parent = runParent(o, w.run, w.step)
  if (parent) Reflect.set(work.task, 'traceparent', parentHeader(parent))
  out.work = work
  send(j.link, work)
  out.sent = true
  o.clock.setTimer(o.clock.now() + h.fetch(), () => {
    if (j.out.get(task) !== out || out.started) return
    j.out.delete(task)
    freePlaces(o, task)
    j.stopping.add(task)
    void runner.ended(task, [{ lost: 'said' }]).catch(() => undefined)
    h.pump()
  })
}
