import { here } from '../../data/index.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { ownSpans } from '../log/tables.ts'
import type { Span } from './span.ts'

/** A span as the table `spans` of the log holds it. */
export interface SpanRow {
  trace: string
  span: string
  parent?: string
  at: number
  ms: number
  name: string
  kind: string
  ok: boolean
  code?: string
  facts: string
  machine: string
}

/**
 * The spans of one trace that this machine made while some of them were open: kept whole, or not at all. A segment
 * that is kept writes each span as it ends; one that is not yet known to be kept holds them until it is, or ends.
 */
interface Segment {
  // Held as they ended, and made rows only once they are kept: what is dropped costs no row.
  held: { span: Span; ms: number }[]
  open: number
  keep: boolean
}

// The most spans one segment holds in memory: a trace past it keeps its first ones, and what it dropped is counted.
const segmentCap = 5000

// How many traces that were kept are remembered, so that what a trace does later is kept with what it did first.
const keptRemembered = 10_000

// A trace whose spans all ended here unkept is held so long, and so many such traces, for an error that comes later:
// a run that a call started fails after the call answered, and the trace is kept whole with the call.
const endedHeld = 600_000
const endedMost = 1000

/** What the keeping holds of one app. */
interface Keeping {
  segments: Map<string, Segment>
  // The spans of traces that ended here unkept, the oldest first, with when they ended.
  ended: Map<string, { held: Segment['held']; at: number }>
  kept: Set<string>
  machine?: string
}

const keepings = new WeakMap<Opened, Keeping>()

/** Where the spans that an app keeps go, where they are not written into its own log: a reader's and a worker's writer. */
const away = new WeakMap<Opened, (rows: SpanRow[]) => void>()

/** What is told each span row that an app writes into its log: the export, where the project names one. */
const told = new WeakMap<Opened, (rows: SpanRow[]) => void>()

function keepingOf(o: Opened): Keeping {
  let held = keepings.get(o)
  if (!held) {
    held = { segments: new Map(), ended: new Map(), kept: new Set() }
    keepings.set(o, held)
  }
  return held
}

/** The id of the machine that makes a span: the one this machine's data names, or the one it was given. */
function machineOf(o: Opened, k: Keeping): string {
  if (k.machine === undefined)
    try {
      k.machine = here(o.store).id
    } catch {
      k.machine = ''
    }
  return k.machine
}

/**
 * The share of the traces that an app keeps where nothing in them asks it: `trace.share` of the project, and where
 * it states none 0.1 on live data and every one on test data.
 */
function shareOf(o: Opened): number {
  return boundsOf(o).share
}

// What the keeping reads of each description, read once: every span asks it.
const bounds = new WeakMap<object, { share: number; slow: number }>()

function boundsOf(o: Opened): { share: number; slow: number } {
  let held = bounds.get(o.description)
  if (!held) {
    const stated: unknown = Reflect.get(Object(o.description.project.trace), 'share')
    const share = typeof stated === 'number' ? stated : o.mode === 'live' ? 0.1 : 1
    held = { share, slow: storedLimit(o.description, 'slowSpan') }
    bounds.set(o.description, held)
  }
  return held
}

/**
 * Whether a trace is among the share that is kept: chosen by its id alone, so that every machine keeps or drops
 * the same trace.
 */
function chosen(trace: string, share: number): boolean {
  if (share >= 1) return true
  if (share <= 0) return false
  return Number.parseInt(trace.slice(-8), 16) / 0x1_0000_0000 < share
}

/**
 * Tells the keeping that a span was opened: its trace holds one more open span on this machine. A trace that is
 * among the share that is kept, or of which an earlier part was kept, is kept from its first span on.
 */
export function spanOpened(span: Span): void {
  const k = keepingOf(span.o)
  let segment = k.segments.get(span.trace)
  if (!segment) {
    const keep = k.kept.has(span.trace) || chosen(span.trace, shareOf(span.o))
    if (keep) remember(k, span.trace)
    // What the trace did here before, and held unkept, stands in this segment, to be kept with it.
    const before = k.ended.get(span.trace)
    k.ended.delete(span.trace)
    segment = { held: before?.held ?? [], open: 0, keep }
    k.segments.set(span.trace, segment)
  }
  segment.open++
}

/** The row of a span that ended after so many milliseconds. */
const rowOf = (span: Span, ms: number, machine: string): SpanRow => ({
  trace: span.trace,
  span: span.id,
  ...(span.parent ? { parent: span.parent } : {}),
  at: span.at,
  ms: Math.round(ms),
  name: span.name,
  kind: span.kind,
  ok: span.code === undefined,
  ...(span.code === undefined ? {} : { code: span.code }),
  facts: JSON.stringify(span.facts),
  machine,
})

/**
 * Tells the keeping that a span was closed after so many milliseconds. A segment comes to be kept, with what it
 * held, once a span of it failed or a span of work took longer than `limits.slowSpan`. Once the last open span of
 * its trace on this machine is closed, a segment that was never kept is dropped, and cost no write.
 */
export function spanEnded(span: Span, ms: number): void {
  const { o } = span
  const k = keepingOf(o)
  const segment = k.segments.get(span.trace)
  if (!segment) return
  // A wait is no work: its length says nothing of what is slow.
  const slow = span.kind !== 'wait' && span.kind !== 'page' && ms > boundsOf(o).slow
  if (!segment.keep && (span.code !== undefined || slow)) {
    segment.keep = true
    remember(k, span.trace)
    const machine = machineOf(o, k)
    keepRows(
      o,
      segment.held.map((one) => rowOf(one.span, one.ms, machine)),
    )
    segment.held = []
  }
  if (segment.keep) keepRows(o, [rowOf(span, ms, machineOf(o, k))])
  else if (segment.held.length < segmentCap) segment.held.push({ span, ms })
  if (--segment.open > 0) return
  k.segments.delete(span.trace)
  if (segment.keep || !segment.held.length) return
  // Unkept, it is held a while for an error that comes later in the same trace, within its bounds of time and count.
  const now = o.clock.now()
  k.ended.set(span.trace, { held: segment.held, at: now })
  for (const [trace, one] of k.ended) {
    if (k.ended.size <= endedMost && now - one.at <= endedHeld) break
    k.ended.delete(trace)
  }
}

/**
 * Keeps a span that is told whole once it is over: a wait, from its start to its wake, which no work held open.
 * It is kept where its trace is, and where it failed or took longer than `limits.slowSpan`.
 */
export function spanWhole(span: Span, ms: number): void {
  spanOpened(span)
  spanEnded(span, ms)
}

/** Remembers a trace as kept, the newest so many. */
function remember(k: Keeping, trace: string): void {
  k.kept.delete(trace)
  k.kept.add(trace)
  if (k.kept.size > keptRemembered)
    for (const oldest of k.kept) {
      k.kept.delete(oldest)
      break
    }
}

/**
 * Keeps rows of spans: where the app hands its spans to a writer, they go there; otherwise they are written into
 * its log, and told to its export.
 */
function keepRows(o: Opened, rows: SpanRow[]): void {
  if (!rows.length || o.closed) return
  const waiting = pending.get(o)
  if (waiting) {
    waiting.rows.push(...rows)
    return
  }
  // What is kept within a moment is written in one write: a write for each span, or for each call, would cost the
  // disk about what the call itself costs.
  const timer = setTimeout(() => flushed(o), writeEvery)
  timer.unref()
  pending.set(o, { rows: [...rows], timer })
  if (!closing.has(o)) {
    closing.add(o)
    o.before.push({ close: () => flushed(o) })
  }
}

/** Writes what an app kept and has not written yet, or hands it to the writer. */
function flushed(o: Opened): void {
  const waiting = pending.get(o)
  if (!waiting) return
  pending.delete(o)
  clearTimeout(waiting.timer)
  const send = away.get(o)
  if (send) {
    send(waiting.rows)
    return
  }
  // A span that is a row of another table of the log stands there alone.
  o.log.writeAll(
    'spans',
    waiting.rows.filter((row) => !Object.hasOwn(ownSpans, row.kind)).map((row) => ({ ...row })),
  )
  told.get(o)?.(waiting.rows)
}

// How long what was kept waits for the write it shares with what is kept after it, in milliseconds.
const writeEvery = 200

// The rows that were kept and wait for their one write, by app, and the apps whose closing writes them.
const pending = new WeakMap<Opened, { rows: SpanRow[]; timer: ReturnType<typeof setTimeout> }>()
const closing = new WeakSet<Opened>()

/** Takes the rows of spans that another machine of the app made and sent here, and keeps them as its own. */
export function keptFrom(o: Opened, rows: SpanRow[]): void {
  const k = keepingOf(o)
  for (const row of rows) remember(k, row.trace)
  keepRows(o, rows)
}

/** Hands the spans that an app keeps to its writer from here on, through what sends them. */
export function spansAway(o: Opened, send: (rows: SpanRow[]) => void): void {
  away.set(o, send)
}

/** Names what is told the span rows that an app writes into its log. */
export function spansTold(o: Opened, hear: (rows: SpanRow[]) => void): void {
  told.set(o, hear)
}
