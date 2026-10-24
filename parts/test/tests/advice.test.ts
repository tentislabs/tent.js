import assert from 'node:assert/strict'
import test from 'node:test'
import { appIn, logLines } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[45-10] a slow query that reads a whole table gives a note T2029 with the exact index line, in the log with the file of the table and in the facts that `tent check` is handed, once a version; one that reads by an index gives none', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'advised'))
  const values = Array.from({ length: 200 }, (_, i) => ({
    status: i % 3 ? 'paid' : 'open',
    placedAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
    total: i,
  }))
  await app.write(
    values.map((one) => ({ add: 'orders', values: one })),
    system,
  )
  await app.write([{ add: 'customers', values: { name: 'Ada' } }], system)
  await app.call('firstOpen', {}, system)
  await app.call('firstOpen', {}, system)
  await app.call('customerNamed', { name: 'Ada' }, system)
  // The log is written a little after the call.
  let notes = logLines(dataFolder, 'reads the whole table')
  for (let tries = 0; tries < 50 && !notes.length; tries++) {
    await new Promise((done) => setTimeout(done, 100))
    notes = logLines(dataFolder, 'reads the whole table')
  }
  assert.equal(notes.length, 1, 'one note, once a version, and none for a read by an index')
  const [note] = notes
  assert.match(note.message, /firstOpen reads the whole table orders/)
  assert.match(note.message, /indexes: \[\['status', 'placedAt'\]\]/)
  assert.deepEqual(note.data.index, ['status', 'placedAt'])
  assert.equal(note.data.table, 'orders')
  assert.equal(note.data.place, 'tables/tables.ts')
  assert.equal(note.data.code, 'T2029')
  // The facts that `tent check` is handed hold the note, which it writes at the line of the table.
  const advised = (await app.facts()).tableFindings.filter((one) => one.code === 'T2029')
  assert.equal(advised.length, 1)
  assert.equal(advised[0].level, 'note')
  assert.match(advised[0].message, /the whole table `orders`/)
  assert.match(advised[0].message, /indexes: \[\['status', 'placedAt'\]\]/)
})
