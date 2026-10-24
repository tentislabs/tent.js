import type { At, Told } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import type { Parent } from './ids.ts'
import { newSpanId, newTraceId } from './ids.ts'
import { spanWhole } from './keeping.ts'
import type { Span } from './span.ts'
import { endSpan, insideSpan, openSpan, parentNow } from './span.ts'

/** A wait of a step, from its start: the span it stood under, and when it began. */
interface Waited {
  trace: string
  parent: string
  at: number
}

/** What tracing holds of one run while it lives in this program. */
interface RunTrace {
  // The span the run was started under, or the trace it began, where nothing was under way.
  under: Parent | { trace: string }
  span?: Span
  // The span of the last stretch of work of the run, which a wait that comes after it stands under.
  last?: string
  steps: Map<string, Span>
  waits: Map<string, Waited>
  // The newest model turn of an agent's run: the tool calls of that turn stand under it.
  model?: string
}

const traced = new WeakMap<Opened, Map<string, RunTrace>>()

function runsOf(o: Opened): Map<string, RunTrace> {
  let held = traced.get(o)
  if (!held) {
    held = new Map()
    traced.set(o, held)
  }
  return held
}

const stepKey = (name: string, repeat: number): string => `${name}\n${repeat}`

/** The span a run that is added now stands under: the call, the step or the request under way, or a trace of its own. */
export const runUnder = (): Parent | { trace: string } => parentNow() ?? { trace: newTraceId() }

/** Notes the span that a run was started under, whose trace its row keeps. */
export function runAdded(o: Opened, run: string, under: Parent | { trace: string }): void {
  runsOf(o).set(run, { under, steps: new Map(), waits: new Map() })
}

/**
 * What a run that this program did not see added stands under: the step of its parent run that started it, as an
 * entry of `step.many` is; for a run woken after a restart, the trace its row keeps; or a trace of its own.
 */
function heldOf(o: Opened, run: string): RunTrace {
  const runs = runsOf(o)
  const held = runs.get(run)
  if (held) return held
  const view = o.flows?.runner.read(run)
  const parent = view?.parent ? runs.get(view.parent) : undefined
  const step =
    parent && view?.parentStep ? parent.steps.get(stepKey(view.parentStep.name, view.parentStep.repeat)) : undefined
  const under = step
    ? { trace: step.trace, span: step.id }
    : parent?.span
      ? { trace: parent.span.trace, span: parent.span.id }
      : { trace: view?.trace ?? newTraceId() }
  const made: RunTrace = { under, steps: new Map(), waits: new Map() }
  runs.set(run, made)
  return made
}

/** The code a run or one of its steps failed with, as the runner keeps it. */
function failedCode(o: Opened, run: string, step?: { name: string; repeat: number }): string {
  const view = o.flows?.runner.read(run)
  const error = step
    ? view?.steps.find((one) => one.name === step.name && one.repeat === step.repeat)?.error
    : view?.error
  return error?.code ?? 'T0009'
}

/** The code that the last try of a step that waits failed with, where it waits to be tried again. */
function triedCode(o: Opened, run: string, step: { name: string; repeat: number }): string | undefined {
  const view = o.flows?.runner.read(run)
  const error: unknown = view?.steps.find((one) => one.name === step.name && one.repeat === step.repeat)?.error
  const code: unknown = Reflect.get(Object(error), 'code')
  return typeof code === 'string' ? code : undefined
}

/** Keeps the wait of a step that woke: from its start to now, under the span it began in. */
function woke(o: Opened, held: RunTrace, key: string, name: string): void {
  const waited = held.waits.get(key)
  if (!waited) return
  held.waits.delete(key)
  const span: Span = {
    o,
    trace: waited.trace,
    id: newSpanId(),
    parent: waited.parent,
    name,
    kind: 'wait',
    at: waited.at,
    began: performance.now(),
    facts: {},
  }
  spanWhole(span, Math.max(0, o.clock.now() - waited.at))
}

/**
 * Takes an app and what its runner told. Makes the spans of runs: a stretch of work of a run from when it runs to
 * when it waits or ends, each step under it, and each wait from its start to its wake. A run of an agent stands
 * each tool call under the model turn that asked for it. A run that wakes carries the trace it began in on.
 */
export function runTold(o: Opened, what: Told): void {
  const runs = runsOf(o)
  if (what.kind === 'run') {
    if (what.state === 'running') {
      const held = heldOf(o, what.run)
      if (held.span && !held.span.ended) return
      const view = o.flows?.runner.read(what.run)
      const entry = view?.parentStep !== undefined
      held.span = openSpan(o, {
        name: view?.flow ?? 'run',
        kind: entry ? 'entry' : 'run',
        facts: { run: what.run, ...(view?.version ? { version: view.version } : {}) },
        under: held.under,
      })
      return
    }
    const held = runs.get(what.run)
    if (!held) return
    if (held.span) {
      if (what.state === 'failed') held.span.code = failedCode(o, what.run)
      held.span.facts.state = what.state
      held.last = held.span.id
      endSpan(held.span)
      held.span = undefined
    }
    if (what.state === 'done' || what.state === 'failed' || what.state === 'stopped') {
      for (const step of held.steps.values()) endSpan(step)
      runs.delete(what.run)
    }
    return
  }
  const held = runs.get(what.run) ?? heldOf(o, what.run)
  const key = stepKey(what.name, what.repeat)
  woke(o, held, key, what.name)
  if (what.state === 'started') {
    const run = held.span
    if (!run) return
    const agent = o.flows?.runner.read(what.run)?.kind === 'agent'
    const turn = /^model \d+$/.test(what.name)
    const parent = agent && !turn && held.model ? held.model : run.id
    const span = openSpan(o, {
      name: what.name,
      kind: 'step',
      facts: what.repeat > 1 ? { repeat: what.repeat } : {},
      under: { trace: run.trace, span: parent },
    })
    if (!span) return
    endSpan(held.steps.get(key))
    held.steps.set(key, span)
    if (agent && turn) held.model = span.id
    return
  }
  const span = held.steps.get(key)
  held.steps.delete(key)
  if (span && what.state === 'failed') span.code = failedCode(o, what.run, what)
  // A try that failed, and waits for another, ends its span with the code it failed with.
  if (span && what.state === 'waiting') {
    const code = triedCode(o, what.run, what)
    if (code) span.code = code
  }
  endSpan(span)
  if (what.state === 'waiting') {
    const trace = span?.trace ?? held.span?.trace
    const parent = span?.parent ?? held.span?.id ?? held.last
    if (trace && parent) held.waits.set(key, { trace, parent, at: o.clock.now() })
  }
}

/**
 * Carries the work of a run out with its span as the one under way: the work of a step under the span of that
 * step, and the rest of the run's work under the span of the run.
 */
export function insideRun<Answer>(o: Opened, at: At, work: () => Answer): Answer {
  const held = runsOf(o).get(at.run)
  if (!held) return work()
  const span = at.step ? (held.steps.get(stepKey(at.step.name, at.step.repeat)) ?? held.span) : held.span
  return insideSpan(span, work)
}

/** The trace and the span that a run stands in now, which what it hands to another machine names as its parent. */
export function runParent(o: Opened, run: string, step?: { name: string; repeat: number }): Parent | undefined {
  const held = runsOf(o).get(run)
  const span = (step ? held?.steps.get(stepKey(step.name, step.repeat)) : undefined) ?? held?.span
  return span ? { trace: span.trace, span: span.id } : undefined
}

/** The trace a run stands in: while it lives here, or as the log kept its first stretch of work. */
export function traceOfRun(o: Opened, run: string): string | undefined {
  const held = runsOf(o).get(run)
  return held?.span?.trace ?? held?.under.trace ?? o.log.traceOfRun(run)
}
