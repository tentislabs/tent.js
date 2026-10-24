import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { At, By, Runner } from '../../flows/index.ts'
import type { Link } from '../copy/link.ts'
import { tell } from '../copy/link.ts'
import { isPlan } from '../../core/internal.ts'
import { underWay as callContext } from '../context.ts'
import { dbOf, inRunContext } from '../flows/inside.ts'
import type { LeaveHeld } from '../flows/leave.ts'
import { keptOfDid, yesOfMay } from '../flows/leave.ts'
import { readsInFill } from '../fill/refused.ts'
import { heldToBody } from './bodyHolds.ts'
import { didCall, mayCall } from './counted.ts'
import { didFetch, didModel, mayModel } from './outsideUse.ts'
import { said } from '../flows/said.ts'
import type { Opened } from '../opened.ts'
import { serviceCallOf } from '../services/call.ts'
import { slot } from '../slot.ts'
import { wireError } from '../wire.ts'
import { workPlaced } from './placed.ts'
import type { Joined, OutTask } from './state.ts'
import { framed } from './taskFiles.ts'

const system: Caller = { kind: 'system' }

/** The answers of the calls that do more than read, by task and by the id of the call: a call that comes again is answered them. */
export type KeptAnswers = Map<string, Map<string, object>>

// The calls that do more than read and are under way, by the answers each hub keeps, by task and id: each with
// what sends its answer to a sending of it that came again meanwhile.
const underWay = new WeakMap<KeptAnswers, Map<string, ((answer: object) => void)[]>>()

/** Whether the writer makes the `fetch` of work of a kind, as `outside` of the kind names it. */
function fetchByWriter(o: Opened, kind: string | undefined): boolean {
  const stated: unknown = Reflect.get(
    Object(Reflect.get(Object(o.description.project.workers), String(kind))),
    'outside',
  )
  return stated === 'writer' || Reflect.get(Object(stated), 'fetch') === 'writer'
}

/**
 * What an outside call that a worker makes itself is, to what a tool call may do, as its `may` and its `did` name
 * it: its name and its place among the calls of that name, and whether it sends. A model call is held by nothing
 * of it, a fetch sends, and a service call sends unless it states that it does not.
 */
function outsideOf(message: Record<string, unknown>): { name: string; nth: number; held: LeaveHeld } {
  const nth = typeof message.nth === 'number' ? message.nth : -1
  if (message.model !== undefined) return { name: String(message.model), nth, held: 'free' }
  if (message.fetch !== undefined) return { name: 'fetch', nth, held: 'sends' }
  const name = `${String(message.service)}.${String(message.call)}`
  const cx = callContext()
  return { name, nth, held: cx && serviceCallOf(cx, name)?.sends === false ? 'free' : 'sends' }
}

// Where the work of each entry of a task that is out stands, made once: the places of the calls that the writer
// carries out for it under the leave of its tool call are counted on it, each call taking the next in its order.
const standing = new WeakMap<OutTask, Map<number, At>>()

/**
 * Where the work of a task stands, as the writer carries out what it asks for: its run, its step, its caller and
 * the leave of the tool call above it. It is the same for every call of the task.
 */
function atOf(runner: Runner, callerOf: (by: By) => Caller, j: Joined, task: string, entry = 0): At | undefined {
  const out = j.out.get(task)
  const first = out?.steps[entry]
  const kept = out ? standing.get(out)?.get(entry) : undefined
  if (kept) return kept
  const run = first ? runner.read(first.run) : undefined
  if (!out || !first || !run) return undefined
  const made: At = {
    run: run.id,
    flow: run.flow,
    version: run.version,
    as: run.as === 'starter' ? callerOf(run.startedBy) : system,
    ...(first.leave ? { leave: first.leave } : {}),
    step: first.step,
  }
  standing.set(out, (standing.get(out) ?? new Map<number, At>()).set(entry, made))
  return made
}

/**
 * Takes what the writer needs to carry a call of a worker out, and the call. A call of a task that is not out to
 * that worker is answered T5108. A `read` is a plan carried out as the caller of the run; a `do` is a function or
 * a flow called from code inside the step, with its once-only key; a `handle` is a member of a handle, called as
 * the caller of the run. What does more than read is kept, and a call that comes again under its id is answered
 * what the first was.
 */
export function answerCall(
  o: Opened,
  runner: Runner,
  callerOf: (by: By) => Caller,
  kept: KeptAnswers,
  j: Joined,
  link: Link,
  message: Record<string, unknown>,
): void {
  const id = String(message.id)
  const task = String(message.task)
  const send = (answer: object): void => tell(link, { t: 'answer', id, ...answer })
  // A code of the framework crosses to the worker as itself, those that a caller is never shown among them, and
  // the refusal of a call that nobody agreed to with its place.
  const failure = (error: unknown): object => ({
    ok: false,
    error:
      error instanceof TentError
        ? workPlaced(error, { code: error.code, message: error.message, ...(error.fix ? { fix: error.fix } : {}) })
        : wireError(error, true).error,
  })
  const failed = (error: unknown): void => send(failure(error))
  // Inside a batch each call names its entry, and is carried out as the caller of that entry; one that names none is T0013.
  const entry = typeof message.entry === 'number' ? message.entry : undefined
  if ((j.out.get(task)?.steps.length ?? 0) > 1 && entry === undefined) {
    failed(
      new TentError('T0013', 'A call from inside a batch names no entry, and a batch has no caller of its own.', {
        fix: 'Make the call with the `db` of the entry it is for.',
      }),
    )
    return
  }
  const at = j.out.has(task) ? atOf(runner, callerOf, j, task, entry) : undefined
  if (!at) {
    failed(
      new TentError('T5108', `The task ${task.slice(0, 40)} is not out to this worker.`, {
        fix: 'Drop what was kept of it: its work is the current try of another task.',
      }),
    )
    return
  }
  const what = String(message.what)
  // What the work says is sent on to whoever follows its run, and answered not: the worker held it to its rate.
  if (what === 'say') {
    try {
      said(o, at, message.value)
    } catch {
      // A value that does not fit is the worker's to refuse, which it does before it sends one.
    }
    return
  }
  // Code that states what it uses is held to it: a function, a flow or a member of a handle that it does not name is T0013.
  const uses = j.out.get(task)?.uses
  const asks =
    what === 'do'
      ? String(message.name)
      : what === 'handle'
        ? `${String(message.handle)}.${String(message.member)}`
        : undefined
  if (uses && asks !== undefined && !uses.includes(asks)) {
    failed(
      new TentError('T0013', `The work asks for ${asks}, which its \`uses\` does not name.`, {
        fix: 'Name it in `uses` of the step or the action.',
      }),
    )
    return
  }
  const held = kept.get(task)?.get(id)
  if (held && what !== 'read') {
    send(held)
    return
  }
  // A call that comes again while the first is under way waits for that one's answer, and is not carried out twice.
  const flying = underWay.get(kept) ?? new Map<string, ((answer: object) => void)[]>()
  underWay.set(kept, flying)
  const key = `${task}\n${id}`
  const waiters = what === 'read' ? undefined : flying.get(key)
  if (waiters) {
    waiters.push(send)
    return
  }
  if (what !== 'read') flying.set(key, [])
  const others = (answer: object): void => {
    const waiting = flying.get(key) ?? []
    flying.delete(key)
    for (const one of waiting) one(answer)
  }
  const keep = (answer: object): void => {
    if (what !== 'read') kept.set(task, (kept.get(task) ?? new Map()).set(id, answer))
    send(answer)
    others(answer)
  }
  // Work that fills a column reads nothing of the store, on a worker as here.
  const fills = Reflect.get(Object(runner.read(at.run)?.given), 'fills') !== undefined
  const asked = what === 'do' ? Reflect.get(Object(o.description.functions[String(message.name)]), 'kind') : undefined
  const work = async (): Promise<unknown> => {
    if (fills && (what === 'read' || asked === 'query')) throw readsInFill(what === 'read' ? 'A read' : 'A query')
    heldToBody(o.description, at.flow, what, message)
    if (what === 'read') {
      if (!isPlan(message.plan)) throw new TentError('T0002', 'A read that a worker asks for holds a plan.')
      // A read with `system` is the system's only where the definition of the task states `system`, with its reason.
      if (message.system === true) {
        const stated: unknown =
          Reflect.get(o.description.functions, at.flow) ?? Reflect.get(o.description.flows, at.flow)
        if (typeof Reflect.get(Object(stated), 'system') !== 'string')
          throw new TentError('T0013', `A read as the system, for work of ${at.flow}, which states no \`system\`.`, {
            fix: 'State `system` on the definition, with its reason, or read as the caller of the task.',
          })
        return dbOf(o, { ...at, as: { kind: 'system' } }).read(message.plan)
      }
      return dbOf(o, at).read(message.plan)
    }
    if (what === 'do') {
      const name = String(message.name)
      return message.start === true ? slot.start(name, message.input) : slot.call(name, [message.input])
    }
    // An outside call that the worker makes itself: held to the person's yes at its place where the leave of its
    // run needs one, counted here before it, and logged here after it. A model call is held to its limits here, a
    // fetch asks nothing more, and a service takes a place. The runner here keeps the places of the step: only a
    // call that ended well notes that an agreed call was made, with its answer. A `did` is held to the `may` that was
    // answered, by its key and its place.
    if (what === 'may' || what === 'did') {
      const call = outsideOf(message)
      const out = j.out.get(task)
      const { leave } = at
      const named = { key: typeof message.key === 'string' ? message.key : '', nth: call.nth }
      if (what === 'may') {
        const made = yesOfMay(runner, at, leave, call)
        if (made) return made
        const answered = await (message.model !== undefined
          ? mayModel(o, at, message)
          : message.fetch !== undefined
            ? null
            : mayCall(o, task, message))
        out?.mays?.set(String(message.may), named)
        return answered
      }
      const was = out?.mays?.get(String(message.may))
      if (out?.mays && (was?.key !== named.key || was.nth !== named.nth))
        throw new TentError('T0013', 'A worker tells of a call that ended, which no `may` it was answered names.', {
          fix: 'Send the `did` with the id, the key and the nth of the `may` of the call.',
        })
      if (message.ok === true) keptOfDid(runner, at, leave, call, message.answer)
      if (message.model !== undefined) return didModel(o, at, message)
      if (message.fetch !== undefined) return didFetch(o, at, message)
      return didCall(o, task, at.run, message)
    }
    // A `fetch` of a kind whose `outside` names `fetch`: the writer makes it, as the caller of the task.
    if (what === 'fetch') {
      if (!fetchByWriter(o, j.out.get(task)?.kind))
        throw new TentError('T0013', 'A worker asks the writer to fetch for a kind whose `outside` names no `fetch`.')
      return import('./outsideFetch.ts').then(({ fetchForWorker }) =>
        fetchForWorker(o, j.out.get(task), message.request),
      )
    }
    if (what === 'handle') {
      const handle: unknown = slot.handle(String(message.handle))
      const member: unknown = Reflect.get(Object(handle), String(message.member))
      if (typeof member !== 'function')
        throw new TentError('T0013', `The handle has no member ${String(message.member)}.`)
      return Reflect.apply(member, handle, Array.isArray(message.args) ? message.args : [])
    }
    throw new TentError(
      'T0013',
      `A worker asks for ${JSON.stringify(what).slice(0, 40)}, which a writer does not carry out.`,
    )
  }
  inRunContext(o, at, () => work())
    .then(async (value) => {
      const out = j.out.get(task)
      const sent = out ? await framed(o, out, value ?? null) : { value: value ?? null }
      keep({ ok: true, ...sent })
    })
    .catch((error: unknown) => {
      const answer = failure(error)
      send(answer)
      others(answer)
    })
}
