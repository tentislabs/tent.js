import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { running, send } from './apps.ts'
import { scripted } from './followedApp.ts'

test('[24-1@9a] a mail that is written to the log in development, and not sent, is shown by tent logs with --mail: its head and its text', async (t) => {
  const model = scripted()
  const run = await running(t, {
    project: 'counting',
    open: { mode: 'development' },
    engine: { makers: { providers: () => ({ mine: model.mine }) } },
  })
  assert.equal(await run.app.call('tellNote', { to: 'ada@example.com' }, { as: { kind: 'system' } }), 'sent')
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/logs`, {
    body: JSON.stringify({ args: { mail: true } }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  const mails: unknown = Reflect.get(Object(answered.body.value), 'mails')
  assert.ok(Array.isArray(mails) && mails.length === 1, JSON.stringify(answered.body))
  const [mail] = Array.isArray(mails) ? mails : []
  assert.equal(Reflect.get(Object(mail), 'subject'), 'A note')
  assert.deepEqual(Reflect.get(Object(mail), 'to'), ['ada@example.com'])
  assert.equal(Reflect.get(Object(mail), 'text'), 'Hello from the shop.')
})
