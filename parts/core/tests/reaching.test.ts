import assert from 'node:assert/strict'
import { test } from 'node:test'
import { change, input, project, table, text } from '../index.ts'
import { describe, tablesOf } from '../internal.ts'

test('[27-14] the tables that a plain change reaches, which the three-mark check reads, are taken from the writes it stores', () => {
  const notes = table('notes', { columns: { body: text() }, access: { read: 'signedIn', add: 'signedIn' } })
  const note = change('note', {
    access: 'signedIn',
    input: { body: text() },
    set: notes.add({ body: input('body') }),
  })
  const { description } = describe({ definitions: [project('shop', {}), notes, note].map((value) => ({ value })) })
  const record = description.functions.note
  assert.ok(Array.isArray(record.writes) && record.writes.length === 1, JSON.stringify(record))
  assert.deepEqual(tablesOf({ writes: record.writes }), ['notes'])
})
