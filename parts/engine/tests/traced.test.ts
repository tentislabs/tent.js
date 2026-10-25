import assert from 'node:assert/strict'
import test from 'node:test'
import { held, measure } from '../../../rig/budgets.ts'
import { openedOf } from '../app.ts'
import { spanned } from '../trace/span.ts'
import { logColumns, logRows, running } from './apps.ts'

/** A call of a query that every visitor may make, as a program sends it to the door. */
const asked = (origin: string): Request =>
  new Request(`${origin}/_t/call/publicTags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: {} }),
  })

test('[16-4@10d] the table spans of the log holds exactly its columns, and every other table of the log carries trace and span', async (t) => {
  const { dataFolder } = await running(t)
  assert.deepEqual(logColumns(dataFolder, 'spans'), [
    'trace',
    'span',
    'parent',
    'at',
    'ms',
    'name',
    'kind',
    'ok',
    'code',
    'facts',
    'machine',
  ])
  // A row that is a span itself names its parent too.
  for (const table of ['errors', 'denied', 'lines'])
    assert.deepEqual(logColumns(dataFolder, table).slice(-2), ['trace', 'span'], table)
  for (const table of ['calls', 'slow', 'outgoing', 'modelCalls'])
    assert.deepEqual(logColumns(dataFolder, table).slice(-3), ['trace', 'span', 'parent'], table)
})

test('[44-1] each row of the log that a call writes names the trace and the span it was written in, and the row of the call is its span', async (t) => {
  const { app, dataFolder, origin } = await running(t)
  const trace = '1'.repeat(31) + 'a'
  const request = asked(origin)
  request.headers.set('traceparent', `00-${trace}-${'2'.repeat(15)}b-01`)
  assert.equal((await app.request(request)).status, 200)
  const call = logRows(dataFolder, 'calls').find((row) => row.name === 'publicTags')
  assert.equal(call?.trace, trace)
  // The row of the call is its span: its parent, the door's handling of the request, is kept in spans a moment later.
  assert.match(String(call?.span), /^[0-9a-f]{16}$/)
  const ends = performance.now() + 10_000
  const kept = () => logRows(dataFolder, 'spans').filter((row) => row.trace === trace)
  while (!kept().some((span) => span.kind === 'door')) {
    assert.ok(performance.now() < ends, 'the span of the door is written')
    await new Promise((done) => setTimeout(done, 10))
  }
  const door = kept().find((span) => span.kind === 'door')
  assert.equal(call?.parent, door?.span)
  assert.ok(!kept().some((span) => span.kind === 'call'), 'a call is no row of spans')
})

test('[44-1] a call with tracing on costs at most 2% more at the middle', async (t) => {
  // The share that live data keeps where the project states none: what is not kept is dropped and costs no write.
  const { app, origin } = await running(t, {
    change: (description) => {
      description.project.trace = { share: 0.1 }
    },
  })
  const o = openedOf(app)
  assert.ok(o)
  const calls = 300
  for (let k = 0; k < 50; k++) await app.request(asked(origin))
  // The time of so many calls through the door, each of which opens the span of the door, of the call and of its read.
  const called = await measure(
    'trace.calls',
    async () => {
      for (let k = 0; k < calls; k++) await app.request(asked(origin))
    },
    { warm: true },
  )
  // The time of what tracing adds to as many calls: the same three spans opened and closed and kept by the share,
  // each call's in the write that follows it, as a call yields to the program before its next.
  const traced = await measure(
    'trace.spans',
    async () => {
      for (let k = 0; k < calls; k++) {
        await spanned(o, { name: 'call', kind: 'door' }, () =>
          spanned(o, { name: 'publicTags', kind: 'call' }, () =>
            spanned(o, { name: 'tags', kind: 'query', facts: { table: 'tags', rows: 0 } }, () => Promise.resolve()),
          ),
        )
        await new Promise((done) => setImmediate(done))
      }
    },
    { warm: true },
  )
  // The turns alone, which the spans were measured with and which are no work of tracing.
  const turns = await measure(
    'trace.turns',
    async () => {
      for (let k = 0; k < calls; k++) await new Promise((done) => setImmediate(done))
    },
    { warm: true },
  )
  const added = Math.max(0, traced - turns) / called
  // Its bar of 2% stands in budgets.json, where the owner may mark it owed.
  held('trace.cost', Math.round(10_000 * added) / 100, 'percent')
})
