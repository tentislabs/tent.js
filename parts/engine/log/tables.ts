/** What a column of the log holds: text, a whole number, which a time and a yes or no are kept as, or a number. */
type Held = 'text' | 'number' | 'real'

// Every row of the log names the trace and the span it was written in, where one was under way.
const traced = { trace: 'text', span: 'text' } as const
// A row that is a span itself - a call, a call out, a model call, a slow query - names its parent too.
const spanned = { ...traced, parent: 'text' } as const

/** The tables of the log, each with its columns in their order and what each column holds. */
export const logTables = {
  calls: {
    at: 'number',
    app: 'text',
    name: 'text',
    kind: 'text',
    callerKind: 'text',
    callerId: 'text',
    ms: 'number',
    ok: 'number',
    code: 'text',
    ref: 'text',
    ...spanned,
  },
  // The calls that led to an error stand in `stack`: `trace` is the trace it happened in.
  errors: { ref: 'text', at: 'number', name: 'text', message: 'text', stack: 'text', ...traced },
  slow: { at: 'number', name: 'text', ms: 'number', rows: 'number', ...spanned },
  denied: { at: 'number', name: 'text', callerKind: 'text', callerId: 'text', rule: 'text', ...traced },
  lines: { at: 'number', level: 'text', message: 'text', data: 'text', name: 'text', run: 'text', ...traced },
  // A plain `fetch` is a row with no service, and its host as its call.
  outgoing: { at: 'number', service: 'text', call: 'text', status: 'number', ms: 'number', run: 'text', ...spanned },
  // One row for each try of a model call. `counted` is `rule` where the model layer counted a unit itself.
  modelCalls: {
    at: 'number',
    name: 'text',
    answeredBy: 'text',
    reason: 'text',
    kind: 'text',
    run: 'text',
    caller: 'text',
    units: 'text',
    counted: 'text',
    raw: 'text',
    ms: 'number',
    ok: 'number',
    code: 'text',
    ...spanned,
  },
  // A span of a trace that no other table is: what it was, where it stands in its tree, and its facts, which hold names,
  // counts, sizes and codes alone.
  spans: {
    trace: 'text',
    span: 'text',
    parent: 'text',
    at: 'number',
    ms: 'number',
    name: 'text',
    kind: 'text',
    ok: 'number',
    code: 'text',
    facts: 'text',
    machine: 'text',
  },
  // A measure that a page took of what its visitor saw. Nothing that names the visitor.
  vitals: {
    at: 'number',
    screen: 'text',
    version: 'text',
    measure: 'text',
    value: 'real',
    device: 'text',
    connection: 'text',
  },
} satisfies Record<string, Record<string, Held>>

/** The name of a table of the log. */
export type LogTable = keyof typeof logTables

/** The tables whose rows are spans themselves, by the kind of span each row is, and the kinds `spans` does not keep. */
export const ownSpans: Record<string, LogTable> = {
  call: 'calls',
  service: 'outgoing',
  fetch: 'outgoing',
  model: 'modelCalls',
}
