import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TentError } from '../../core/index.ts'
import { crossed, revived } from '../rooms/crossing.ts'
import { logRows, running, send } from './apps.ts'

test('[20-8] a failure that crosses between two threads keeps what it carries: its code, its words, its fix, where it was raised, its fields, its place, what a service answered, and what it rests on', () => {
  const rests = new TentError('T0013', 'What it rests on.', { where: { file: 'tables.ts', line: 3 } })
  rests.cause = new RangeError('The first cause of all.')
  const failed = new TentError('not-there', 'The shelf holds no such thing.', {
    fix: 'Name a thing that the shelf holds.',
    where: { file: 'functions.ts', line: 7, definition: 'heavyFails' },
    fields: { thing: 'missing' },
    place: { name: 'things', nth: 2 },
    service: { status: 502, body: { said: 'no' } },
  })
  failed.cause = rests
  // What crosses is copied as a message between two threads is.
  const back = revived(structuredClone(crossed(failed, 'ref12345')))
  assert.ok(back instanceof TentError)
  const { code, message, fix, where, fields, place, service } = back
  assert.deepEqual(
    { code, message, fix, where, fields, place, service },
    {
      code: failed.code,
      message: failed.message,
      fix: failed.fix,
      where: failed.where,
      fields: failed.fields,
      place: failed.place,
      service: failed.service,
    },
  )
  assert.equal(back.stack, failed.stack)
  const cause: unknown = back.cause
  assert.ok(cause instanceof TentError)
  assert.deepEqual([cause.code, cause.message, cause.where], ['T0013', 'What it rests on.', rests.where])
  assert.ok(cause.cause instanceof Error)
  assert.equal(cause.cause.message, 'The first cause of all.')
  // An error that is none of ours crosses as one, with what it rests on.
  const plain = new Error('The code of the app failed.', { cause: 'a text' })
  const other = revived(structuredClone(crossed(plain)))
  assert.deepEqual([other instanceof TentError, other.message, other.cause], [false, plain.message, 'a text'])
})

test('[20-8] a query answers the same failure whether it is carried out on a query thread or on the main thread: the code, the words, the fix, where, and the fields', async (t) => {
  const run = await running(t)
  const asked = (name: string) => send(run.app, `${run.origin}/_t/call/${name}`, { method: 'POST' })
  // The heavy query is carried out on a thread, and the query that calls it has it carried out where it runs itself.
  const [onThread, onMain] = [await asked('heavyFails'), await asked('callsFails')]
  assert.deepEqual(onMain.error.where, { file: 'functions.ts', line: 7, definition: 'heavyFails' })
  assert.deepEqual(onThread.error, onMain.error)
  assert.equal(onThread.status, onMain.status)
  // Each call is a row of the log with the code of the failure: the one on the thread, and the two on the main thread.
  const rows = logRows(run.dataFolder, 'calls').filter((row) => ['heavyFails', 'callsFails'].includes(String(row.name)))
  assert.deepEqual(
    rows.map((row) => [row.name, row.code]),
    [
      ['heavyFails', 'T0002'],
      ['heavyFails', 'T0002'],
      ['callsFails', 'T0002'],
    ],
  )
})
