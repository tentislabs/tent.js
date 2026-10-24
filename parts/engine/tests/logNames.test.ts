import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codeOf, logRows, nobody, running, send } from './apps.ts'

test('[16-4@4] a name of a call that was sent and is no name of the app is written into the log as its first 64 characters, through the door and from a program, and the name of a function is written whole', async (t) => {
  const run = await running(t)
  const long = `${'a'.repeat(60)}${'b'.repeat(4000)}`
  // Through the door: nothing of that name is there.
  const asked = await send(run.app, `${run.origin}/_t/call/${long}`)
  assert.equal(asked.error.code, 'T0001')
  // From a program that holds the app.
  assert.equal(await codeOf(run.app.call(long, {}, { as: nobody })), 'T0001')
  assert.equal((await send(run.app, `${run.origin}/_t/call/publicTags`)).status, 200)
  const names = logRows(run.dataFolder, 'calls').map((row) => String(row.name))
  assert.deepEqual(names, [long.slice(0, 64), long.slice(0, 64), 'publicTags'])
  // What the log holds of the errors names nothing longer either.
  for (const row of logRows(run.dataFolder, 'errors')) assert.ok(String(row.name).length <= 64, String(row.name))
})
