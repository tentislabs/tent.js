import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { valuesOf } from '../values/ofApp.ts'
import type { SpanRow } from './keeping.ts'
import { spansTold } from './keeping.ts'

/** A line or an error of the log as it is sent out: its moment, its level, its words, and the span it was written in. */
export interface LogRecord {
  at: number
  level: string
  message: string
  trace?: string
  span?: string
  name?: string
  ref?: string
}

/** A measure of the speed a visitor saw, as it is sent out: a metric of its screen and its version. */
export interface VitalsRow {
  at: number
  screen: string
  version: string
  measure: string
  value: number
  device: string
  connection: string
}

/** What waits to be sent, each with when it was first held back. */
interface Waiting {
  spans: SpanRow[]
  logs: LogRecord[]
  vitals: VitalsRow[]
  timer?: ReturnType<typeof setTimeout>
  sending: boolean
}

// How long what was kept waits before it is sent, so that it leaves in batches; and how many leave in one.
const every = 1000
const batch = 512
// The most that waits for an address that does not take it: past it the oldest is dropped, as the log keeps it.
const held = 50_000

const waiting = new WeakMap<Opened, Waiting>()

/** A value of the project where it is a setting or a secret, as it stands now; a text as it is. */
function valueOf(o: Opened, stored: unknown): string | undefined {
  if (typeof stored === 'string') return stored
  const values = valuesOf(o)
  const setting: unknown = Reflect.get(Object(stored), 'setting')
  if (typeof setting === 'string') {
    const value: unknown = Reflect.get(values.settings.values, setting)
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  const secret: unknown = Reflect.get(Object(stored), 'secret')
  if (typeof secret === 'string')
    try {
      return values.secrets.value(secret)
    } catch {
      return undefined
    }
  return undefined
}

/** Where an app sends what it keeps, with the headers, as `trace.otlp` names them now. Nothing where it names none. */
function addressOf(o: Opened): { url: string; headers: Record<string, string> } | undefined {
  const otlp: unknown = Reflect.get(Object(o.description.project.trace), 'otlp')
  if (typeof otlp !== 'object' || otlp === null) return undefined
  const url = valueOf(o, Reflect.get(otlp, 'url'))
  if (!url) return undefined
  const headers: Record<string, string> = {}
  for (const [name, stored] of Object.entries(Object(Reflect.get(otlp, 'headers')))) {
    const value = valueOf(o, stored)
    if (value !== undefined) headers[name] = value
  }
  return { url: url.replace(/\/+$/, ''), headers }
}

/** Whether an app sends what it keeps to an address of the OpenTelemetry protocol. */
const exports = (o: Opened): boolean => typeof Reflect.get(Object(o.description.project.trace), 'otlp') === 'object'

const nano = (ms: number): string => (BigInt(Math.round(ms * 1000)) * 1000n).toString()

/** A value of the standard's form for one fact. */
function valueOfFact(fact: unknown): object {
  if (typeof fact === 'boolean') return { boolValue: fact }
  if (typeof fact === 'number') return Number.isInteger(fact) ? { intValue: String(fact) } : { doubleValue: fact }
  if (Array.isArray(fact)) return { arrayValue: { values: fact.map(valueOfFact) } }
  return { stringValue: String(fact) }
}

const attributes = (facts: Record<string, unknown>): object[] =>
  Object.entries(facts).map(([key, value]) => ({ key, value: valueOfFact(value) }))

// What the standard calls the kind of a span: what a request comes in by, and what goes out to another.
const server = ['door', 'task']
const client = ['service', 'fetch', 'model']

/** The spans in the standard's JSON form, the ids as hex, under the app as the service that made them. */
function tracesBody(o: Opened, rows: SpanRow[]): object {
  return {
    resourceSpans: [
      {
        resource: { attributes: attributes({ 'service.name': o.name, 'service.version': o.version }) },
        scopeSpans: [
          {
            scope: { name: 'tentjs' },
            spans: rows.map((row) => ({
              traceId: row.trace,
              spanId: row.span,
              ...(row.parent ? { parentSpanId: row.parent } : {}),
              name: row.name,
              kind: server.includes(row.kind) ? 2 : client.includes(row.kind) ? 3 : 1,
              startTimeUnixNano: nano(row.at),
              endTimeUnixNano: nano(row.at + row.ms),
              attributes: attributes({
                'tent.kind': row.kind,
                ...(row.machine ? { 'tent.machine': row.machine } : {}),
                ...JSON.parse(row.facts),
              }),
              status: row.ok ? { code: 1 } : { code: 2, message: row.code ?? 'failed' },
            })),
          },
        ],
      },
    ],
  }
}

// The numbers of the standard for the levels of a line.
const severities: Record<string, number> = { debug: 5, info: 9, warn: 13, error: 17 }

/** The lines and the errors in the standard's JSON form, each with its trace and its span. */
function logsBody(o: Opened, records: LogRecord[]): object {
  return {
    resourceLogs: [
      {
        resource: { attributes: attributes({ 'service.name': o.name, 'service.version': o.version }) },
        scopeLogs: [
          {
            scope: { name: 'tentjs' },
            logRecords: records.map((record) => ({
              timeUnixNano: nano(record.at),
              severityNumber: severities[record.level] ?? 9,
              severityText: record.level.toUpperCase(),
              body: { stringValue: record.message },
              attributes: attributes({
                ...(record.name ? { 'tent.name': record.name } : {}),
                ...(record.ref ? { 'tent.ref': record.ref } : {}),
              }),
              ...(record.trace ? { traceId: record.trace } : {}),
              ...(record.span ? { spanId: record.span } : {}),
            })),
          },
        ],
      },
    ],
  }
}

/** The measures in the standard's JSON form, each a point of a gauge named after its measure, by screen and version. */
function metricsBody(o: Opened, rows: VitalsRow[]): object {
  const names = [...new Set(rows.map((row) => row.measure))]
  return {
    resourceMetrics: [
      {
        resource: { attributes: attributes({ 'service.name': o.name, 'service.version': o.version }) },
        scopeMetrics: [
          {
            scope: { name: 'tentjs' },
            metrics: names.map((measure) => ({
              name: `tent.vitals.${measure}`,
              unit: measure === 'cls' ? '1' : 'ms',
              gauge: {
                dataPoints: rows
                  .filter((row) => row.measure === measure)
                  .map((row) => ({
                    timeUnixNano: nano(row.at),
                    asDouble: row.value,
                    attributes: attributes({
                      screen: row.screen,
                      version: row.version,
                      device: row.device,
                      ...(row.connection ? { connection: row.connection } : {}),
                    }),
                  })),
              },
            })),
          },
        ],
      },
    ],
  }
}

/** Sends one body through the guarded fetch, held to the address rule of the app. Answers whether it was taken. */
async function sent(o: Opened, address: string, headers: Record<string, string>, body: object): Promise<boolean> {
  const { guardedFetch } = await import('../../connect/index.ts')
  const listed: unknown = Reflect.get(Object(o.description.project), 'privateHosts')
  try {
    const answer = await guardedFetch({
      plain: true,
      mode: o.mode,
      privateHosts: Array.isArray(listed) ? listed.map(String) : [],
    })(address, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    // The answer is read whole, so that its connection is given back.
    await answer.arrayBuffer()
    return answer.ok
  } catch {
    return false
  }
}

/**
 * Sends what waits for an app, a batch of each at a time. What is not taken waits for the next turn, and what was
 * kept longer ago than `limits.traceKeep` is dropped and never tried again: the log holds it.
 */
async function flush(o: Opened, w: Waiting): Promise<void> {
  w.timer = undefined
  if (w.sending || o.closed) return
  const address = addressOf(o)
  if (!address) {
    w.spans = []
    w.logs = []
    w.vitals = []
    return
  }
  w.sending = true
  try {
    const old = o.clock.now() - storedLimit(o.description, 'traceKeep')
    w.spans = w.spans.filter((row) => row.at >= old)
    w.logs = w.logs.filter((record) => record.at >= old)
    w.vitals = w.vitals.filter((row) => row.at >= old)
    while (w.spans.length && !o.closed) {
      const rows = w.spans.slice(0, batch)
      if (!(await sent(o, `${address.url}/v1/traces`, address.headers, tracesBody(o, rows)))) break
      w.spans.splice(0, rows.length)
    }
    while (w.logs.length && !o.closed) {
      const records = w.logs.slice(0, batch)
      if (!(await sent(o, `${address.url}/v1/logs`, address.headers, logsBody(o, records)))) break
      w.logs.splice(0, records.length)
    }
    while (w.vitals.length && !o.closed) {
      const rows = w.vitals.slice(0, batch)
      if (!(await sent(o, `${address.url}/v1/metrics`, address.headers, metricsBody(o, rows)))) break
      w.vitals.splice(0, rows.length)
    }
  } finally {
    w.sending = false
  }
  if (w.spans.length || w.logs.length || w.vitals.length) later(o, w)
}

/** Sends what waits a moment from now, once: the timer holds the program open for nothing. */
function later(o: Opened, w: Waiting): void {
  if (w.timer || o.closed) return
  w.timer = setTimeout(() => void flush(o, w), every)
  w.timer.unref()
}

function waitingOf(o: Opened): Waiting {
  let w = waiting.get(o)
  if (!w) {
    w = { spans: [], logs: [], vitals: [], sending: false }
    waiting.set(o, w)
    const mine = w
    o.before.push({
      close() {
        if (mine.timer) clearTimeout(mine.timer)
        mine.spans = []
        mine.logs = []
        mine.vitals = []
      },
    })
  }
  return w
}

/**
 * Takes an app that is opened. Where its project names an address in `trace.otlp`, what it keeps of its traces, its
 * lines and its errors is sent there from here on, in batches.
 */
export function exportTraces(o: Opened): void {
  spansTold(o, (rows) => {
    if (!exports(o)) return
    const w = waitingOf(o)
    w.spans.push(...rows)
    if (w.spans.length > held) w.spans.splice(0, w.spans.length - held)
    later(o, w)
  })
}

/** Holds a line or an error of the log to be sent out beside the traces, where the app sends them. */
export function logSentOut(o: Opened, record: LogRecord): void {
  if (!exports(o)) return
  const w = waitingOf(o)
  w.logs.push(record)
  if (w.logs.length > held) w.logs.splice(0, w.logs.length - held)
  later(o, w)
}

/** Holds measures of the speed visitors saw to be sent out as metrics beside the traces, where the app sends them. */
export function vitalsSentOut(o: Opened, rows: VitalsRow[]): void {
  if (!exports(o)) return
  const w = waitingOf(o)
  w.vitals.push(...rows)
  if (w.vitals.length > held) w.vitals.splice(0, w.vitals.length - held)
  later(o, w)
}
