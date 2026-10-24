import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { userCaller, projectZone } from '../../core/internal.ts'
import type { At, By, Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { readOnly } from '../door/call.ts'
import { checkedInput } from '../door/input.ts'
import { keyCaller } from '../keys/caller.ts'
import { keyAt } from '../keys/kept.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { hasFullAccess } from '../full.ts'
import { atOf, whichCall } from './inside.ts'
import { openOf } from './openWrite.ts'
import { holderOf } from '../ai/handedOver.ts'
import { agentInput, threadOf } from '../ai/started.ts'

const system: Caller = { kind: 'system' }

/** Who caused a run, from the caller whose call started it. */
export function byOfCaller(caller: Caller): By {
  if (caller.kind === 'system') return { kind: 'system' }
  if (caller.key) return { kind: 'key', id: caller.key.id }
  if (caller.user) return { kind: 'user', id: caller.user.id }
  return { kind: 'visitor', ...(caller.visitor === undefined ? {} : { id: caller.visitor }) }
}

/**
 * Whether a run was started by this caller, who may wait for it and stop it. A visitor with no id is told apart
 * from no other: no run is theirs to name, since another such caller would name it the same.
 */
export const startedBy = (started: By, by: By): boolean =>
  started.kind === by.kind && started.id === by.id && (by.kind === 'system' || by.id !== undefined)

/**
 * Builds the caller of a run again, with the roles it has today. Throws T3101 for a starter who is gone: a user
 * whose row was removed, and a key that was removed or has ended.
 */
export function callerOfBy(o: Opened, by: By): Caller {
  if (by.kind === 'system') return system
  // A visitor id that the start itself gave is no visitor's yet: the run is counted with those who have none.
  if (by.kind === 'visitor')
    return { kind: 'nobody', ...(by.id === undefined || by.fresh === true ? {} : { visitor: by.id }) }
  const gone = new TentError('T3101', `The ${by.kind} that started the run is no longer there.`, {
    fix: 'Start the run again as a caller that is there.',
  })
  if (by.kind === 'key' && by.id !== undefined) {
    // A key that was removed, or has ended, is gone.
    const held = keyAt(o, by.id)?.key
    const caller =
      held && !(held.expiresAt && held.expiresAt.getTime() <= o.clock.now()) ? keyCaller(o, held) : undefined
    if (!caller) throw gone
    return caller
  }
  if (by.kind !== 'user' || by.id === undefined || !Object.hasOwn(o.description.tables, 'users')) throw gone
  try {
    return userCaller(by.id, o.store.read({ from: 'users', one: 'get', id: by.id }, system).value)
  } catch {
    throw gone
  }
}

/** The record of a flow of the version that a call is served by, or nothing for a name that is no flow. */
export function flowOf(cx: CallContext, name: string): Record<string, unknown> | undefined {
  const { flows } = cx.app.description
  return Object.hasOwn(flows, name) ? flows[name] : undefined
}

/** What a flow is given, held to the types of its `input`. Throws T0002 where it does not fit. */
export function inputFor(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  given: unknown,
  caller: Caller,
): unknown {
  // An agent takes the input of a start of one, which is checked as every start of an agent is.
  if (record.agent !== undefined) return agentInput(o, name, record, given, caller, { access: true })
  const zone = projectZone(o.description.project)
  // A flow with no `input` is called with nothing.
  if (record.input === undefined && (given === undefined || given === null)) return undefined
  return checkedInput(name, record.input, given, { now: new Date(o.clock.now()), zone, caller })
}

/** How deep a run stands among the runs that called each other: 1 for one that nothing called. */
function depthOf(runner: Runner, run: string): number {
  let depth = 1
  for (let at = runner.read(run)?.parent; at !== undefined; at = runner.read(at)?.parent) depth += 1
  return depth
}

/** Where a run that code starts or calls comes from: the step of the run that the code works in, with which call it is. */
function fromStep(cx: CallContext, name: string, input: unknown): { at: At; call: string } | undefined {
  const at = cx.run?.step ? atOf(cx) : undefined
  return at ? { at, call: whichCall(cx, name, input) } : undefined
}

/**
 * `start(flow, input)`: starts a run and does not wait. In a change the run is part of the write. Inside a step
 * the run is found again by a step that runs a second time. Throws T0001 for what is no flow, T0013 in a query,
 * and T0002 for an input that does not fit.
 */
export function startFlow(o: Opened, runner: Runner, cx: CallContext, asked: string, given: unknown): StartedRun {
  const found = flowOf(cx, asked)
  // A start of an agent on a conversation that it handed over is the start of the one that holds it.
  const { name, record } = found ? holderOf(o, asked, found, given) : { name: asked, record: undefined }
  if (!record)
    throw new TentError('T0001', `No flow named ${JSON.stringify(name).slice(0, 80)} can be started.`, {
      fix: 'Hand `start` a flow of the app.',
    })
  if (cx.work.kind === 'query' || cx.work.kind === 'rule')
    throw new TentError('T0013', `\`start\` was used in the ${cx.work.kind} ${cx.work.name}, which starts nothing.`, {
      fix: 'Start a flow from a change, an action, a route or a step.',
    })
  if (cx.reads) throw readOnly('`start`')
  const input = inputFor(o, name, record, given, cx.caller)
  const from = fromStep(cx, name, input)
  const leave = cx.run?.leave
  // Inside a change the run is part of its write, and lives in the file of that write.
  const open = openOf(cx)
  const run = runner.add(
    {
      flow: name,
      version: cx.version,
      startedBy: byOfCaller(cx.caller),
      ...(input === undefined ? {} : { input }),
      ...(from ? { from: from.at, call: from.call } : {}),
      ...(leave === 'agreed' || leave === 'trusted' || leave === 'none' ? { leave } : {}),
      ...(open?.file ? { file: open.file } : {}),
      ...threadOf(record, input),
    },
    open?.tx,
  )
  return startedOf(run)
}

/** What a start answers: its run, or `dropped` for a start that `pace.drop` of its flow dropped, which made none. */
export type StartedRun = { run: string; dropped?: undefined } | { run?: undefined; dropped: true }

/** What a start answers, by the id that the runner answered it: the empty id of a start that was dropped. */
const startedOf = (run: string): StartedRun => (run === '' ? { dropped: true } : { run })

/**
 * A flow that code calls and waits for: it starts a run and answers a promise of the flow's answer. Throws T0013
 * in a query and a change, and for a flow that does not run as its starter where the code has no full access,
 * T0002 for an input that does not fit, and T5105 for a called run that would stand too deep.
 */
export function callFlow(
  o: Opened,
  runner: Runner,
  cx: CallContext,
  name: string,
  record: Record<string, unknown>,
  given: unknown,
): Promise<unknown> {
  if (cx.work.kind !== 'action' && cx.work.kind !== 'seed')
    throw new TentError(
      'T0013',
      `The flow ${name} was called from the ${cx.work.kind} ${cx.work.name}, which waits for nothing.`,
      {
        fix: 'Call a flow from an action, a route or a step. A change starts one with `start`, and does not wait.',
      },
    )
  // A run is more than a read: an action that a screen reads calls no flow.
  if (cx.reads) throw readOnly(`The flow ${name}`)
  // A flow that does not run as its starter has full access: only code that has it too may wait for its answer.
  if (record.as !== 'starter' && record.agent === undefined && !hasFullAccess(cx))
    throw new TentError(
      'T0013',
      `The flow ${name} has full access, and ${cx.work.name}, which called it and waits for it, has none.`,
      {
        fix: "State `as: 'starter'` on the flow, or `system: 'why'` on the function that calls it. `start` is not held so.",
      },
    )
  const input = inputFor(o, name, record, given, cx.caller)
  const from = fromStep(cx, name, input)
  const most = storedLimit(o.description, 'callDepth')
  if (cx.run && depthOf(runner, cx.run.id) + 1 > most)
    throw new TentError(
      'T5105',
      `The flow ${name} was called ${most + 1} runs deep, past \`limits.callDepth\` of ${most}.`,
      {
        fix: 'Start the flow with `start` where its answer is not needed, or raise `callDepth` in `project.limits`.',
      },
    )
  const leave = cx.run?.leave
  const run = runner.add({
    flow: name,
    version: cx.version,
    startedBy: byOfCaller(cx.caller),
    ...(input === undefined ? {} : { input }),
    ...(from ? { parent: from.at, call: from.call } : {}),
    ...(leave === 'agreed' || leave === 'trusted' || leave === 'none' ? { leave } : {}),
    ...threadOf(record, input),
  })
  // A call that `pace.drop` dropped waits for no run: it is answered so.
  return run === '' ? Promise.resolve({ dropped: true }) : runner.wait(run)
}
