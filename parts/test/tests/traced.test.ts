import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import type { Heard, Remote } from './remotes.ts'
import { answerJson, remoteOf, untilWithin } from './remotes.ts'

// The values that a press and a call hand the app, and its secrets: none of them may stand in any span.
const word = 'the word of the press'
const shippingKey = 'the key of the shipping service'
const otlpToken = 'the token of the trace server'
const secrets = { SHIPPING_KEY: shippingKey, OTLP_TOKEN: otlpToken }

/** A span as the table of the log holds it, its facts read. */
interface SpanRow {
  trace: string
  span: string
  parent: string | null
  at: number
  ms: number
  name: string
  kind: string
  ok: number
  code: string | null
  facts: Record<string, unknown>
  machine: string
}

/** Every row of a table of a log, as it stands now. */
function rowsOf(logFile: string, table: string): Record<string, unknown>[] {
  const db = new DatabaseSync(logFile, { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } finally {
    db.close()
  }
}

/** The facts of a row that is a span itself, as its columns hold them. */
const factsOf = (row: Record<string, unknown>, kind: string): Record<string, unknown> =>
  kind === 'model'
    ? { model: row.name, reason: row.reason, ...Object(JSON.parse(String(row.units ?? '{}'))) }
    : kind === 'call'
      ? { caller: row.callerKind }
      : { status: row.status, ...(kind === 'fetch' ? { host: row.call } : {}) }

/**
 * The spans of a log, of one trace where it is named: the rows of `spans`, and the rows of the tables that are spans
 * themselves - a call, a call out, a model call - each written at its end, on the machine of the log.
 */
function spansOf(logFile: string, trace?: string): SpanRow[] {
  const own = (table: string, kind: (row: Record<string, unknown>) => string): SpanRow[] =>
    rowsOf(logFile, table)
      .filter((row) => typeof row.span === 'string' && row.span !== '')
      .map((row) => {
        const of = kind(row)
        return {
          trace: String(row.trace),
          span: String(row.span),
          parent: row.parent ? String(row.parent) : null,
          at: Number(row.at) - Number(row.ms ?? 0),
          ms: Number(row.ms ?? 0),
          name: of === 'service' ? `${String(row.service)}.${String(row.call)}` : String(row.name ?? row.call),
          kind: of,
          ok: row.ok === undefined ? (Number(row.status ?? 200) < 400 ? 1 : 0) : Number(row.ok),
          code: row.code ? String(row.code) : null,
          facts: factsOf(row, of),
          machine: '',
        }
      })
  return [
    ...rowsOf(logFile, 'spans').map((row) => ({ ...row, facts: Object(JSON.parse(String(row.facts))) }) as SpanRow),
    ...own('calls', () => 'call'),
    ...own('outgoing', (row) => (row.service ? 'service' : 'fetch')),
    ...own('modelCalls', () => 'model'),
  ].filter((row) => trace === undefined || row.trace === trace)
}

/** The one span of a list that is of a kind and a name: the test fails where there is none, or more than one. */
function one(spans: SpanRow[], kind: string, name?: string): SpanRow {
  const found = spans.filter((span) => span.kind === kind && (name === undefined || span.name === name))
  assert.equal(found.length, 1, `one span of the kind ${kind}${name ? ` named ${name}` : ''}: ${found.length}`)
  return found[0]
}

/** A stand-in of the shipping service, which quotes every order. */
const shippingOf = (t: TestContext): Promise<Remote> =>
  remoteOf(t, (_, response) => answerJson(response, 200, { price: 5 }))

/** Writes the share of the traces that the project keeps anew in a copy of it. */
function shared(folder: string, share: number): void {
  const file = join(folder, 'tent.ts')
  const text = readFileSync(file, 'utf8')
  assert.match(text, /share: 1,/)
  writeFileSync(file, text.replace('share: 1,', `share: ${share},`))
}

/** A call to the app's door as a page of it sends one, with the header of the trace that the test names. */
function calling(origin: string, name: string, input: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}/_t/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...headers },
    body: JSON.stringify({ input }),
  })
}

/** Every file under a folder, by its place. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const lies = join(folder, name)
    return statSync(lies).isDirectory() ? filesUnder(lies) : [lies]
  })
}

/** The log of the writer of a test app whose temporary place is the folder. */
function writerLog(temp: string): string {
  const file = filesUnder(temp).find((path) => /[\\/]data[\\/]logs\.db$/.test(path))
  assert.ok(file, 'the writer keeps a log')
  return file
}

/** The project of the shop as a test app, its shipping service at the stand-in, and its temporary place. */
async function tracedApp(t: TestContext, share = 1): Promise<{ app: TestApp; temp: string; shipping: Remote }> {
  const temp = tempOf(t)
  const shipping = await shippingOf(t)
  const folder = copyOf(t, 'traced')
  shared(folder, share)
  const file = join(folder, 'functions.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('http://127.0.0.1:1', shipping.origin))
  const app = await testApp({ folder, secrets, real: ['shipping'] })
  closing(t, () => app.close())
  return { app, temp, shipping }
}

/**
 * The shop built from a copy whose shipping service is at the stand-in and whose share is the one the test names,
 * opened in an engine of its own on a port of this computer: its app, the address it is reached by, and its log.
 */
async function served(
  t: TestContext,
  shipping: Remote,
  share = 1,
): Promise<{ app: App; origin: string; logFile: string }> {
  const folder = copyOf(t, 'traced')
  shared(folder, share)
  const file = join(folder, 'functions.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('http://127.0.0.1:1', shipping.origin))
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((found) => found.level === 'error').map((found) => `${found.code} ${found.message}`),
    [],
  )
  const dataFolder = join(folder, 'data')
  testSecrets(dataFolder, made.description, secrets)
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { app, origin: `http://localhost:${port}`, logFile: join(dataFolder, 'logs.db') }
}

test('[44-1] a press on a page is one trace: the press, the call, both writes with their tables and counts, the run and its steps, the model call with its units and the service call with its status, each under its parent', async (t) => {
  const shipping = await shippingOf(t)
  const { origin, logFile } = await served(t, shipping)
  for (const engine of browserEngines) {
    const said = `in ${engine}`
    const quoted = shipping.heard.length
    await inBrowser(engine, async (page) => {
      await page.goto(`${origin}/order`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByRole('button', { name: 'Place one' }).click()
      // The run that the press started has called the shipping service, and its trace is kept.
      await untilWithin('the run quoted the order', () => shipping.heard.length > quoted)
      await untilWithin('the service call is a span', () =>
        spansOf(logFile).some((span) => span.kind === 'service' && span.facts.status === 200 && span.at >= 0),
      )
    })
    const placed = spansOf(logFile).filter((span) => span.kind === 'call' && span.name === 'placeOrder')
    const trace = placed.at(-1)?.trace
    assert.ok(trace, said)
    await untilWithin('the run of the press ended', () =>
      spansOf(logFile, trace).some((span) => span.kind === 'run' && span.name === 'fulfil'),
    )
    const spans = spansOf(logFile, trace)
    // The press is the span of the page, at the top; the door's handling of the request stands under it.
    const press = one(spans, 'page')
    assert.equal(press.parent, null, said)
    const door = one(spans, 'door')
    assert.equal(door.parent, press.span, said)
    const call = one(spans, 'call', 'placeOrder')
    assert.equal(call.parent, door.span, said)
    // Both writes, with their tables and counts: the order, and its two lines.
    const writes = spans.filter((span) => span.kind === 'write')
    assert.deepEqual(
      writes.map((span) => [span.parent, span.facts.table, span.facts.rows]).sort(),
      [
        [call.span, 'lines', 1],
        [call.span, 'lines', 1],
        [call.span, 'orders', 1],
      ].sort(),
      said,
    )
    // The run that the change started, and its steps under it.
    const run = one(spans, 'run', 'fulfil')
    assert.equal(run.parent, call.span, said)
    const write = one(spans, 'step', 'write')
    const quote = one(spans, 'step', 'quote')
    assert.deepEqual([write.parent, quote.parent], [run.span, run.span], said)
    // The model call with its model, its units and its reason; the service call with its host and its status.
    const model = one(spans, 'model')
    assert.equal(model.parent, write.span, said)
    assert.deepEqual([model.facts.model, model.facts.tokensIn, model.facts.tokensOut], ['writer', 12, 3], said)
    assert.equal(typeof model.facts.reason, 'string', said)
    const service = one(spans, 'service', 'shipping.quote')
    assert.equal(service.parent, quote.span, said)
    assert.equal(service.facts.status, 200, said)
    assert.ok(
      spans.every((span) => span.trace === trace && span.ok === 1),
      said,
    )
  }
})

test('[44-1] a call that fails answers its trace beside its ref, and a trace with an error is kept whole at a share of 0 while one that worked is not kept', async (t) => {
  const shipping = await shippingOf(t)
  const { app, origin, logFile } = await served(t, shipping, 0)
  const broken = await app.request(calling(origin, 'breakOrder', { title: 'broken' }))
  assert.equal(broken.status, 500)
  const told = Object(await broken.json()).error
  assert.match(String(told.ref), /^[0-9a-z]{8}$/)
  assert.match(String(told.trace), /^[0-9a-f]{32}$/)
  // What was kept is written together, a moment after it ended.
  await untilWithin('the trace with the error is written', () =>
    spansOf(logFile, told.trace).some((span) => span.kind === 'door'),
  )
  const spans = spansOf(logFile, told.trace)
  // Whole: the door, the call that failed with its code, and the write it made before it broke.
  assert.equal(one(spans, 'door').ok, 0)
  const call = one(spans, 'call', 'breakOrder')
  assert.deepEqual([call.ok, call.code], [0, 'T0009'])
  assert.deepEqual([one(spans, 'write').facts.table, one(spans, 'write').parent], ['orders', call.span])
  // The error of the log names the trace too.
  const error = rowsOf(logFile, 'errors').find((row) => row.ref === told.ref)
  assert.equal(error?.trace, told.trace)
  // A call that worked is not among the share of 0, and costs no row of spans: once a failure after it is written,
  // spans holds the two failures alone. Its call is a row of calls, as every call is.
  const worked = await app.request(
    calling(origin, 'countOrders', {}, { traceparent: `00-${'9'.repeat(32)}-${'8'.repeat(16)}-01` }),
  )
  assert.equal(worked.status, 200)
  const again = Object(await (await app.request(calling(origin, 'breakOrder', { title: 'again' }))).json()).error
  await untilWithin('the second failure is written', () =>
    spansOf(logFile, again.trace).some((span) => span.kind === 'door'),
  )
  const kept = rowsOf(logFile, 'spans')
  assert.deepEqual(
    kept.filter((row) => row.trace === '9'.repeat(32)),
    [],
  )
  assert.deepEqual(new Set(kept.map((row) => row.trace)), new Set([told.trace, again.trace]))
})

test('[44-1] no span holds a value of the input, a row, a secret, a cookie or a header beyond the standard ones', async (t) => {
  const { app, temp, shipping } = await tracedApp(t)
  const trace = 'a'.repeat(31) + '1'
  const asked = calling(
    'http://localhost',
    'placeOrder',
    { title: 'the title of the row', note: word },
    {
      traceparent: `00-${trace}-${'b'.repeat(15)}1-01`,
      cookie: 't_visitor=the cookie of the visitor',
      'x-word': 'the word of a header',
      authorization: 'Bearer the token of the caller',
    },
  )
  assert.equal((await app.request(asked)).status, 200)
  await untilWithin('the run quoted the order', () => shipping.heard.length > 0)
  const logFile = writerLog(temp)
  await untilWithin('the service call is a span', () => spansOf(logFile, trace).some((span) => span.kind === 'service'))
  const kept = JSON.stringify(rowsOf(logFile, 'spans'))
  for (const value of [
    word,
    'the title of the row',
    shippingKey,
    otlpToken,
    'the cookie of the visitor',
    'the word of a header',
    'the token of the caller',
    'A note',
    '"price"',
  ])
    assert.equal(kept.includes(value), false, value)
  // A span holds names, counts, sizes, times and codes alone.
  for (const span of spansOf(logFile))
    for (const [name, fact] of Object.entries(span.facts))
      assert.ok(
        ['string', 'number', 'boolean'].includes(typeof fact) || Array.isArray(fact),
        `${span.kind} ${span.name}: ${name}`,
      )
})

test('[44-1] across a reader and a worker the spans arrive at the writer under one trace', async (t) => {
  const { app, temp } = await tracedApp(t)
  const reader = await app.reader()
  closing(t, () => reader.close())
  // A change asked of the reader is handed to the writer, which carries it out under the trace of the reader.
  const trace = 'c'.repeat(31) + '2'
  const asked = calling(
    'http://localhost',
    'placeOrder',
    { title: 'by the reader', note: 'read' },
    {
      traceparent: `00-${trace}-${'d'.repeat(15)}2-01`,
    },
  )
  assert.equal((await reader.request(asked)).status, 200)
  const logFile = writerLog(temp)
  await untilWithin(
    'the spans of the reader arrived at the writer',
    () => {
      const machines = new Set(spansOf(logFile, trace).flatMap((span) => (span.machine ? [span.machine] : [])))
      return machines.size >= 2 && spansOf(logFile, trace).some((span) => span.kind === 'call')
    },
    30_000,
  )
  const spans = spansOf(logFile, trace)
  const ids = new Set(app.machines().map((machine) => String(Reflect.get(Object(machine), 'id'))))
  // A row of a table that is a span itself stands in the log of the machine that made it.
  assert.ok(
    spans.every((span) => span.machine === '' || ids.has(span.machine)),
    'every span names a machine of the app',
  )
  const readerDoor = spans.find((span) => span.kind === 'door' && span.parent === 'd'.repeat(15) + '2')
  assert.ok(readerDoor, 'the reader made the first span of the request')
  const call = one(spans, 'call', 'placeOrder')
  assert.notEqual(call.machine, readerDoor.machine)

  // A task on a worker makes its spans there, and they arrive at the writer under the trace of the call.
  const worker = await app.worker({ kinds: ['heavy'] })
  closing(t, () => worker.close({ now: true }).catch(() => undefined))
  const worked = 'e'.repeat(31) + '3'
  const heavy = calling('http://localhost', 'heavyCount', {}, { traceparent: `00-${worked}-${'f'.repeat(15)}3-01` })
  assert.equal((await app.request(heavy)).status, 200)
  const workerId = worker.at().id
  await untilWithin(
    'the spans of the worker arrived at the writer',
    () => spansOf(logFile, worked).some((span) => span.machine === workerId),
    30_000,
  )
  const task = spansOf(logFile, worked).find((span) => span.machine === workerId && span.kind === 'task')
  assert.ok(task, 'the task is a span of the worker')
  assert.ok(spansOf(logFile, worked).some((span) => span.span === task.parent))
})

/** A stand-in of the server that takes traces, which takes everything it is sent. */
const traceServerOf = (t: TestContext): Promise<Remote> => remoteOf(t, (_, response) => answerJson(response, 200, {}))

/** What a stand-in was sent to one path, each body read as JSON. */
const bodiesTo = (remote: Remote, path: string): unknown[] =>
  remote.heard.filter((heard: Heard) => heard.path === path).map((heard: Heard) => JSON.parse(heard.body.toString()))

test("[44-1] the OTLP export sends the spans in the standard's form to a server of the test", async (t) => {
  const shipping = await shippingOf(t)
  const server = await traceServerOf(t)
  const { app, origin, logFile } = await served(t, shipping)
  await app.values({ kind: 'setting', name: 'otlpUrl', value: server.origin })
  const placed = await app.request(calling(origin, 'placeOrder', { title: 'sent out', note: word }))
  assert.equal(placed.status, 200)
  await untilWithin('the spans were sent out', () =>
    bodiesTo(server, '/v1/traces').some((body) => JSON.stringify(body).includes('"name":"shipping.quote"')),
  )
  const sent = bodiesTo(server, '/v1/traces').flatMap((body) =>
    Object(body).resourceSpans.flatMap((resource: { scopeSpans: { spans: Record<string, unknown>[] }[] }) =>
      resource.scopeSpans.flatMap((scope) => scope.spans),
    ),
  )
  const kept = spansOf(logFile)
  for (const span of sent) {
    assert.match(String(span.traceId), /^[0-9a-f]{32}$/)
    assert.match(String(span.spanId), /^[0-9a-f]{16}$/)
    assert.match(String(span.startTimeUnixNano), /^\d+$/)
    assert.ok(BigInt(String(span.endTimeUnixNano)) >= BigInt(String(span.startTimeUnixNano)))
    assert.ok([1, 2, 3].includes(Number(span.kind)))
    assert.ok([1, 2].includes(Number(Object(span.status).code)))
    assert.ok(Array.isArray(span.attributes))
    assert.ok(kept.some((row) => row.span === span.spanId && row.trace === span.traceId))
  }
  // The resource names the app, and every request carries the header of the project, its secret as it stands.
  const [first] = bodiesTo(server, '/v1/traces')
  assert.match(JSON.stringify(Object(first).resourceSpans[0].resource), /"service\.name"/)
  assert.ok(server.heard.every((heard) => heard.method === 'POST' && heard.headers.authorization === otlpToken))
  assert.ok(server.heard.every((heard) => heard.headers['content-type'] === 'application/json'))
})

test('[45-14] lines and errors of the log reach the server of the test beside the traces, with their trace ids and with no secret', async (t) => {
  const shipping = await shippingOf(t)
  const server = await traceServerOf(t)
  const { app, origin } = await served(t, shipping)
  await app.values({ kind: 'setting', name: 'otlpUrl', value: server.origin })
  assert.equal((await app.request(calling(origin, 'placeOrder', { title: 'logged', note: word }))).status, 200)
  const broken = await app.request(calling(origin, 'breakOrder', { title: 'broken' }))
  const failed = Object(await broken.json()).error
  await untilWithin('the line and the error were sent out', () => {
    const sent = JSON.stringify(bodiesTo(server, '/v1/logs'))
    return sent.includes('quoted with the key') && sent.includes(failed.ref)
  })
  const records = bodiesTo(server, '/v1/logs').flatMap((body) =>
    Object(body).resourceLogs.flatMap((resource: { scopeLogs: { logRecords: Record<string, unknown>[] }[] }) =>
      resource.scopeLogs.flatMap((scope) => scope.logRecords),
    ),
  )
  const line = records.find((record) => JSON.stringify(record.body).includes('quoted with the key'))
  assert.ok(line)
  assert.match(String(line.traceId), /^[0-9a-f]{32}$/)
  assert.match(String(line.spanId), /^[0-9a-f]{16}$/)
  assert.equal(JSON.stringify(line.body).includes(shippingKey), false)
  const error = records.find((record) => JSON.stringify(record.attributes).includes(failed.ref))
  assert.ok(error)
  assert.equal(error.traceId, failed.trace)
  assert.equal(Number(error.severityNumber), 17)
  // Nothing that was sent out holds a secret.
  for (const heard of server.heard)
    for (const secret of [shippingKey]) assert.equal(heard.body.toString().includes(secret), false)
})
