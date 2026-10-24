import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { running, send } from './apps.ts'

test('[15-6@7a] tent access prints each rule as it is written, a rule of a signed-in caller as `signedIn`, and no sign-up of the project', async (t) => {
  const run = await running(t, { project: 'signedUp' })
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/access`, {
    body: JSON.stringify({ args: {} }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  const access = Object(answered.body.value)
  // The table stands first: a project states nothing of who may sign up.
  assert.deepEqual(Object.keys(access), ['tables', 'functions'])
  const notes = access.tables.find((one: { table: string }) => one.table === 'notes')
  assert.deepEqual(notes, {
    table: 'notes',
    read: 'anyone',
    add: 'signedIn',
    change: 'nobody',
    remove: 'nobody',
  })
  const add = access.functions.find((one: { name: string }) => one.name === 'addNote')
  assert.equal(add.access, 'signedIn')
})
