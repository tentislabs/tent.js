import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { sendsOut } from '../../core/internal.ts'
import type { At, Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import { atOnWorker, nthOnWorker } from './workPlace.ts'
import { atOf, underLeave } from './inside.ts'

/** What a call is, to what a tool call may do: one that sends data out, one that asks a person, or neither. */
export type LeaveHeld = 'sends' | 'asks' | 'free'

/** Where a call that a person agreed to stands: its making, its name and its turn among the calls of that name. */
interface Place {
  at: At
  name: string
  nth: number
}

/** What a call that may pass is: made in a call context, or made already with its answer kept. */
type Passed = { cx: CallContext; place?: Place } | { kept: unknown }

// How many calls of each name that waited for a yes one making of a step made, by where the making stands.
const counted = new WeakMap<At, Map<string, number>>()

/** Counts one more call of a name in a making of a step, and answers how many came before it. */
function nthOf(at: At, name: string): number {
  const counts = counted.get(at) ?? new Map<string, number>()
  counted.set(at, counts)
  const before = counts.get(name) ?? 0
  counts.set(name, before + 1)
  return before
}

/** Whether a call is refused where it stands: under `none` what sends and what asks, under `trusted` what asks. */
function refusedUnder(leave: unknown, held: LeaveHeld): boolean {
  if (held === 'free') return false
  return leave === 'none' || (leave === 'trusted' && held === 'asks')
}

/** The refusal of a call that no person agreed to, with its place, which makes the step of an agent wait. */
const notAgreed = (name: string, held: LeaveHeld, nth: number): TentError =>
  new TentError(
    'T7111',
    `${name} ${held === 'asks' ? 'asks a person before it runs' : 'sends data out'}, and nobody agreed to it under the tool call it was reached from.`,
    {
      place: { name, nth },
      fix: "State what the tool does - `danger: 'ask'`, or that it sends - so that the person is asked before the tool starts.",
    },
  )

/**
 * Holds a call to what the tool call above it may do (`leave` of its run). A call that is refused there is refused
 * before it does anything, unless the person agreed to it at its place, and it is then made under `agreed`. Where
 * `keeps` holds, a call at a place that was agreed and made already is not made again: its kept answer stands.
 */
function passed(cx: CallContext, name: string, held: LeaveHeld, keeps: boolean): Passed {
  if (!cx.run || !refusedUnder(cx.run.leave, held)) return { cx }
  const at = atOf(cx)
  const runner = cx.app.flows?.runner
  if (!at || !runner) throw notAgreed(name, held, 0)
  const nth = nthOf(at, name)
  const said = runner.yes(at, { name, nth })
  if (!said.agreed) throw notAgreed(name, held, nth)
  if (keeps && said.made) return { kept: said.answer }
  return {
    cx: { ...cx, run: underLeave(cx.run, 'agreed'), agreed: { at, name, nth } },
    ...(keeps ? { place: { at, name, nth } } : {}),
  }
}

/** Whether a call is made in the work of a task on a worker, whose runner is its writer's. */
export const onWorker = (cx: CallContext): boolean => cx.remote !== undefined && !cx.app.flows

/**
 * `passed` for work on a worker, whose runner is its writer's: a call that the leave refuses is made under
 * `agreed`, at its place, and its `may` asks the writer for the person's yes there. The writer refuses it with its
 * place where nobody agreed, which makes the step wait for the person, and hands the answer that was kept where it
 * was made already.
 */
function passedOnWorker(cx: CallContext, name: string, held: LeaveHeld): Passed {
  const { run, remote } = cx
  if (!run || !remote || !refusedUnder(run.leave, held)) return { cx }
  const nth = nthOnWorker(remote, name)
  const at = atOnWorker(cx)
  return { cx: { ...cx, run: underLeave(run, 'agreed'), agreed: { at, name, nth } }, place: { at, name, nth } }
}

/**
 * Takes the call context of a call, the name of what it calls and what kind of call it is. Answers the call context
 * it is made in, with its place where a person agreed to it, or the answer kept of it where it was made already:
 * on a worker by its writer's runner, at the `may` of the call, here by this one's. Throws T7111 with its place
 * where nobody agreed.
 */
export const passedWhere = (cx: CallContext, name: string, held: LeaveHeld): Passed =>
  onWorker(cx) ? passedOnWorker(cx, name, held) : passed(cx, name, held, true)

/**
 * Takes the call context of an agreed call, its place, and its answer. Notes that the call was made and ended well,
 * with its answer as plain data, so that a later making is handed it. On a worker the `did` of the call carries it
 * to the writer, which keeps it.
 */
export function keepMade(cx: CallContext, place: Place | undefined, answer: unknown): void {
  if (!place || onWorker(cx)) return
  const kept = answer === undefined ? undefined : JSON.parse(JSON.stringify(answer))
  cx.app.flows?.runner.made(place.at, { name: place.name, nth: place.nth }, kept)
}

/**
 * Takes the writer's runner, where work of a task on a worker stands, the leave its run stands under, and an outside
 * call that the worker is about to make itself, with what kind of call it is and its place. Answers nothing where
 * the call may be made, and what was kept of it where a person agreed to it and it was made already. Throws T7111
 * with its place where the leave refuses it and nobody agreed.
 */
export function yesOfMay(
  runner: Runner,
  at: At,
  leave: unknown,
  call: { name: string; nth: number; held: LeaveHeld },
): { made: true; answer?: unknown } | undefined {
  if (!refusedUnder(leave, call.held)) return undefined
  const said = runner.yes(at, { name: call.name, nth: call.nth })
  if (!said.agreed) throw notAgreed(call.name, call.held, call.nth)
  return said.made ? { made: true, ...('answer' in said ? { answer: said.answer } : {}) } : undefined
}

/**
 * Takes the same, for the `did` of that call, which ended well, and what it answered. Notes that the agreed call was
 * made, with its answer, so that a later making of the step is handed it: a person's yes is used only so.
 */
export function keptOfDid(
  runner: Runner,
  at: At,
  leave: unknown,
  call: { name: string; nth: number; held: LeaveHeld },
  answer: unknown,
): void {
  if (!refusedUnder(leave, call.held)) return
  const place = { name: call.name, nth: call.nth }
  if (runner.yes(at, place).agreed) runner.made(at, place, answer)
}

/**
 * Takes the call context of a call, the name of what it calls, what kind of call it is, and the call. Answers what
 * the call answers, made where the tool call above it lets it: under `agreed` where the person agreed to it, and
 * once, as a later making of its step is handed the answer that was kept. Throws T7111 with its place for a call
 * that nobody agreed to, before anything is sent.
 */
export async function heldToLeave(
  cx: CallContext,
  name: string,
  held: LeaveHeld,
  make: (cx: CallContext) => Promise<unknown>,
): Promise<unknown> {
  const pass = passedWhere(cx, name, held)
  if ('kept' in pass) return pass.kept
  const answer = await within(pass.cx, () => make(pass.cx))
  keepMade(pass.cx, pass.place, answer)
  return answer
}

/**
 * Takes the call context of a call that is made in the same making whatever it answers - a function, a write, a
 * start - with its name and kind. Answers the call context it is made in: under `agreed` where the person agreed
 * to it. Throws T7111 with its place where it is refused.
 */
export function agreedOr(cx: CallContext, name: string, held: LeaveHeld): CallContext {
  const pass = passed(cx, name, held, false)
  return 'cx' in pass ? pass.cx : cx
}

/**
 * The yes of the starter to a call of a tool of a source that asks inside its step: true where the person agreed
 * at its place, and else T7111 with its place, which makes the step wait for them.
 */
export function askedOf(cx: CallContext, name: string): true {
  const at = atOf(cx)
  const runner = cx.app.flows?.runner
  if (!at || !runner) throw notAgreed(name, 'asks', 0)
  const nth = nthOf(at, name)
  if (!runner.yes(at, { name, nth }).agreed) throw notAgreed(name, 'asks', nth)
  return true
}

/**
 * Takes the call context that an action is carried out in and its work. Answers what the work answers, made once
 * where a person agreed to the action under a tool call: a later making of the step is handed what it answered,
 * and what it did - a mail, a request - is not done again.
 */
export async function madeOnce(cx: CallContext, work: () => Promise<unknown>): Promise<unknown> {
  const place = cx.agreed
  const runner = cx.app.flows?.runner
  if (!place || !runner) return work()
  const said = runner.yes(place.at, { name: place.name, nth: place.nth })
  if (said.agreed && said.made) return said.answer
  const answer = await work()
  keepMade(cx, place, answer)
  return answer
}

/** What a flow is to what a tool call may do when it is started or set off: one that asks, that sends, or neither. */
export function flowHeld(description: Description, flow: string): LeaveHeld {
  const record = Object.hasOwn(description.flows, flow) ? description.flows[flow] : undefined
  if (record?.danger === 'ask') return 'asks'
  return sendsOut(description, flow) ? 'sends' : 'free'
}

/** The flows that a write or an event would set off, held as one: by the one of them that asks most. */
export function setOffHeld(description: Description, flows: string[]): { held: LeaveHeld; flow?: string } {
  const helds = flows.map((flow) => ({ flow, held: flowHeld(description, flow) }))
  return helds.find((one) => one.held === 'asks') ?? helds.find((one) => one.held === 'sends') ?? { held: 'free' }
}
