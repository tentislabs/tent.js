import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

test('[27-2] a tool the starter may not use answers Error T3101: not allowed to the model, and the run goes on; each round stands in the conversation', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'helpdesk') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call('addOrder', { item: 'tent', total: 120 })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  const faked = app.fake('writer', [
    {
      text: 'Let me look.',
      calls: [
        { tool: 'myOrders', with: { status: 'open' } },
        { tool: 'closeShop', with: {} },
      ],
    },
    { text: 'One order is open.' },
  ])
  const answer = await app.as(maya).call('helper', { message: 'Which orders are open?', thread: chat })
  assert.deepEqual(answer, { text: 'One order is open.' })
  const second = Object(faked.sent[1].input)
  const answers = second.messages.filter((one: { who: string }) => one.who === 'tool')
  assert.equal(answers.length, 2)
  assert.equal(answers[1].error, 'Error T3101: not allowed')
  assert.equal(answers[0].result.length, 1)
  const rows = await app.rows('messages')
  assert.deepEqual(
    rows.map((one) => one.who),
    ['user', 'assistant', 'tool', 'tool', 'assistant'],
  )
})

test('[46-1] the thread of a conversation is the key of an agent that states none: its runs are found by it', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'helpdesk') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  app.fake('writer', [{ text: 'Hello.' }])
  await app.as(maya).call('helper', { message: 'Hello?', thread: chat })
  const found = await app.runs.find({ flow: 'helper', key: chat, of: 'all' })
  assert.equal(found.length, 1)
  assert.equal(Reflect.get(Object(found[0]), 'key'), chat)
})
