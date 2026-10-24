import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { runBody } from '../../core/internal.ts'
import type { StepEnded, Working } from '../../flows/index.ts'
import { replayTo } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import { flowBodyOf } from '../flows/code.ts'
import type { Opened } from '../opened.ts'
import { callIn } from '../rooms/calls.ts'
import type { Remote } from './remote.ts'
import { remoteDb } from './remoteDb.ts'

/** What the work of a task may do with its machine: whether it is to stop, and keeping where it is. */
export interface TaskMachine {
  stopping(): boolean
  progress(value: unknown): void
  // Tells whoever follows the run of the task a value, held to its rate before it crosses.
  say(value: unknown): void
}

const isCaller = (value: unknown): value is Caller =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'kind') === 'string'

/** Whether an entry of what the task says of its saved steps names a step and the moment it ended. */
const isEnded = (value: unknown): value is StepEnded =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'name') === 'string' &&
  typeof Reflect.get(value, 'repeat') === 'number' &&
  typeof Reflect.get(value, 'at') === 'number'

/**
 * Takes the code of a version, a task as the writer handed it, what reaches the writer, the signal that ends the
 * work, and what the work may do with its machine. Carries the step out: the flow from its start, with every
 * earlier step answered from what was saved, up to the work of the named step, inside a call context whose calls,
 * reads and handles cross to the writer. Answers what the work answered.
 */
export async function carryTask(
  served: Opened,
  task: Record<string, unknown>,
  remote: Remote,
  signal: AbortSignal,
  machine: TaskMachine,
): Promise<unknown> {
  const flow = String(task.flow)
  const step = { name: String(task.step), repeat: Number(task.repeat) }
  const caller: Caller = isCaller(task.as) ? task.as : { kind: 'system' }
  const cx: CallContext = {
    app: served,
    version: served.version,
    caller,
    made: 0,
    signal,
    work: { name: flow, kind: 'action', depth: 1, now: new Date(served.clock.now()), ends: Number.POSITIVE_INFINITY },
    run: { id: String(task.run), step, ...(task.leave === undefined ? {} : { leave: task.leave }) },
    remote,
  }
  const saved = Array.isArray(task.saved) ? task.saved.map((one) => Object(one)) : []
  let kept: unknown = Object(task.progress).value
  function progress(): unknown
  function progress(value: unknown): Promise<void>
  function progress(...given: unknown[]): unknown {
    if (!given.length) return kept
    kept = given[0]
    machine.progress(given[0])
    return Promise.resolve()
  }
  const working: Working = {
    rows: Object(task.rows),
    progress,
    stopping: machine.stopping,
    back: () => {
      throw new HandBack()
    },
    say: (value) => machine.say(value),
  }
  const db = remoteDb(served.description, (plan) => remote.read(plan))
  // The task of an action calls its `run` with the input, and replays nothing: the action is its one step.
  if (task.of === 'action') {
    const record = Object.hasOwn(served.description.functions, flow) ? served.description.functions[flow] : undefined
    const user = caller.kind === 'system' ? undefined : caller.user
    const handed = { input: task.input, user, db, now: new Date(served.clock.now()), ...working }
    if (Array.isArray(record?.body)) {
      const stored = record.body
      return within(cx, () => runBody(stored, handed))
    }
    const run = served.runs.get(flow)
    if (!run) throw new TentError('T0011', `The version ${served.version} holds no \`run\` of ${flow}.`)
    return within(cx, () => callIn(cx, served.room, run, [handed], false, false))
  }
  const body = flowBodyOf(served, flow)
  if (!body) throw new TentError('T0011', `The version ${served.version} holds no flow ${flow} to carry out.`)
  return within(cx, () =>
    replayTo(body, {
      event: task.event,
      input: task.input,
      db,
      step,
      saved: (name, repeat) => {
        const found = saved.find((one) => one.name === name && one.repeat === repeat && one.failed === undefined)
        return found ? { result: found.result } : undefined
      },
      ended: Array.isArray(task.ended) ? task.ended.filter(isEnded) : [],
      working,
    }),
  )
}

/** What `back()` throws: the try ends as handed back, with its last progress kept. */
export class HandBack extends Error {
  constructor() {
    super('The work handed its task back.')
    this.name = 'HandBack'
  }
}
