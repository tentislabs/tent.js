import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { calledByBrowser, wireCodeOf, holding, stormed, turn } from './storms.ts'

// The tables of the log whose rows are spans: `spans`, and the tables whose rows are spans themselves.
const spanTables = ['spans', 'calls', 'outgoing', 'modelCalls', 'slow']

/** Every row of a table of the log, as it stands now, or none where the log or the table is not there. */
function rowsOf(dataFolder: string, table: string): Record<string, unknown>[] {
  const file = join(dataFolder, 'logs.db')
  if (!existsSync(file)) return []
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
  } catch {
    return []
  } finally {
    db.close()
  }
}

/** The app of the held calls, which anyone may add a note to, keeping the traces of the share it is handed. */
async function noted(t: TestContext, share: number): Promise<{ app: TestApp; dataFolder: string }> {
  return stormed(t, 'heldCalls', {
    change: [['tent.ts', "title: 'Shop',", `title: 'Shop',\n  trace: { share: ${share} },`]],
  })
}

/** Waits until the rows that the keeping of spans holds back a moment are written. */
const written = (): Promise<void> => turn(600)

// A stranger: an address of no proxy and of no machine of the app.
const stranger = '203.0.113.7'

test('[44-10.1] a stranger who sends a traceparent of another trace begins a new trace, and their header is a fact of its first span', async (t) => {
  const { app, dataFolder } = await noted(t, 1)
  const theirs = `00-${'ab'.repeat(16)}-${'cd'.repeat(8)}-01`
  const told = await calledByBrowser(
    app,
    'addNote',
    { words: 'one' },
    { from: stranger, headers: { traceparent: theirs } },
  )
  assert.equal(wireCodeOf(told.wire), 'ok')
  await written()
  const [call] = rowsOf(dataFolder, 'calls').filter((row) => row.name === 'addNote')
  assert.ok(call, 'the call is a row of the log')
  assert.notEqual(call.trace, 'ab'.repeat(16), 'the call is no span of the trace that the stranger named')
  assert.match(String(call.trace), /^[0-9a-f]{32}$/)
  const spans = rowsOf(dataFolder, 'spans').filter((row) => row.trace === call.trace)
  const first = spans.find((row) => row.parent === null || row.parent === '')
  assert.ok(first, `the trace has a first span: ${JSON.stringify(spans)}`)
  assert.equal(Object(JSON.parse(String(first.facts))).traceparent, theirs)
  // No row of the log stands in the trace the stranger named.
  for (const table of spanTables)
    assert.deepEqual(
      rowsOf(dataFolder, table).filter((row) => row.trace === 'ab'.repeat(16)),
      [],
      table,
    )
})

test('[44-10.1] a stranger who sends a traceparent that says it is sampled sets nothing of what is kept', async (t) => {
  // At a share of one in ten thousand a trace id that ends in zeros is among the share that is kept, and the flag of
  // the standard says it is sampled: were the header taken, the trace would be kept.
  const { app, dataFolder } = await noted(t, 0.0001)
  const named = `${'1'.repeat(24)}00000000`
  const sampled = `00-${named}-${'1'.repeat(16)}-01`
  const told = await calledByBrowser(
    app,
    'addNote',
    { words: 'two' },
    { from: stranger, headers: { traceparent: sampled } },
  )
  assert.equal(wireCodeOf(told.wire), 'ok')
  await written()
  // A first call of the app may be slow, and kept so: what it keeps is a trace of its own, never the one named.
  for (const table of spanTables)
    assert.deepEqual(
      rowsOf(dataFolder, table).filter((row) => row.trace === named),
      [],
      `${table} keeps nothing of the trace the stranger named`,
    )
})

test('[44-10.2] no span holds what a call was given: its input, the row it wrote, a cookie, a token or a header', async (t) => {
  const { app, dataFolder } = await noted(t, 1)
  const marks = {
    input: 'the-words-of-the-input-7f3a',
    cookie: 'a-cookie-of-the-caller-91bd',
    token: 'a-token-of-the-caller-c04e',
    header: 'a-header-of-the-caller-55aa',
  }
  const told = await calledByBrowser(
    app,
    'addNote',
    { words: marks.input },
    {
      cookie: `tent_session.shop=${marks.cookie}; other=${marks.cookie}`,
      headers: { authorization: `Bearer ${marks.token}`, 'x-mine': marks.header, 'user-agent': marks.header },
    },
  )
  assert.equal(wireCodeOf(told.wire), 'ok')
  // The row was written, with the words of the input.
  assert.ok((await app.rows('notes')).some((row) => row.words === marks.input))
  // A read that answers the row is a span too.
  await calledByBrowser(app, 'allNotes', {}, { read: true, cookie: `other=${marks.cookie}` })
  await written()
  const spans = spanTables.flatMap((table) => rowsOf(dataFolder, table))
  assert.ok(spans.length > 2, 'the calls are spans')
  for (const [what, mark] of Object.entries(marks))
    assert.deepEqual(
      spans.filter((row) => JSON.stringify(row).includes(mark)),
      [],
      `no span holds the ${what}`,
    )
})

test('[44-10.3] the tree of a trace is answered by no address of the engine, to a stranger or to the machine itself', async (t) => {
  const { app, dataFolder } = await noted(t, 1)
  await calledByBrowser(app, 'addNote', { words: 'three' })
  await written()
  const [call] = rowsOf(dataFolder, 'calls').filter((row) => row.name === 'addNote')
  const trace = String(call?.trace)
  assert.match(trace, /^[0-9a-f]{32}$/)
  const asked = [
    ['GET', `/_t/trace/${trace}`],
    ['GET', `/_t/traces/${trace}`],
    ['GET', `/_t/logs?trace=${trace}`],
    ['GET', `/_t/logs/trace/${trace}`],
    ['GET', `/_t/cli?trace=${trace}`],
    ['POST', '/_t/admin/logs'],
    ['POST', `/_t/read/logs`],
  ] as const
  for (const from of [stranger, '127.0.0.1'])
    for (const [method, path] of asked) {
      const answer = await app.request(
        new Request(`http://localhost${path}`, {
          method,
          headers: { 'content-type': 'application/json', origin: 'http://localhost' },
          ...(method === 'POST' ? { body: JSON.stringify({ args: { trace } }) } : {}),
        }),
        { from },
      )
      const text = await answer.text()
      assert.equal(text.includes(String(call?.span)), false, `${method} ${path} from ${from} answers no span: ${text}`)
      assert.equal(/"(spans|tree)"/.test(text), false, `${method} ${path} from ${from} answers no tree`)
    }
})

test('[44-10.8] the id of another visitor call, sent again, reads nothing of their answer: the call runs as the sender own', async (t) => {
  const { app } = await noted(t, 1)
  const ada = `tent_visitor.shop=${'a'.repeat(32)}`
  const bob = `tent_visitor.shop=${'b'.repeat(32)}`
  const once = { 'idempotency-key': 'the-id-that-ada-made-0001' }
  const first = await calledByBrowser(app, 'addNote', { words: 'ada' }, { cookie: ada, headers: once })
  assert.equal(wireCodeOf(first.wire), 'ok')
  // Bob sends Ada's id with another call: no T0002 tells him that the id was used, and it runs as his own.
  const probe = await calledByBrowser(app, 'addNote', { words: 'bob' }, { cookie: bob, headers: once })
  assert.equal(wireCodeOf(probe.wire), 'ok', 'another visitor learns nothing of an id that is not theirs')
  // Carol sends it with Ada's very call: it is unknown to her, and runs as her own.
  const carol = `tent_visitor.shop=${'d'.repeat(32)}`
  const theirs = await calledByBrowser(app, 'addNote', { words: 'ada' }, { cookie: carol, headers: once })
  assert.equal(wireCodeOf(theirs.wire), 'ok')
  assert.equal((await app.rows('notes')).filter((row) => row.words === 'ada').length, 2)
  // A visitor with no cookie, from another address, is another caller too.
  const nobody = await calledByBrowser(app, 'addNote', { words: 'ada' }, { from: stranger, headers: once })
  assert.equal(wireCodeOf(nobody.wire), 'ok')
  assert.equal((await app.rows('notes')).filter((row) => row.words === 'ada').length, 3)
})

test('[44-10.8] the ids of calls are kept by caller with no visitor id written as it is', async (t) => {
  const { app, dataFolder } = await noted(t, 1)
  const visitor = 'v'.repeat(16) + 'w'.repeat(16)
  const told = await calledByBrowser(
    app,
    'addNote',
    { words: 'kept' },
    { cookie: `tent_visitor.shop=${visitor}`, headers: { 'idempotency-key': 'an-id-of-a-visitor-0001' } },
  )
  assert.equal(wireCodeOf(told.wire), 'ok')
  await written()
  // 22-callers-files-secrets, section 1: a visitor id is written nowhere as it is, in a table or in the log.
  assert.deepEqual(holding(dataFolder, visitor), [])
})

test('[44-10.9] an id reused on purpose answers the caller their own answer alone, and runs the change once', async (t) => {
  const { app } = await noted(t, 1)
  const ada = `tent_visitor.shop=${'c'.repeat(32)}`
  const once = { 'idempotency-key': 'reused-on-purpose-0001' }
  const first = await calledByBrowser(app, 'addNote', { words: 'once' }, { cookie: ada, headers: once })
  for (let n = 0; n < 5; n++) {
    const again = await calledByBrowser(app, 'addNote', { words: 'once' }, { cookie: ada, headers: once })
    assert.deepEqual(again.wire.value, first.wire.value)
  }
  assert.equal((await app.rows('notes')).filter((row) => row.words === 'once').length, 1)
  // The same id with another call answers nothing kept: it is refused, and runs nothing.
  const other = await calledByBrowser(app, 'addNote', { words: 'twice' }, { cookie: ada, headers: once })
  assert.equal(wireCodeOf(other.wire), 'T0002')
  assert.equal(other.wire.value, undefined)
  assert.equal((await app.rows('notes')).filter((row) => row.words === 'twice').length, 0)
  // A read keeps no id: it is asked again each time.
  const read = await calledByBrowser(app, 'allNotes', {}, { read: true, cookie: ada, headers: once })
  assert.equal(wireCodeOf(read.wire), 'ok')
  assert.ok(Array.isArray(read.wire.value))
})

/** Sends measures to `/_t/vitals` as a page would, from an origin and an address, and answers the status. */
async function measured(
  app: TestApp,
  body: object,
  o: { origin: string; from: string; cookie?: string },
): Promise<number> {
  const answer = await app.request(
    new Request('http://localhost/_t/vitals', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: o.origin, ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { from: o.from },
  )
  await answer.arrayBuffer()
  return answer.status
}

test('[44-10.10] floods and lies to /_t/vitals are dropped and answered alike, and the table holds nothing that names a visitor', async (t) => {
  const { app, dataFolder } = await noted(t, 1)
  const version = String(app.versions().find((one) => one.running)?.id)
  const visitor = 'e'.repeat(16) + 'f'.repeat(16)
  const own = { origin: 'http://localhost', from: stranger, cookie: `tent_visitor.shop=${visitor}` }
  const one = (value: number, screen = 'notesScreen') => ({
    version,
    width: 1400,
    connection: '4g',
    measures: [{ screen, measure: 'ttfb', value }],
  })
  // Out of range, of a screen the app has not, of a version it holds not, and from another origin.
  const lies: [object, typeof own][] = [
    [one(-5), own],
    [one(10_000_000), own],
    [one(50, 'noSuchScreen'), own],
    [{ ...one(50), version: 'made-up' }, own],
    [one(50), { ...own, origin: 'https://elsewhere.example' }],
  ]
  // The burst stands in one minute of the count.
  while (new Date().getSeconds() > 40) await turn(500)
  for (const [body, from] of lies) assert.equal(await measured(app, body, from), 204)
  await written()
  assert.deepEqual(rowsOf(dataFolder, 'vitals'), [])
  // Sixty from one address are taken in a minute, the lies of the app's own origin among them, and the rest are
  // dropped alike.
  for (let n = 0; n < 61; n++) assert.equal(await measured(app, one(50), own), 204)
  await written()
  const counted = lies.filter(([, from]) => from.origin === own.origin).length
  assert.equal(rowsOf(dataFolder, 'vitals').length, 60 - counted)
  // Nothing in a row names whose visit it was: no visitor id, no address, no cookie.
  for (const row of rowsOf(dataFolder, 'vitals')) {
    const text = JSON.stringify(row)
    for (const mark of [visitor, stranger, 'tent_visitor']) assert.equal(text.includes(mark), false, mark)
  }
  assert.deepEqual(holding(dataFolder, visitor), [])
})
