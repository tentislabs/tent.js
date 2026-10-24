import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { NotReady } from '../../data/index.ts'
import type { CallContext, Work } from '../context.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { recordHolds } from '../record.ts'
import { adviseSlow } from '../advice.ts'
import { checkFiles } from '../stored/given.ts'
import type { Asks } from './asks.ts'
import { agreedTo } from './asks.ts'
import { keptCall } from './callIds.ts'
import type { Carried } from './carry.ts'
import { allows, carryAction, carryChange, carryQuery, timeLimit } from './carry.ts'
import { isShown, logCall, logName, statusOf } from './failure.ts'
import { releaseCounted } from '../gradual/release.ts'
import { endSpan, insideSpan, openSpan } from '../trace/span.ts'
import { noteTouched } from '../touched.ts'
import { readsInFill } from '../fill/refused.ts'
import { agreedOr, madeOnce } from '../flows/leave.ts'
import { answerMember, memberOf } from '../ai/members.ts'
import { checkedInput } from './input.ts'
import { leaving } from './output.ts'
import { callerOf, refusedBy, ruled } from './rule.ts'
import { asPiece } from '../counts/cpu.ts'
import { gather } from '../counts/gather.ts'
import { known } from '../counts/door.ts'
import { inScope } from './scopes.ts'
import { inGrant } from '../grants/scoped.ts'
import { isWritten, projectZone } from '../../core/internal.ts'

/** Whether a query reads a table kept in memory: its rows live on the main thread of the writer, and nowhere else. */
const readsMemory = (o: Opened, record: Record<string, unknown>): boolean =>
  Array.isArray(record.reads) && record.reads.some((table) => o.description.tables[String(table)]?.kept === 'memory')

/** Who asks for a call: the caller, and for a call from code the call it was made in. */
export interface Asked {
  caller: Caller
  parent?: CallContext
  // The moment at which the time of the call is up, where the call began before this pass of it.
  ends?: number
  // A call that only reads: an action that a screen reads as an entry of its data, and every call inside it.
  reads?: true
  // The run of an action that states `worker` or `background` carries the action out itself, on the thread it was handed.
  inline?: true
  // Told once the caller left: it closed the connection before it was answered.
  left?: AbortSignal
  // Work that fills a column, with the call that its run is found by.
  fills?: { call: string }
  // A call of a program, which a function that states `danger: 'ask'` asks a person first, with the yes it carries.
  asks?: Asks
  // A call of a program that holds the app: its own code, which the scopes of a key do not hold.
  own?: true
  // Told each read of the call, as `noting` of its context is.
  noting?: CallContext['noting']
  // What `onRequest` is handed of the request that the call came by, which an action is handed as `about`.
  about?: { from: string; origin: string }
  // A call of an outside door that waits for what it starts, as at `/api/`: an agent answers its text there.
  waits?: true
  // A call of MCP: a run it starts that waits for a person fails it at once, with T7120 that names the ask.
  runAsks?: true
  // The run of an action that is a run tells whoever follows it what its work says.
  say?: (value: unknown) => void
  // The id a call came with from outside, as a page makes one and a program sends `Idempotency-Key`: a change or
  // an action is carried out once for its caller and the id.
  callId?: string
}

type Kind = 'query' | 'change' | 'action'

const kindOf = (record: Record<string, unknown> | undefined): Kind | undefined =>
  record?.kind === 'query' || record?.kind === 'change' || record?.kind === 'action' ? record.kind : undefined

// The signal of a call that nothing ends: a query and a change run from start to finish.
const never = new AbortController().signal

// A query, and the draw of a screen, that took longer than this many milliseconds is written into the log. For a
// query it suggests the mark `heavy`.
export const slowAfter = 50

/** The error of a kind of function that may not be called from where the call stands. */
function notHere(name: string, kind: Kind, from: Work): TentError {
  const where = from.kind === 'rule' ? `the rule of ${from.name}` : `the ${from.kind} ${from.name}`
  return new TentError('T0013', `${name} is ${kind === 'action' ? 'an' : 'a'} ${kind}, and was called from ${where}.`, {
    fix: 'A query calls queries, and so does the arrow of a rule. A change calls queries and changes. An action calls anything.',
  })
}

/** The error of a change that is called inside a call which only reads. */
export const readOnly = (what: string): TentError =>
  new TentError('T0013', what + ' was used inside an action that a screen reads, which is called read-only.', {
    fix: 'An action that is read as an entry of data only reads. What must write or send is called by a press.',
  })

/** Holds a call from code to what may be used where: T0013 for a kind that the calling work may not call. */
function allowedHere(name: string, kind: Kind, parent: CallContext | undefined): void {
  const from = parent?.work
  if (!from || from.kind === 'action' || from.kind === 'seed' || kind === 'query') return
  if (from.kind === 'change' && kind === 'change') return
  throw notHere(name, kind, from)
}

/**
 * Passes steps 6 and 7 of the door for one call: its rule, where that is written as a value, the declared types of
 * its input, and then a rule made with `allow`, on the checked input. Answers what the work of the call is carried
 * out with. Throws T0028 for a call that nests too deep, T0006 and T3101 for a caller the rule keeps out, which is
 * written into the log, and T0002 for an input that does not fit.
 */
function passed(
  o: Opened,
  name: string,
  record: Record<string, unknown>,
  kind: Kind,
  given: unknown,
  asked: Asked,
): Carried {
  const { caller, parent } = asked
  const depth = (parent?.work.depth ?? 0) + 1
  const deepest = limitOf(o.description, 'functionDepth')
  if (depth > deepest)
    throw new TentError(
      'T0028',
      `${name} was called ${depth} calls deep, past \`limits.functionDepth\` of ${deepest}.`,
      {
        fix: 'Functions that call each other must come to an end. Where they do, raise `functionDepth` in `project.limits`.',
      },
    )
  const denied = (rule: string, needs: string): TentError => {
    o.log.write('denied', { at: o.clock.now(), name, ...callerOf(caller), rule })
    return refusedBy(name, needs, caller)
  }
  const said = ruled(record.access, caller)
  if ('needs' in said) throw denied(said.rule, said.needs)
  // One write is one moment: what a query and a change call inside their own work is handed the moment they were.
  const inherits = parent && (parent.work.kind === 'query' || parent.work.kind === 'change')
  const now = inherits ? parent.work.now : new Date(o.clock.now())
  // The time of a call is one: a pass that is carried out again ends when the first one would have.
  const ends = asked.ends ?? performance.now() + limitOf(o.description, timeLimit[kind])
  const work: Work = { name, kind, depth, now, ends }
  const open = parent?.writing ? { writing: parent.writing } : parent?.tx ? { tx: parent.tx } : undefined
  const inWrite = kind !== 'action' && open && parent?.written ? { ...open, written: parent.written } : {}
  const reads = asked.reads === true || parent?.reads === true ? { reads: true as const } : {}
  const fills = asked.fills ?? parent?.fills
  if (fills && kind === 'query') throw readsInFill(`The query ${name}`)
  // What a step of a run calls belongs to that run and step, however deep the calls stand in each other.
  const inRun = parent?.run ? { run: parent.run } : {}
  const cx: CallContext = {
    ...{ app: o, version: o.version, caller, made: 0, signal: never, work },
    ...inWrite,
    ...reads,
    ...(fills ? { fills } : {}),
    ...inRun,
    ...(asked.left ? { left: asked.left } : {}),
    ...((asked.noting ?? parent?.noting) ? { noting: asked.noting ?? parent?.noting } : {}),
    ...(asked.say ? { say: asked.say } : {}),
    // What is called from code inside the call answers the same request.
    ...((asked.about ?? parent?.about) ? { about: asked.about ?? parent?.about } : {}),
  }
  const zone = projectZone(o.description.project)
  const input = checkedInput(name, record.input, given, { now, zone, caller })
  checkFiles(o, name, record.input, input, caller)
  const access: Record<string, unknown> = Object(record.access)
  const arrow = o.allows.get(name)
  if (said.says === 'asks' && !allows(o, cx, { access, input, ...(arrow ? { arrow } : {}) }))
    throw denied(said.rule, 'needs a caller that its rule lets in')
  // After step 7 and before step 8: only a caller who may call it, with an input that fits, learns that it asks.
  if (record.danger === 'ask' && asked.asks && !parent) agreedTo(o, name, input, caller, asked.asks)
  // A function that asks a person, reached under a tool call that nobody agreed to, is refused before it runs.
  const held = parent && record.danger === 'ask' ? agreedOr(cx, name, 'asks') : cx
  const run = o.runs.get(name)
  const call = (fn: unknown, handed?: unknown): unknown =>
    called(o, String(Reflect.get(Object(fn), 'definition')), handed, { caller: { kind: 'system' }, parent: held })
  return { o, cx: held, record, input, call, ...(run ? { run } : {}) }
}

/**
 * Takes an app, the name of a function, the input, and who asks. Passes steps 5 to 10 of the door: finds the
 * function by its name, checks its rule and its input, carries it out with a `db` that is limited to its caller,
 * filters what it answers through its output, and writes the call into the log. A query and a change answer at
 * once, and an action answers a promise. A failure is written into the log, is told to whoever listens for
 * `call.failed`, and is thrown as it is: T0001 for a name that is no function, and what the steps throw. Of an
 * app that keeps a data file for each tenant, a call that names a file which is not ready is carried out again
 * from its start once the file is, within the one time of the call, which runs from its start over every pass
 * and over the waits between them: it then answers a promise.
 */
export function called(o: Opened, name: string, given: unknown, asked: Asked): unknown {
  // A call that came from outside is a piece of work of its own, which its processor time is booked to: one for a
  // name that is no definition is the door's.
  const work = (): unknown =>
    asPiece(o, known(o, name) ? name : 'door', asked.caller, () => calledHere(o, name, given, asked))
  const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  const writes = record?.kind === 'change' || record?.kind === 'action'
  // A read is asked again, and keeps no id.
  if (asked.callId === undefined || asked.parent || !writes) return work()
  const call = { name, given, caller: asked.caller, id: asked.callId }
  return keptCall(o, call, work)
}

/** A call as `called` carries it out, inside the piece of work it belongs to. */
function calledHere(o: Opened, name: string, given: unknown, asked: Asked): unknown {
  const from = asked.parent?.work.kind
  // A query and a change that another one calls are part of its pass, and are carried out again with it.
  if (!o.tenantFiles || from === 'query' || from === 'change' || from === 'rule')
    return calledOnce(o, name, given, asked)
  const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  // An action is carried out once: each promise of its `db` waits for the file that it names.
  if (kindOf(record) === 'action') return calledOnce(o, name, given, asked)
  const ends = performance.now() + limitOf(o.description, timeLimit[kindOf(record) ?? 'query'])
  return o.tenantFiles.carried(ends, () => calledOnce(o, name, given, { ...asked, ends }))
}

/**
 * One pass of a call, as a span of its own: by the name of the function, with the kind of its caller. A pass that
 * named a file which is not ready is no failure of it.
 */
function calledOnce(o: Opened, name: string, given: unknown, asked: Asked): unknown {
  // Under `tent test`, the test that runs touched the definition.
  if (Object.hasOwn(o.description.functions, name) || Object.hasOwn(o.description.flows, name)) noteTouched(name)
  const span = openSpan(o, { name: logName(o, name), kind: 'call', facts: { caller: asked.caller.kind } })
  const failed = (error: unknown): never => {
    endSpan(span, error instanceof NotReady ? undefined : error)
    throw error
  }
  let answer: unknown
  try {
    answer = insideSpan(span, () => passedOnce(o, name, given, asked))
  } catch (error) {
    return failed(error)
  }
  if (answer instanceof Promise)
    return answer.then((value: unknown) => {
      endSpan(span)
      return value
    }, failed)
  endSpan(span)
  return answer
}

/** One pass of a call through steps 5 to 10 of the door. */
function passedOnce(o: Opened, name: string, given: unknown, asked: Asked): unknown {
  const began = performance.now()
  const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  const kind = kindOf(record)
  // The reads of a query that is called from outside are kept for the length of the call: a slow one is advised on.
  const plans: Parameters<NonNullable<CallContext['noting']>>[0][] = []
  const noting: CallContext['noting'] = (plan, answer, file) => {
    plans.push(plan)
    asked.noting?.(plan, answer, file)
  }
  const ended = (error?: unknown): void => {
    const { at, ms } = logCall(o, {
      name,
      caller: asked.caller,
      began,
      ...(kind ? { kind } : {}),
      ...(error === undefined ? {} : { error }),
    })
    if (kind === 'query' && ms > slowAfter && !asked.parent) {
      o.log.write('slow', { at, name, ms })
      if (error === undefined) adviseSlow(o, name, plans)
    }
    // A call through the door counts for the version that served it while a release goes: a failure that is not the
    // caller's is the version's.
    if (kind && !asked.parent)
      releaseCounted(o, ms, error !== undefined && (!isShown(error) || (statusOf(error.code) ?? 0) >= 500))
    // A name that reaches no function is the door's, which counts the request; the run of an action carries
    // the action out itself, whose call was counted where it was made.
    const units = { calls: 1, ms: performance.now() - began, ...(error === undefined ? {} : { failed: 1 }) }
    if ((kind || memberOf(o, name)) && !asked.inline) gather(o, name, units, { caller: asked.caller, definition: name })
  }
  const failed = (error: unknown): never => {
    // A pass that named a file which is not ready is no failure: nothing of it is logged or told.
    if (error instanceof NotReady) throw error
    ended(error)
    o.raise('call.failed', { app: o.app, name, caller: asked.caller, error })
    throw error
  }
  // The scopes of a key hold at the call that came through the door, and not for what that call calls from code.
  if (!asked.parent && !asked.own)
    try {
      inScope(asked.caller, name)
      inGrant(o, asked.caller, name, asked.reads === true)
    } catch (error) {
      return failed(error)
    }
  // A flow that asks a person asks a program first, once its rule lets the caller in.
  const asking = record || asked.parent || !asked.asks ? undefined : o.description.flows[name]
  if (asking?.danger === 'ask' && asked.asks && !('needs' in ruled(asking.access, asked.caller)))
    try {
      agreedTo(o, name, given, asked.caller, asked.asks)
    } catch (error) {
      return failed(error)
    }
  // A flow that is offered is called through the door as a function is: its call starts a run and waits for it.
  const flow = record || asked.parent ? undefined : o.flows?.offered(name, given, asked)
  if (flow) return flow
  // A place of record that has been behind too long refuses every new write before it begins.
  if (kind === 'change' || kind === 'action')
    try {
      recordHolds(o)
    } catch (error) {
      return failed(error)
    }
  // A member of an agent - `helper.working`, `helper.approve` - is answered by the engine.
  const member = record ? undefined : memberOf(o, name)
  if (member)
    try {
      const value = answerMember(o, member, given, asked.caller)
      ended()
      return value
    } catch (error) {
      return failed(error)
    }
  if (!record || !kind)
    return failed(
      new TentError('T0001', `No function named ${JSON.stringify(name).slice(0, 80)} can be reached.`, {
        fix: 'Call a query, a change or an action of the app by its name: `tent map` lists them.',
      }),
    )
  // A heavy query that is asked through the door, or from an action, is carried out on a query thread, which
  // passes every step itself. Called by a query or a change, it runs where its caller runs, and one of a table kept
  // in memory where its rows are.
  const from = asked.parent?.work.kind
  if (
    kind === 'query' &&
    record.heavy === true &&
    o.threads &&
    !readsMemory(o, record) &&
    (from === undefined || from === 'action' || from === 'seed')
  )
    return o.threads.call(name, given, asked.caller, began, asked.ends)
  if (kind === 'action') {
    // What may not be called from here fails at once, since a query and a change cannot wait for a refusal.
    try {
      allowedHere(name, kind, asked.parent)
    } catch (error) {
      return failed(error)
    }
    const ends = new AbortController()
    const work = (async () => {
      // The rule of an action reads at once. Where it names a file that is not ready, the rule is asked again once
      // the file is, within the time of the call: the action waits for the file there as its body does.
      const until = asked.ends ?? performance.now() + limitOf(o.description, timeLimit.action)
      // An action that states `worker` or `background` is a run of one step, handed out as a step's work is. A
      // call that names one of its runs alone waits for it, or stops it, for the caller who started it.
      const heavy = typeof record.worker === 'string' || record.background === true || record.background === 'here'
      const flows = heavy && !asked.inline ? o.flows : undefined
      const named = isWritten(given) && typeof given.run === 'string'
      if (flows && named && Object.keys(Object(given)).every((key) => key === 'run' || key === 'stop')) {
        const said = ruled(record.access, asked.caller)
        if ('needs' in said) throw refusedBy(name, said.needs, asked.caller)
        if (Reflect.get(Object(given), 'stop') === true && (asked.reads === true || asked.parent?.reads === true))
          throw readOnly(`A stop of a run of ${name}`)
        const work = { name, kind, depth: 1, now: new Date(o.clock.now()), ends: until }
        const cx: CallContext = { app: o, version: o.version, caller: asked.caller, made: 0, signal: never, work }
        return leaving(o.description, name, record, await flows.action(cx, asked.parent, undefined, given))
      }
      // An action that says it changes nothing is carried out as a call that only reads, here as on a reader.
      const quiet = record.changes === false ? { reads: true as const } : {}
      const pass = (): Carried => passed(o, name, record, kind, given, { ...asked, ...quiet, ends: until })
      const carried = await (o.tenantFiles ? o.tenantFiles.carried(until, pass) : pass())
      carried.cx.signal = ends.signal
      // An action that a person agreed to under a tool call is made once, over every making of its step.
      const carry = (): Promise<unknown> =>
        madeOnce(carried.cx, () =>
          flows ? flows.action(carried.cx, asked.parent, carried.input, given) : carryAction(carried, ends),
        )
      // An action that states `remember` is not carried out again for what it was answered for: step 8 of the door.
      const value =
        record.remember !== undefined && !asked.inline
          ? await (await import('../remember/remembered.ts')).remembered(
              o,
              name,
              record,
              carried.cx,
              carried.input,
              carry,
            )
          : await carry()
      return leaving(o.description, name, record, value)
    })()
    const told = work.then((value) => {
      ended()
      return value
    }, failed)
    o.inFlight.add(told)
    const left = (): void => void o.inFlight.delete(told)
    told.then(left, left)
    return told
  }
  try {
    allowedHere(name, kind, asked.parent)
    if (kind === 'change' && (asked.reads === true || asked.parent?.reads === true)) throw readOnly(name)
    const carried = passed(
      o,
      name,
      record,
      kind,
      given,
      kind === 'query' && !asked.parent ? { ...asked, noting } : asked,
    )
    const value = kind === 'change' ? carryChange(carried) : leaving(o.description, name, record, carryQuery(carried))
    // A change that states `everywhere` is answered once every reader holds what its request wrote.
    const request = kind === 'change' && record.everywhere === true ? o.machine.asked() : undefined
    if (request) request.everywhere = true
    ended()
    return value
  } catch (error) {
    return failed(error)
  }
}
