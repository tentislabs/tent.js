import assert from 'node:assert/strict'
import { test } from 'node:test'
import { list, project, table, text, where } from '../index.ts'
import { measureAt } from '../description.ts'
import { definitionSource, describe } from '../internal.ts'

/** The code of what a call throws, or nothing where it throws no error with a code. */
function codeOf(call: () => unknown): unknown {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? Reflect.get(error, 'code') : undefined
  }
  return undefined
}

test('[34-2] code has no text of this kind: a table one of whose rules is code is T0013, the rule of a column among them', () => {
  const notes = table('notes', {
    columns: { body: text({ read: where(() => ({ body: 'x' })) }), tags: list(text()) },
    access: { read: 'signedIn' },
  })
  const { description } = describe({ definitions: [{ value: project('shop', {}) }, { value: notes }] })
  assert.match(JSON.stringify(description.tables.notes), /"export":"notes__body_access_read"/)
  assert.equal(
    codeOf(() => definitionSource(description, 'notes')),
    'T0013',
  )
})

test('[34-2] the shape of the description marks which numbers are a length of time and which a size: maxSize of a file and debounce of the work that fills a column', () => {
  assert.equal(measureAt('tables', '*', 'columns', '*', 'maxSize'), 'size')
  assert.equal(measureAt('tables', '*', 'columns', '*', 'by', 'debounce'), 'time')
  assert.equal(measureAt('routes', '*', 'limits', 'time'), 'time')
  assert.equal(measureAt('routes', '*', 'limits', 'size'), 'size')
})
