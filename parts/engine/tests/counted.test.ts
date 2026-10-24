import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { send, system } from './apps.ts'
import { modeled, rowsIn } from './modeling.ts'

const maya: Caller = { kind: 'user', user: { id: 'maya', roles: [] } }
const leo: Caller = { kind: 'user', user: { id: 'leo', roles: [] } }

/** The error a call was refused with: its code and its fields, or `ok`. */
const refusal = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => 'ok',
    (error: unknown) => [Reflect.get(Object(error), 'code'), Reflect.get(Object(error), 'fields')],
  )

/** The counts of the data of a test, by name, answered model, caller and unit, with their amounts. */
const countsIn = (folder: string): string[] =>
  rowsIn(
    folder,
    'data.db',
    'SELECT name, answeredBy, caller, user, unit, amount FROM _t_counts ORDER BY name, answeredBy, caller, unit',
  ).map((row) => `${row.name} ${row.answeredBy} ${row.caller} ${row.user ?? '-'} ${row.unit} ${row.amount}`)

test('[26-6] a provider that reports images: 2 is counted, and is stopped by a perDay that names images; a unit that the limit does not name is not bounded', async (t) => {
  const { app, dataFolder } = await modeled(t)
  assert.equal(await app.call('pictures.reply', ['Draw.'], { as: maya }), 'a picture')
  assert.equal(await app.call('pictures.reply', ['Draw.'], { as: maya }), 'a picture')
  assert.deepEqual(await refusal(app.call('pictures.reply', ['Draw.'], { as: maya })), [
    'T7102',
    { limit: 'perDay', unit: 'images' },
  ])
  // Ten thousand tokens were written, which no limit names: the calls were stopped by the pictures alone.
  assert.deepEqual(countsIn(dataFolder), [
    'pictures pictures user:maya maya calls 2',
    'pictures pictures user:maya maya images 4',
    'pictures pictures user:maya maya tokensIn 4',
    'pictures pictures user:maya maya tokensOut 10000',
  ])
})

test('[26-6] perCallerPerDay stops one caller and no other', async (t) => {
  const { app } = await modeled(t)
  assert.equal(await app.call('chatty.reply', ['Hi.'], { as: maya }), 'from the backup')
  assert.deepEqual(await refusal(app.call('chatty.reply', ['Hi.'], { as: maya })), [
    'T7102',
    { limit: 'perCallerPerDay', unit: 'calls' },
  ])
  assert.equal(await app.call('chatty.reply', ['Hi.'], { as: leo }), 'from the backup')
})

test('[26-6] a call that a second model answered counts on the limits of the model that was asked and of the one that answered', async (t) => {
  const { app, dataFolder } = await modeled(t)
  assert.equal(await app.call('asker.reply', ['Hi.'], { as: system }), 'from the backup')
  // The model that answered used its one call, for the other.
  assert.deepEqual(await refusal(app.call('helper.reply', ['Hi.'], { as: system })), [
    'T7102',
    { limit: 'perDay', unit: 'calls' },
  ])
  // The model that was asked used its two: its own try that failed, and the answer of its fall-back.
  assert.deepEqual(await refusal(app.call('asker.reply', ['Hi.'], { as: system })), [
    'T7102',
    { limit: 'perDay', unit: 'calls' },
  ])
  assert.deepEqual(countsIn(dataFolder), [
    'asker asker system - calls 1',
    'asker asker system - failed 1',
    'asker asker system - tokensIn 1',
    'asker asker system - tokensOut 0',
    'asker helper system - calls 1',
    'asker helper system - tokensIn 4',
    'asker helper system - tokensOut 3',
  ])
})

test('[26-6] a fixed call whose provider reports no number is counted by the rule, its row of the log says so, and a perDay that names tokensOut stops it', async (t) => {
  const { app, dataFolder } = await modeled(t)
  assert.equal(await app.call('quiet.reply', ['Count.'], { as: system }), 'x'.repeat(30))
  assert.deepEqual(await refusal(app.call('quiet.reply', ['Count.'], { as: system })), [
    'T7102',
    { limit: 'perDay', unit: 'tokensOut' },
  ])
  assert.ok(countsIn(dataFolder).includes('quiet quiet system - tokensOut 10'))
  const [row] = rowsIn(dataFolder, 'logs.db', "SELECT * FROM modelCalls WHERE name = 'quiet'")
  assert.equal(row.counted, 'rule')
  assert.equal(row.ok, 1)
  assert.deepEqual(JSON.parse(String(row.units)), { tokensIn: 2, tokensOut: 10, calls: 1 })
})

test('[26-6] a provider in code that reports bytesOut has that number left out, and the row of the log names it', async (t) => {
  const { app, dataFolder } = await modeled(t)
  assert.equal(await app.call('bytes.reply', ['Send.'], { as: system }), 'some bytes')
  assert.deepEqual(
    countsIn(dataFolder).filter((one) => one.startsWith('bytes ')),
    ['bytes bytes system - calls 1', 'bytes bytes system - tokensIn 3', 'bytes bytes system - tokensOut 4'],
  )
  const [row] = rowsIn(dataFolder, 'logs.db', "SELECT * FROM modelCalls WHERE name = 'bytes'")
  assert.match(String(row.counted), /left out bytesOut/)
})

test('[20-7] two removed people who used one model on one day leave one row for `removed`, with the sum of both', async (t) => {
  const { app, dataFolder, origin } = await modeled(t)
  assert.equal(await app.call('backup.reply', ['Hi.'], { as: maya }), 'from the backup')
  assert.equal(await app.call('backup.reply', ['Hi.'], { as: leo }), 'from the backup')
  const token = String(JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8')).token)
  for (const id of ['maya', 'leo']) {
    const answered = await send(app, `${origin}/_t/admin/data`, {
      body: JSON.stringify({ args: { what: 'user', do: 'remove', id, yes: true } }),
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
  }
  // The removal first writes what was counted and not yet written: the counts of the door and the data are among it,
  // and no row of any count names either of them.
  const named = rowsIn(dataFolder, 'data.db', 'SELECT name, caller, user FROM _t_counts').filter((row) =>
    [row.caller, row.user].some((one) => typeof one === 'string' && /maya|leo/.test(one)),
  )
  assert.deepEqual(named, [])
  assert.deepEqual(
    countsIn(dataFolder).filter((one) => one.startsWith('backup ')),
    ['backup backup removed - calls 2', 'backup backup removed - tokensIn 8', 'backup backup removed - tokensOut 6'],
  )
})
