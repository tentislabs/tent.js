import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codeOf, nobody, running } from './apps.ts'

test('[16-2@4] T4101: a where rule of a table that is code and reads the clock fails each query that reads the table, one written with rows as one that is code; a change is held to none of it, and the swap is taken back', async (t) => {
  const { app, bundle } = await running(t, { teams: true })
  // The rule is kept as code. The first query is a plan, and the second is code.
  const { functions, tables } = bundle.description
  assert.equal(typeof Object(Object(tables.stamps.access).read).export, 'string')
  assert.deepEqual(
    ['stampsByRows', 'stampsByRun'].map((name) => (functions[name].plan ? 'plan' : 'code')),
    ['plan', 'code'],
  )
  assert.equal(await codeOf(app.call('addStamp', { label: 'one' }, { as: nobody })), undefined)
  for (const name of ['stampsByRows', 'stampsByRun'])
    assert.equal(await codeOf(app.call(name, {}, { as: nobody })), 'T4101', name)
  assert.equal(typeof Date.now(), 'number')
  assert.equal(await codeOf(app.call('addStamp', { label: 'two' }, { as: nobody })), undefined)
})
