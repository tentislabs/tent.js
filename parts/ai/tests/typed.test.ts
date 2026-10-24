import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { evals, testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A test app of the project of typed answers and guards, and a person of it. */
async function desk(t: test.TestContext): Promise<{ app: TestApp; maya: Caller }> {
  const app = await testApp({ folder: copyOf(t, 'typed') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

/** A fake that answers with a call of `answer` once a person spoke, and with the last answer it was handed after. */
const answering =
  (value: unknown) =>
  (request: ReplyRequest): { text?: string; calls?: { tool: string; with?: unknown }[] } => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { text: 'Sorted.', calls: [{ tool: 'answer', with: value }] }
    return { text: `Seen: ${String(last?.error ?? JSON.stringify(last?.result))}` }
  }

const bug = { category: 'bug', reason: 'The page does not load.' }

test('[47-1] an agent with `output` is offered the tool `answer` with that type, and answers a value of its type', async (t) => {
  const { app, maya } = await desk(t)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    sent.push(request)
    return answering(bug)(request)
  })
  const { run } = notDropped(await app.start('sorter', { message: 'The page does not load.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Sorted.', value: bug })
  const offered = (sent[0]?.tools ?? []).find((tool) => tool.name === 'answer')
  assert.ok(offered, 'the tool answer is offered')
  assert.deepEqual(Object(Object(offered.input).properties).category, {
    type: 'string',
    enum: ['bug', 'question', 'refund'],
  })
  // The run ends at the answer: the model is asked no second time.
  assert.equal(sent.length, 1)
})

test('[47-1] a value that does not fit goes back to the model as T0002, and the run goes on to an answer that fits', async (t) => {
  const { app, maya } = await desk(t)
  const handed: (string | undefined)[] = []
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    handed.push(last?.error)
    if (last?.who === 'user') return { calls: [{ tool: 'answer', with: { category: 'praise', reason: 'Nice.' } }] }
    return { calls: [{ tool: 'answer', with: bug }] }
  })
  const { run } = notDropped(await app.start('sorter', { message: 'The page does not load.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: '', value: bug })
  assert.match(String(handed[1]), /^Error T0002:/)
  assert.match(String(handed[1]), /category/)
})

test('[47-1] a run of an agent with `output` that ends with no call of `answer` fails with T7130, and passes no prose off as a value', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', [{ text: 'It is a bug, I think.' }])
  const { run } = notDropped(await app.start('sorter', { message: 'The page does not load.' }, { as: maya }))
  await assert.rejects(app.runs.wait(run), (error: unknown) => Reflect.get(Object(error), 'code') === 'T7130')
  assert.equal(app.runs.read(run)?.state, 'failed')
})

test('[47-1] the value reaches a step that waits for the run, and a case that expects it', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', answering(bug))
  const { run } = notDropped(await app.start('triage', { message: 'The page does not load.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), bug)
  const result = await evals(
    app,
    'sorter',
    [
      { say: 'The page does not load.', expect: { value: bug } },
      { say: 'Is it open on Sunday?', expect: { value: { category: 'question', reason: 'A question.' } } },
    ],
    { as: maya },
  )
  assert.deepEqual([result.passed, result.failed], [1, 1])
})

test('[47-1] over the API and over MCP an agent with `output` answers its type', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', answering(bug))
  const { key } = await app.key({ scopes: ['*'], user: String(maya.user?.id) })
  const answer = await app.request(
    new Request('http://localhost/api/sorter', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'The page does not load.' }),
    }),
  )
  assert.equal(answer.status, 200)
  assert.deepEqual(await answer.json(), { text: 'Sorted.', value: bug })
  const client = app.mcp({ as: maya })
  const tool = (await client.tools()).find((one) => one.name === 'sorter')
  const value: unknown = Reflect.get(Object(Object(tool?.outputSchema).properties), 'value')
  assert.deepEqual(Object(Object(value).properties).category, { type: 'string', enum: ['bug', 'question', 'refund'] })
  const called = await client.call('sorter', { message: 'The page does not load.' })
  assert.deepEqual(called.structuredContent, { text: 'Sorted.', value: bug })
})
