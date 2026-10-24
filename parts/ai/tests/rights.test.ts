import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'

/** A faked model that asks who calls, and answers what it was told. */
const asking = (request: ReplyRequest) => {
  const last = request.messages.at(-1)
  if (last?.who === 'tool') return { text: String(last.result ?? last.error) }
  return { calls: [{ tool: 'whoAmI', with: {} }] }
}

test('[11-2] an agent runs as its starter, always: the caller who started it, or the system when a trigger did', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'rights') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  app.fake('writer', asking)
  assert.deepEqual(await app.as(maya).call('asMe', { message: 'Who am I?' }), { text: `user ${maya.user?.id}` })
  await app.as(maya).call('addNote', { words: 'A note.' })
  let ended: unknown
  for (let tries = 0; tries < 500 && ended === undefined; tries++) {
    const [run] = app.runs.find({ flow: 'onNote' })
    if (run?.state === 'done') ended = await app.runs.wait(run.id)
    else await new Promise((done) => setTimeout(done, 10))
  }
  assert.deepEqual(ended, { text: 'no user' })
  const [run] = app.runs.find({ flow: 'onNote' })
  assert.deepEqual(run?.startedBy, { kind: 'system' })
})
