import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

// An agent whose summaries are written by a model that takes little: three of its turns do not fit, two do.
const partly = `
export const shortener = model('shortener', { provider: 'openai-style', name: 'short', url: 'http://127.0.0.1:1/v1', abilities: ['reply'], takes: 400 })

export const partly = agent('partly', {
  model: writer, instructions: 'You help.', tools: [], access: 'signedIn',
  memory: { in: messages, thread: 'chat', keep: 1, after: 2, shrink: 'summary', model: shortener },
  limits: { steps: 4, perRun: { calls: 100 } },
})
`

test('[27-9] a summary that does not fit its model is made in parts of whole turns, the oldest first', async (t) => {
  const folder = copyOf(t, 'chatty')
  appendFileSync(join(folder, 'functions.ts'), partly)
  const app = await testApp({ folder })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  const asked: string[] = []
  app.fake('shortener', (request: ReplyRequest) => {
    asked.push(request.messages.at(-1)?.text ?? '')
    return { text: `summary ${asked.length}` }
  })
  // Each turn is some 135 tokens: a message and its answer of 200 characters each.
  app.fake('writer', (request: ReplyRequest) => ({
    text: `Answer ${request.messages.at(-1)?.text?.slice(0, 7)} ${'a'.repeat(190)}`,
  }))
  for (let turn = 1; turn <= 4; turn++)
    await app.as(maya).call('partly', { message: `Turn ${turn} ${'q'.repeat(192)}`, thread: chat })
  assert.ok(asked.length >= 2, `the summary was made in parts: ${asked.length}`)
  // No request shortens a message of a turn without its answer: a turn is never cut in two.
  for (const text of asked)
    for (let turn = 1; turn <= 3; turn++)
      assert.equal(
        text.includes(`user: Turn ${turn} `),
        text.includes(`assistant: Answer Turn ${turn}`),
        text.slice(0, 200),
      )
  assert.match(asked[0], /user: Turn 1 [\s\S]*user: Turn 2 /, 'the first part holds as many of the oldest turns as fit')
})
