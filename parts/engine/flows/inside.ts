import type { Db } from '../../core/index.ts'
import { fingerprint } from '../../core/index.ts'
import { createDb } from '../../data/index.ts'
import type { At } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { underWay, within } from '../context.ts'
import { stepNoting } from '../remember/stepReads.ts'
import type { Opened } from '../opened.ts'
import { sealed } from '../values/seal.ts'
import { dbSpan } from '../trace/db.ts'
import { versionGone } from '../versions.ts'

/** What the engine keeps of one making of a step: where it stands, and how often it called each thing with each input. */
interface Making {
  at: At
  counts: Map<string, number>
}

// What is kept of each making, by the record of the run in its call context.
const makings = new WeakMap<object, Making>()

// The signal of work whose place carries none, as one a worker tells: a step takes as long as its work takes.
const never = new AbortController().signal

/** Answers the app as the version of a run serves it. Throws T0007 for a version that can no longer be loaded. */
export function servedFor(o: Opened, version: string): Opened {
  const served = version === o.version ? o : o.versions?.get(version)?.served
  if (!served) throw versionGone(version)
  return served
}

/**
 * Takes an app and where work of a run stands. Answers the call context of that work: the version and the rights
 * of its run, and its step where it is in one. Work in a step is held as an action is, and may wait.
 */
function contextOf(o: Opened, at: At): CallContext {
  const run = { id: at.run, ...(at.step ? { step: at.step } : {}), ...(at.leave ? { leave: at.leave } : {}) }
  makings.set(run, { at, counts: new Map() })
  const work = {
    name: at.flow,
    kind: 'action' as const,
    depth: 1,
    now: new Date(o.clock.now()),
    ends: Number.POSITIVE_INFINITY,
  }
  const given = Object(o.flows?.runner.read(at.run)?.given)
  const reads = Reflect.get(given, 'reads') === true
  const fills: unknown = Reflect.get(given, 'fills')
  const call: unknown = Reflect.get(Object(fills), 'call')
  // The work of a step that remembers its answer notes what it reads, which the answer is kept with.
  const noting = stepNoting(o, at)
  return {
    app: servedFor(o, at.version),
    version: at.version,
    caller: at.as,
    made: 0,
    signal: at.signal ?? never,
    work,
    run,
    // The run of an action that a page read only reads, and the run of work that fills a column reads nothing.
    ...(reads ? { reads: true as const } : {}),
    ...(typeof call === 'string' ? { fills: { call } } : {}),
    ...(noting ? { noting } : {}),
  }
}

/** Carries work of a run out in its call context. */
export const inRunContext = <T>(o: Opened, at: At, work: () => T): T => within(contextOf(o, at), work)

/** The `db` of a run: it reads, answers promises, and is limited by the rights of the run. */
export function dbOf(o: Opened, at: At): Db {
  const served = servedFor(o, at.version)
  return createDb(o.files ?? o.store, served.description, at.as, 'async', served.rules, {
    system: at.as.kind === 'system',
    now: () => o.clock.now(),
    ids: o.ids,
    ...sealed(served),
    // Each read of the run is a span of the step it is made in, and is noted for the step where its work notes reads.
    traced: (what, work) => dbSpan(o, what, work),
    read: (plan, answer, file) => underWay()?.noting?.(plan, answer, file),
  })
}

/** The run of a call context under another `leave`, standing for the same making of its step. */
export function underLeave(run: NonNullable<CallContext['run']>, leave: 'agreed'): NonNullable<CallContext['run']> {
  const other = { ...run, leave }
  const making = makings.get(run)
  if (making) makings.set(other, making)
  return other
}

/** Where the work of a call context stands in a run, or nothing where it belongs to no run. */
export const atOf = (cx: CallContext): At | undefined => (cx.run ? makings.get(cx.run)?.at : undefined)

/**
 * Takes the call context of work inside a step, what it calls, and with what. Answers which call it is: the name
 * of what is called, the fingerprint of what it is given, and how many calls of that name with that input the step
 * made before it. So calls that a step makes side by side keep their keys in whatever order they land.
 */
export function whichCall(cx: CallContext, name: string, input: unknown): string {
  const making = cx.run ? makings.get(cx.run) : undefined
  return callAmong(making?.counts ?? new Map(), name, input)
}

/**
 * Takes how often each thing was called with each input, what is called now and with what. Answers which call it
 * is, as `whichCall` does, and counts it.
 */
export function callAmong(counts: Map<string, number>, name: string, input: unknown): string {
  const key = `${name}\n${fingerprint(JSON.stringify(input) ?? '')}`
  const before = counts.get(key) ?? 0
  counts.set(key, before + 1)
  return `${key}\n${before}`
}

/** The once-only key of a call inside a step: the first 32 characters of the fingerprint of its run, its step and which call it is. */
export function onceKey(at: At, call: string): string {
  return fingerprint([at.run, at.step?.name ?? '', String(at.step?.repeat ?? 0), call].join('\n')).slice(0, 32)
}
