import { TentError } from '../../core/index.ts'
import type { At } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import type { Remote } from '../work/remote.ts'
import { callAmong, onceKey } from './inside.ts'

// Where a call on a worker stands, apart from the work of workers, so that an app with no worker loads none of it.

// What the work of one task counted of its calls on this worker, by what reaches its writer: how many calls of
// each name it made, and how many of each name with each input.
const counted = new WeakMap<Remote, { names: Map<string, number>; calls: Map<string, number> }>()

const countsOf = (remote: Remote): { names: Map<string, number>; calls: Map<string, number> } => {
  const held = counted.get(remote) ?? { names: new Map<string, number>(), calls: new Map<string, number>() }
  counted.set(remote, held)
  return held
}

/** Where the work of a task stands on a worker, as its writer knows the place: the run and the step of the task. */
export function atOnWorker(cx: CallContext): At {
  return {
    run: cx.run?.id ?? '',
    flow: cx.work.name,
    version: cx.version,
    as: cx.caller,
    ...(cx.run?.step ? { step: cx.run.step } : {}),
  }
}

/** Takes the work of a task on a worker and the name of a call. Answers how many calls of that name it made before it. */
export function nthOnWorker(remote: Remote, name: string): number {
  const { names } = countsOf(remote)
  const before = names.get(name) ?? 0
  names.set(name, before + 1)
  return before
}

/**
 * Takes the call context of work on a worker, and the name and the input of an outside call that it is about to
 * make itself. Answers what its `may` and its `did` carry: its once-only key and its place among the calls of that
 * name, both worked out here as on one machine, and whether a person's yes to that place is what lets it be made.
 */
export function mayPlace(cx: CallContext, name: string, input: unknown): { key: string; nth: number; agreed: boolean } {
  const remote = cx.remote
  if (!remote) throw new TentError('T0009', 'A call of a worker is made in the work of a task.')
  const agreed = cx.agreed?.name === name ? cx.agreed : undefined
  const nth = agreed ? agreed.nth : nthOnWorker(remote, name)
  const key = onceKey(atOnWorker(cx), callAmong(countsOf(remote).calls, name, input))
  return { key, nth, agreed: agreed !== undefined }
}
