import { AsyncLocalStorage } from 'node:async_hooks'
import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { Parent } from './ids.ts'
import { newSpanId, newTraceId } from './ids.ts'
import { spanEnded, spanOpened } from './keeping.ts'

/** What a span is of: the door, a call, a read or a write of `db`, a run and its parts, a model, a tool, what leaves. */
type SpanKind =
  | 'door'
  | 'page'
  | 'call'
  | 'query'
  | 'write'
  | 'run'
  | 'step'
  | 'entry'
  | 'wait'
  | 'model'
  | 'tool'
  | 'sequence'
  | 'service'
  | 'fetch'
  | 'draw'
  | 'asked'
  | 'file'
  | 'switch'
  | 'task'

/** A fact of a span: a name, a count, a size, a time or a code. Never a value that was handed, read or written. */
export type Fact = string | number | boolean | string[]

/** One span while it is open: what it is of, where it stands in its trace, and when it began. */
export interface Span {
  o: Opened
  trace: string
  id: string
  parent?: string
  name: string
  kind: SpanKind
  // The moment it began, by the clock of the app, and the same by the clock that never jumps.
  at: number
  began: number
  facts: Record<string, Fact>
  // The code it failed with, once it did.
  code?: string
  ended?: true
}

/** What a span is opened with: its name, its kind, its facts, and the trace it continues where it is not the open one. */
export interface SpanOpening {
  name: string
  kind: SpanKind
  facts?: Record<string, Fact>
  // A span of another trace than the one under way: a request that names its parent, a run that wakes.
  under?: Parent | { trace: string }
  // A span that begins no trace of its own: where no trace is under way, nothing is opened.
  inside?: true
}

const open = new AsyncLocalStorage<Span>()

/** The span under way, where one is. */
export const spanNow = (): Span | undefined => open.getStore()

/** The trace and the span under way, as a `traceparent` names them to whatever the work hands on. */
export function parentNow(): Parent | undefined {
  const span = open.getStore()
  return span && !span.ended ? { trace: span.trace, span: span.id } : undefined
}

/** Adds facts to a span: a fact that is nothing is left out. */
export function addTo(span: Span, facts: Record<string, Fact | undefined>): void {
  for (const [name, fact] of Object.entries(facts)) if (fact !== undefined) span.facts[name] = fact
}

/** The code that a failure is written under in a span: its own code, or T0009 for anything that is not ours. */
const codeOf = (error: unknown): string => (error instanceof TentError ? error.code : 'T0009')

/**
 * Takes an app and what a span is opened with. Opens the span: under the span that is under way, or in the trace
 * that the opening names, or as the first span of a new trace. Answers it, or nothing for a span that is `inside`
 * where no trace is under way. It is closed by `endSpan`.
 */
export function openSpan(o: Opened, opening: SpanOpening): Span | undefined {
  const above = opening.under ? undefined : open.getStore()
  if (opening.inside && !above && !opening.under) return undefined
  const under = opening.under
  const span: Span = {
    o,
    trace: under?.trace ?? above?.trace ?? newTraceId(),
    id: newSpanId(),
    name: opening.name,
    kind: opening.kind,
    at: o.clock.now(),
    began: performance.now(),
    facts: { ...opening.facts },
  }
  const parent = under && 'span' in under ? under.span : above?.id
  if (parent) span.parent = parent
  spanOpened(span)
  return span
}

/** Closes a span, as having worked or with the code it failed with. A span is closed once. */
export function endSpan(span: Span | undefined, failed?: unknown): void {
  if (!span || span.ended) return
  if (failed !== undefined && span.code === undefined) span.code = codeOf(failed)
  span.ended = true
  spanEnded(span, performance.now() - span.began)
}

/**
 * Keeps a span that is told once it is over, under the span under way: a model call, whose try is told with how long
 * it took and what it used. Nothing where no trace is under way.
 */
export function pastSpan(o: Opened, opening: SpanOpening, ms: number, code?: string): Span | undefined {
  const span = openSpan(o, { ...opening, inside: true })
  if (!span) return undefined
  span.at -= ms
  span.began -= ms
  if (code) span.code = code
  endSpan(span)
  return span
}

/** Marks a span as failed with a code, where what it answers says so and nothing was thrown. */
export function failSpan(span: Span | undefined, code: string): void {
  if (span && span.code === undefined) span.code = code
}

/** Carries work out with a span as the one under way, so that what it opens stands under it. */
export const insideSpan = <Answer>(span: Span | undefined, work: () => Answer): Answer =>
  span ? open.run(span, work) : work()

/**
 * Takes an app, what a span is opened with, and the work. Carries the work out inside a span of its own, which is
 * closed when the work answers or throws: for a promise, when it is settled. Answers what the work answers.
 */
export function spanned<Answer>(o: Opened, opening: SpanOpening, work: (span: Span | undefined) => Answer): Answer {
  const span = openSpan(o, opening)
  if (!span) return work(undefined)
  return open.run(span, () => {
    let answer: Answer
    try {
      answer = work(span)
    } catch (error) {
      endSpan(span, error)
      throw error
    }
    if (answer instanceof Promise)
      answer.then(
        () => endSpan(span),
        (error: unknown) => endSpan(span, error),
      )
    else endSpan(span)
    return answer
  })
}

/** Says of the span of a draw under way that its page was streamed: sent before what its parts waited for came. */
export function drawStreamed(): void {
  const span = open.getStore()
  if (span?.kind === 'draw') span.facts.streamed = true
}

/** Names the span of a draw under way by the screen that answers the address, never by the address itself. */
export function nameDraw(screen: string): void {
  const span = open.getStore()
  if (span?.kind === 'draw') span.name = screen
}
