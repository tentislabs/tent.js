import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

// What the steps that add to a conversation save, by the table of the steps of a run.

test('[27-9] the step remember saves { row }, the id of the row of the message, and the step summary saves { row }, the id of the summary', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'chatty') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  app.fake('writer', (request: ReplyRequest) => {
    const asked = request.messages.at(-1)?.text ?? ''
    return { text: asked.startsWith('Shorten this conversation') ? 'A summary.' : 'Fine.' }
  })
  for (let turn = 1; turn <= 5; turn++) await app.as(maya).call('summed', { message: `Turn ${turn}.`, thread: chat })
  // The sixth turn is the one whose summary is due.
  const last = notDropped(await app.start('summed', { message: 'Turn 6.', thread: chat }, { as: maya })).run
  await app.runs.wait(last)
  const steps = app.runs.read(last)?.steps ?? []
  const saved = (name: string): unknown => Object(steps.find((one) => one.name === name)?.result)
  // Each saves the id of the one row it added.
  const rows = await app.rows('messages')
  const idOf = (fits: (row: Record<string, unknown>) => boolean): unknown => rows.find(fits)?.id
  assert.deepEqual(saved('remember'), { row: idOf((row) => row.text === 'Turn 6.') })
  assert.deepEqual(saved('summary'), { row: idOf((row) => row.who === 'summary') })
})
