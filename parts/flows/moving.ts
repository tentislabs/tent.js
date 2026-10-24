import { TentError } from '../core/index.ts'
import { rowIds } from '../data/index.ts'
import { flowOf } from './flowOf.ts'
import type { Held } from './held.ts'
import { asSaved } from './kept.ts'
import { fileOf, idIn, readIn, runOf, writeIn } from './places.ts'
import { addRun, changeRun, readRun, writeStep } from './rows.ts'
import { stepsInOrder } from './views.ts'
import { isWritten } from '../core/internal.ts'

/** One entry of the step names that the build listed of a flow. */
interface Listed {
  name?: string
  repeated: boolean
}

/** The step names of a flow as its version lists them, in order, and whether some of its steps are made in code that the build could not read. */
function listedOf(record: Record<string, unknown>): { listed: Listed[]; inCode: boolean } {
  const names = Array.isArray(record.stepNames) ? record.stepNames.filter(isWritten) : []
  return {
    listed: names
      .filter((one) => typeof one.name === 'string')
      .map((one) => ({ name: String(one.name), repeated: one.repeated === true })),
    inCode: names.some((one) => one.inCode === true),
  }
}

/**
 * Takes the saved step names of a run, in the order in which they began, and the step names that a version lists
 * of its flow. Answers the first saved step that the version does not hold at its place, or nothing where every
 * saved step still matches in order. A step whose name the build could not read matches nothing.
 */
function firstMisfit(saved: string[], record: Record<string, unknown>): string | undefined {
  const { listed } = listedOf(record)
  let at = 0
  for (const name of saved) {
    // A step that stands in a repeat matches each pass of it, one after another.
    if (at > 0 && listed[at - 1].repeated && listed[at - 1].name === name) continue
    const found = listed.findIndex((one, place) => place >= at && one.name === name)
    if (found < 0) return name
    at = found + 1
  }
  return undefined
}

/**
 * Tries another version against the saved steps of a run, without doing anything, and moves the run to it where
 * every saved step still matches in order. Answers whether it was moved, and the step that does not match. With
 * `dry` nothing is moved. Throws T0001 for a run that is not there, and T0013 for one that is worked on now.
 */
export function moveRun(
  held: Held,
  id: string,
  version: string,
  o: { dry?: boolean } = {},
): { moved: boolean; step?: string } {
  const run = runOf(held.env, id)
  if (!run) throw new TentError('T0001', `No run ${JSON.stringify(id).slice(0, 80)} is there.`)
  if (held.atWork.has(id))
    throw new TentError('T0013', `The run ${id} is being worked on, and is moved only while it waits.`, {
      fix: 'Move a run while it waits: `tent runs` shows its state.',
    })
  let record: Record<string, unknown>
  try {
    record = flowOf(held, version, run.flow).record
  } catch {
    return { moved: false }
  }
  const saved = stepsInOrder(readIn(held.env, id), id).map((step) => step.name)
  const step = firstMisfit(saved, record)
  if (step !== undefined) return { moved: false, step }
  if (o.dry !== true && run.version !== version) writeIn(held.env, id, (tx) => changeRun(tx, id, { version }))
  return { moved: true }
}

/**
 * Starts a new run of the flow of a run, on the given version, with its key, which reuses the saved results of
 * the steps that began before the step `from`, and a result that `with` gives for a step by its name. Left out,
 * `from` is the first step that did not end done, so every step that was done is reused. Answers the id of the new
 * run. Throws T0001 for a run that is not there, and T0002 for a `from` that names no saved step of it.
 */
export function replayRun(
  held: Held,
  id: string,
  o: { from?: string; version: string; with?: Record<string, unknown> },
): string {
  const { clock } = held.env
  const store = readIn(held.env, id)
  const run = readRun(store, id)
  if (!run) throw new TentError('T0001', `No run ${JSON.stringify(id).slice(0, 80)} is there.`)
  const steps = stepsInOrder(store, id)
  const named = o.from === undefined ? steps.findIndex((step) => step.state !== 'done') : undefined
  const first = named === undefined ? steps.findIndex((step) => step.name === o.from) : named < 0 ? steps.length : named
  if (first < 0)
    throw new TentError('T0002', `The run ${id} holds no saved step named ${JSON.stringify(o.from)}.`, {
      fix: 'Name a step that the run has saved: `tent runs show` lists them.',
    })
  const flow = flowOf(held, o.version, run.flow)
  const next = idIn(rowIds.next(), fileOf(id))
  const now = clock.now()
  const given = new Map(Object.entries(o.with ?? {}))
  store.write((tx) => {
    addRun(tx, {
      id: next,
      flow: run.flow,
      kind: flow.kind,
      version: o.version,
      state: 'queued',
      startedBy: run.startedBy,
      as: flow.as,
      top: next,
      used: [],
      workedMs: 0,
      createdAt: now,
      ...(run.input === undefined ? {} : { input: run.input }),
      ...(run.event === undefined ? {} : { event: run.event }),
      ...(run.given ? { given: run.given } : {}),
      ...(run.key === undefined ? {} : { key: run.key }),
    })
    const counts = new Map<string, number>()
    let began = now
    const save = (name: string, result: unknown): void => {
      const repeat = (counts.get(name) ?? 0) + 1
      counts.set(name, repeat)
      const kept = asSaved(result)
      began += 1
      writeStep(
        tx,
        next,
        { name, repeat },
        {
          state: 'done',
          ...(kept.value === undefined ? {} : { result: kept.value }),
          size: kept.size,
          startedAt: began,
          endedAt: began,
        },
        true,
      )
    }
    for (const step of steps.slice(0, first)) {
      if (step.state !== 'done') continue
      save(step.name, given.has(step.name) ? given.get(step.name) : step.result)
      given.delete(step.name)
    }
    // A sample result for a step that the old run had not saved before `from` is saved as that step's first pass.
    for (const [name, result] of given) save(name, result)
  })
  held.later(next)
  return next
}
