import type { LogTable } from '../log/tables.ts'
import type { Opened } from '../opened.ts'

/** A span of a trace as it is read: its place in the tree, what it was, and the rows of the log written under it. */
interface TreeSpan {
  span: string
  parent?: string
  name: string
  kind: string
  at: number
  ms: number
  ok: boolean
  code?: string
  facts: Record<string, unknown>
  machine: string
  // On the slowest path from the first span down: the child that took longest, at each span.
  slowest: boolean
  under: TreeSpan[]
  // The lines and the errors of the log that were written inside it, and of a slow query its row.
  rows: { table: string; row: Record<string, unknown> }[]
}

/** A trace as `tent logs --trace` reads it: its id, and its spans as a tree from those whose parent it does not hold. */
export interface Tree {
  trace: string
  spans: TreeSpan[]
}

// The tables of the log whose rows stand in a tree under the span they were written in: a slow query under its call.
const beside: LogTable[] = ['lines', 'errors', 'slow']

const factsOf = (text: unknown): Record<string, unknown> => {
  try {
    return Object(JSON.parse(String(text ?? '{}')))
  } catch {
    return {}
  }
}

/**
 * Takes an app and the id of a trace. Answers the trace as a tree: each span under its parent, in the order they
 * began, with the rows of the log that were written inside it, and the slowest path marked. A span whose parent the
 * trace does not hold, as one a page or a program named, stands at the top. Nothing for a trace that was not kept.
 */
export function treeOf(o: Opened, trace: string): Tree | undefined {
  // A call, a call out and a model call are rows of their own tables, each written at its end.
  const own = (table: LogTable, kind: (row: Record<string, unknown>) => string): Record<string, unknown>[] =>
    o.log.withTrace(table, trace).flatMap((row) =>
      row.span
        ? [
            {
              ...row,
              kind: kind(row),
              at: Number(row.at) - Number(row.ms ?? 0),
              ok: row.ok ?? (Number(row.status ?? 200) < 400 ? 1 : 0),
              name: row.name ?? row.call,
            },
          ]
        : [],
    )
  const rows = [
    ...o.log.withTrace('spans', trace),
    ...own('calls', () => 'call'),
    ...own('outgoing', (row) => (row.service ? 'service' : 'fetch')),
    ...own('modelCalls', () => 'model'),
  ]
  if (!rows.length) return undefined
  const spans = new Map<string, TreeSpan>()
  for (const row of rows.toSorted((a, b) => Number(a.at) - Number(b.at)))
    spans.set(String(row.span), {
      span: String(row.span),
      ...(row.parent ? { parent: String(row.parent) } : {}),
      name: String(row.name),
      kind: String(row.kind),
      at: Number(row.at),
      ms: Number(row.ms),
      ok: row.ok === 1,
      ...(row.code ? { code: String(row.code) } : {}),
      facts: factsOf(row.facts),
      machine: String(row.machine ?? ''),
      slowest: false,
      under: [],
      rows: [],
    })
  const top: TreeSpan[] = []
  for (const span of spans.values()) {
    const parent = span.parent ? spans.get(span.parent) : undefined
    if (parent) parent.under.push(span)
    else top.push(span)
  }
  for (const table of beside)
    for (const row of o.log.withTrace(table, trace)) {
      const span = spans.get(String(row.span ?? ''))
      if (span) span.rows.push({ table, row })
    }
  // The slowest path: from the longest span at the top, down through the longest child of each.
  let at = top.toSorted((a, b) => b.ms - a.ms)[0]
  while (at) {
    at.slowest = true
    at = at.under.toSorted((a, b) => b.ms - a.ms)[0]
  }
  return { trace, spans: top }
}

/** One trace as `tent logs --slow` lists it: its id, its first span, when it began and how long it took. */
export interface SlowTrace {
  trace: string
  name: string
  kind: string
  at: number
  ms: number
  ok: boolean
}

/**
 * Takes an app, the moment from which on, and how many. Answers the slowest traces that began since then, the
 * slowest first: each by the span at its top that took longest.
 */
export function slowestOf(o: Opened, since: number, newest: number): SlowTrace[] {
  const traces = new Map<string, { spans: Map<string, Record<string, unknown>>; failed: boolean }>()
  for (const row of o.log.rows('spans', { since })) {
    const trace = String(row.trace)
    const held = traces.get(trace) ?? { spans: new Map(), failed: false }
    held.spans.set(String(row.span), row)
    if (row.ok !== 1) held.failed = true
    traces.set(trace, held)
  }
  const slow: SlowTrace[] = []
  for (const [trace, held] of traces) {
    const tops = [...held.spans.values()].filter((row) => !row.parent || !held.spans.has(String(row.parent)))
    const first = tops.toSorted((a, b) => Number(b.ms) - Number(a.ms))[0]
    if (first)
      slow.push({
        trace,
        name: String(first.name),
        kind: String(first.kind),
        at: Number(first.at),
        ms: Number(first.ms),
        ok: !held.failed,
      })
  }
  return slow.toSorted((a, b) => b.ms - a.ms).slice(0, newest)
}
