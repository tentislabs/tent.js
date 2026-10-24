import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { project, table, text } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import { advisedIn } from '../advised.ts'
import type { ChangeSink } from '../index.ts'
import { apartRoom } from '../index.ts'
import type { Running } from './apps.ts'
import { codeOf, nobody, running, send, workFolder } from './apps.ts'

type SinkChange = Parameters<ChangeSink['wrote']>[0]

/** The project of these tests, opened with its code in the test room. */
const apart = (t: TestContext): Promise<Running> =>
  running(t, { project: 'reviewRoom', engine: { makers: { room: apartRoom } } })

test('[52-7] in the test room a call whose thread ends while the engine waits for it at once is T0037 at once, as code that fills memory is, and not T0008 at the end of queryTime', async (t) => {
  const { app } = await apart(t)
  const began = performance.now()
  assert.equal(await codeOf(app.call('ends', {}, { as: nobody })), 'T0037')
  const took = performance.now() - began
  assert.ok(took < 2000, `answered after ${Math.round(took)} ms, where queryTime is 3 seconds`)
})

test('[22-20] a continuous copy of the builder that states records is handed the record of each write, as the archive of the engine is', async (t) => {
  const handed: SinkChange[] = []
  const sink: ChangeSink = {
    records: true,
    start: (n) => n,
    wrote: (change) => void handed.push(change),
  }
  const { app } = await running(t, { project: 'reviewRoom', engine: { makers: { changes: () => sink } } })
  await app.call('addNote', { what: 'one' }, { as: nobody })
  const wrote = handed.find((one) => one.rows?.some((row) => row.table === 'notes'))
  assert.ok(wrote, 'the write of the note was handed on')
  assert.ok(wrote.record !== undefined, 'with its record')
})

test('[12-1] token of more digits than valueSize is T0027, as every value word beyond valueSize is', async (t) => {
  const { app } = await running(t, { project: 'reviewRoom' })
  assert.equal(await codeOf(app.call('longToken', {}, { as: nobody })), 'T0027')
})

test('[45-10] the note T2029 of tent check names the file and the line of the table, as the note of the log does', (t) => {
  const folder = workFolder(t)
  const log = new DatabaseSync(join(folder, 'logs.db'))
  log.exec('CREATE TABLE "lines" ("data" TEXT)')
  const data = { code: 'T2029', query: 'open', table: 'orders', index: ['status'], place: 'tables/orders.ts', line: 3 }
  log.prepare('INSERT INTO "lines" ("data") VALUES (?)').run(JSON.stringify(data))
  log.close()
  const orders = table('orders', { columns: { status: text() }, access: { read: 'signedIn' } })
  const { description } = describe({ definitions: [{ value: project('shop', {}) }, { value: orders }] })
  const [note] = advisedIn(folder, description)
  assert.equal(note?.code, 'T2029')
  assert.deepEqual(note?.where, { file: 'tables/orders.ts', line: 3 })
})

test('[27-1] an agent whose access is a rule made with allow, as code, asks its rule: a rule that lets nobody in refuses a visitor', async (t) => {
  const { app, bundle, origin } = await running(t, { project: 'reviewAgent' })
  assert.equal(Reflect.get(Object(bundle.description.flows.gated.agent).access, 'rule'), 'allow')
  const answered = await send(app, `${origin}/_t/call/gated`, { input: { message: 'hello' } })
  assert.equal(answered.error.code, 'T0006', JSON.stringify(answered.body))
})

test('[52-7] in the test room an action that answers later and then never lets its thread go is T0008 at actionTime, and the app answers the next call', async (t) => {
  const { app } = await apart(t)
  assert.equal(await codeOf(app.call('spinsLater', {}, { as: nobody })), 'T0008')
  const began = performance.now()
  assert.equal(await codeOf(app.call('otherRead', {}, { as: nobody })), undefined)
  const took = performance.now() - began
  assert.ok(took < 4000, `answered after ${Math.round(took)} ms`)
})
