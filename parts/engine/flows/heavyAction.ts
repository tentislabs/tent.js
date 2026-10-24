import { TentError } from '../../core/index.ts'
import type { Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { atOf, whichCall } from './inside.ts'
import { namedRun, waitedRun } from './runCall.ts'
import { byOfCaller } from './words.ts'
import { isWritten } from '../../core/internal.ts'

/**
 * Takes the runner of an app. Drives the run of an action that states `worker` or `background`: one step, `call`,
 * whose work goes where the action says, with the rows it states, held to `limits.try` or its time, and reserving
 * `limits.reserve` of it, tried once.
 */
export function driveActions(runner: Runner): void {
  runner.drive('action', async ({ step, record }) => {
    const stated: Record<string, unknown> = Object(record)
    const limits: Record<string, unknown> = Object(stated.limits)
    const time = typeof limits.try === 'number' ? limits.try : typeof limits.time === 'number' ? limits.time : undefined
    const where =
      typeof stated.worker === 'string'
        ? { worker: stated.worker }
        : { background: stated.background === 'here' ? ('here' as const) : true }
    // The rows that the action states travel with its task, read as the caller of its run.
    const rows = typeof stated.rows === 'object' && stated.rows !== null ? { rows: Object(stated.rows) } : {}
    // What a try reserves against the limits of use: `reserve` of the action, or its time where it states none.
    const reserve = typeof limits.reserve === 'number' ? { reserve: limits.reserve } : {}
    return step('call', () => undefined, {
      ...where,
      ...rows,
      tries: 1,
      ...(time === undefined ? {} : { time }),
      ...reserve,
    })
  })
}

/**
 * Takes the app, its runner, the call context of an action that states `worker` or `background` once its rule
 * and its input passed, and what it was given. Adds its run, of one step, and waits for its answer within the
 * time of the action: a run that outlasts it goes on, and the caller is answered T0008 with the run in
 * `fields.run`. The same call with `{ run }` alone waits for that run again, and with `{ run, stop: true }` stops
 * it, for the caller who started it. Called from a step, the run is a called run of that step.
 */
export async function heavyAction(
  o: Opened,
  runner: Runner,
  cx: CallContext,
  parent: CallContext | undefined,
  input: unknown,
  given: unknown,
): Promise<unknown> {
  const name = cx.work.name
  const by = byOfCaller(cx.caller)
  const named = namedRun(runner, given, name, 'action', by)
  if (named === 'stopped') return undefined
  let run: string
  if (named) run = named.run
  else {
    // A call that would stand behind more than `queue` of its kind is refused before it waits at all.
    const stated: unknown = Reflect.get(o.description.functions, name)
    const kind = isWritten(stated) && typeof stated.worker === 'string' ? stated.worker : 'any'
    // Read here, so that a call of an app with no worker loads nothing of the work of workers.
    const queue: unknown = Reflect.get(Object(Reflect.get(Object(o.description.project.workers), kind)), 'queue')
    const most = typeof queue === 'number' ? queue : undefined
    const waiting = Reflect.get(Object(o.work?.work().find((one) => Reflect.get(one, 'kind') === kind)), 'waiting')
    if (most !== undefined && typeof waiting === 'number' && waiting >= most)
      throw new TentError('T7102', `${waiting} calls of the kind ${kind} wait already: no more than ${most} may.`, {
        fix: 'Call again later, or let more wait with `queue` of the kind.',
      })
    const at = parent?.run?.step ? atOf(parent) : undefined
    const leave = parent?.run?.leave
    run = runner.add({
      flow: name,
      version: cx.version,
      startedBy: by,
      ...(input === undefined ? {} : { input }),
      ...(at && parent ? { parent: at, call: whichCall(parent, name, input) } : {}),
      ...(cx.fills && !at
        ? {
            from: { run: 'fill', flow: name, version: cx.version, as: { kind: 'system' as const } },
            call: cx.fills.call,
          }
        : {}),
      ...(leave === 'agreed' || leave === 'trusted' || leave === 'none' ? { leave } : {}),
      // An action that a page reads only reads, inside its work too, here and on a worker.
      ...(cx.reads === true || parent?.reads === true ? { given: { reads: true } } : {}),
      ...(cx.fills ? { given: { fills: cx.fills } } : {}),
    })
  }
  const record: Record<string, unknown> = Object(Reflect.get(o.description.functions, name))
  const gone = (): void => {
    if (!o.work?.handedOut(run) || record.callerGone === 'stop') runner.stop(run)
  }
  if (cx.left?.aborted) gone()
  else cx.left?.addEventListener('abort', gone, { once: true })
  const stated: unknown = record.limits
  const time =
    isWritten(stated) && typeof stated.time === 'number' ? stated.time : storedLimit(o.description, 'actionTime')
  try {
    return await waitedRun(o, runner, run, { name, called: 'action', most: time, limit: 'the time of the action' })
  } catch (error) {
    // A caller whose time ended before the task was handed out is gone: its run is stopped.
    if (error instanceof TentError && error.code === 'T0008' && !o.work?.handedOut(run)) runner.stop(run)
    throw error
  }
}
