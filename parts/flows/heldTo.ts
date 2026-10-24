import { TentError } from '../core/index.ts'
import type { StepOptions } from './face.ts'
import { flowOf } from './flowOf.ts'
import type { Pass } from './pass.ts'
import { projectLimit } from './projectLimit.ts'
import { isWritten } from '../core/internal.ts'

/** The names of what code states that it uses: a definition by its name, and a member of a handle as it is written. */
export function usesOf(pass: Pass, o: StepOptions): string[] | undefined {
  const { run } = pass.of
  const stated: unknown = run.kind === 'action' ? flowOf(pass.of.held, run.version, run.flow).record.uses : o.uses
  if (!Array.isArray(stated)) return undefined
  return stated.map((one) => (typeof one === 'string' ? one : String(Reflect.get(Object(one), 'definition'))))
}

/**
 * How large the task of a step would be as JSON, in bytes: the run's input, its event, and what the steps before it
 * saved. A result that a pass left unread for its size counts by the size its row keeps of it.
 */
export function taskSizeOf(pass: Pass): number {
  const { run } = pass.of
  const rows = [...pass.saved.values()]
  const saved = rows.map((row) => (row.whole ? row.result : null))
  const unread = rows.reduce((sum, row) => sum + (row.whole ? 0 : row.size), 0)
  return Buffer.byteLength(JSON.stringify({ input: run.input, event: run.event, saved })) + unread
}

/** The most a task may hold, as the project of the run's version states it. */
export const taskSizeLimit = (pass: Pass): number => projectLimit(pass.of.held, pass.of.run.version, 'taskSize')

/**
 * What a kind of worker refuses of a step's work: on a kind that states `systemWork: false`, work that runs as the
 * system, and code that states no `uses`, since the writer could not hold such a task to what it may ask for.
 * Nothing where the kind takes it.
 */
export function refusedBy(pass: Pass, kind: string, o: StepOptions): TentError | undefined {
  const { run, held } = pass.of
  const workers: unknown = held.env.description(run.version).project.workers
  const stated: unknown = isWritten(workers) ? workers[kind] : undefined
  if (!isWritten(stated) || stated.systemWork !== false) return undefined
  const record = flowOf(held, run.version, run.flow).record
  const asSystem = run.kind === 'action' ? typeof record.system === 'string' : run.as !== 'starter'
  if (asSystem)
    return new TentError('T0013', `The kind ${kind} takes no work that runs as the system, and ${run.flow} does.`, {
      fix: 'Carry it out on a kind that takes such work, or let the run run as its starter.',
    })
  if (!usesOf(pass, o))
    return new TentError('T0013', `The kind ${kind} takes no code that does not say what it uses.`, {
      fix: 'State `uses` on the step or the action: the functions and the members of handles its code asks for.',
    })
  return undefined
}
