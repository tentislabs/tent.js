import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { FakeAnswer, TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** The code that a promise was refused with, or `ok`. */
const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

/** The texts of the messages of a request, each with who said it. */
const said = (request: ReplyRequest): string[] => request.messages.map((one) => `${one.who}: ${one.text ?? ''}`)

/** A test app of the project of the conversations, a user, and a conversation of theirs. */
async function chatting(
  t: test.TestContext,
): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>>; chat: string }> {
  const app = await testApp({ folder: copyOf(t, 'chatty') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  return { app, maya, chat }
}

/** A faked model that keeps each request, answers a summary when one is asked for, and else what it was told. */
function keeping(answer: (request: ReplyRequest) => FakeAnswer = () => ({ text: 'Fine.' })): {
  requests: ReplyRequest[]
  fake: (request: ReplyRequest) => FakeAnswer
} {
  const requests: ReplyRequest[] = []
  return {
    requests,
    fake(request) {
      requests.push(request)
      const asked = request.messages.at(-1)?.text ?? ''
      if (asked.startsWith('Shorten this conversation')) return { text: `summary ${requests.length}` }
      return answer(request)
    },
  }
}

test('[27-9] a second run on a conversation is sent the first, and another user who may not read its row is refused with T2103', async (t) => {
  const { app, maya, chat } = await chatting(t)
  const model = keeping((request) => ({ text: `Answer to ${request.messages.at(-1)?.text}` }))
  app.fake('writer', model.fake)
  await app.as(maya).call('helper', { message: 'Hi.', thread: chat })
  await app.as(maya).call('helper', { message: 'Again.', thread: chat })
  assert.deepEqual(said(model.requests[1]), ['user: Hi.', 'assistant: Answer to Hi.', 'user: Again.'])
  const leo = await app.user({ name: 'Leo', roles: [] })
  assert.equal(await codeOf(app.as(leo).call('helper', { message: 'Mine?', thread: chat })), 'T2103')
})

test('[27-9] with summary and keep: 2, the sixth turn is sent a summary and the latest turns, every row is still in the table, and the next summary is written four turns later', async (t) => {
  const { app, maya, chat } = await chatting(t)
  const model = keeping()
  app.fake('writer', model.fake)
  const summaries = (): ReplyRequest[] =>
    model.requests.filter((one) => (one.messages.at(-1)?.text ?? '').startsWith('Shorten this conversation'))
  for (let turn = 1; turn <= 5; turn++) await app.as(maya).call('summed', { message: `Turn ${turn}.`, thread: chat })
  assert.equal(summaries().length, 0)
  await app.as(maya).call('summed', { message: 'Turn 6.', thread: chat })
  assert.equal(summaries().length, 1)
  // The summary shortens the first four turns, and the latest two are sent in full beside it.
  assert.match(summaries()[0].messages.at(-1)?.text ?? '', /user: Turn 1\.[\s\S]*user: Turn 4\./)
  assert.doesNotMatch(summaries()[0].messages.at(-1)?.text ?? '', /Turn 5/)
  const sixth = model.requests.at(-1)
  assert.ok(sixth)
  assert.deepEqual(said(sixth), ['user: summary 6', 'user: Turn 5.', 'assistant: Fine.', 'user: Turn 6.'])
  // A summary row has no owner, so it is read with full access.
  const rows = await app.rows('messages')
  assert.equal(rows.length, 13)
  assert.equal(rows.filter((one) => one.who === 'summary').length, 1)
  for (let turn = 7; turn <= 9; turn++) await app.as(maya).call('summed', { message: `Turn ${turn}.`, thread: chat })
  assert.equal(summaries().length, 1)
  await app.as(maya).call('summed', { message: 'Turn 10.', thread: chat })
  assert.equal(summaries().length, 2)
})

test('[27-9] a function in shrink is handed the rows, and its text is kept as the summary', async (t) => {
  const { app, maya, chat } = await chatting(t)
  const model = keeping()
  app.fake('writer', model.fake)
  for (let turn = 1; turn <= 3; turn++) await app.as(maya).call('ownShort', { message: `Turn ${turn}.`, thread: chat })
  const rows = await app.rows('messages')
  assert.deepEqual(
    rows.filter((one) => one.who === 'summary').map((one) => one.text),
    ['shortened 4 rows'],
  )
  const last = model.requests.at(-1)
  assert.ok(last)
  assert.deepEqual(said(last), ['user: shortened 4 rows', 'user: Turn 3.'])
})

test('[27-9] with all, a conversation too long for the model gives T7101', async (t) => {
  const { app, maya, chat } = await chatting(t)
  app.fake('small', [{ text: 'Fine.' }])
  assert.equal(await codeOf(app.as(maya).call('tight', { message: 'x'.repeat(1500), thread: chat })), 'T7101')
})

test('[27-9] a run stopped before it answered leaves a conversation that the next run can still use', async (t) => {
  const { app, maya, chat } = await chatting(t)
  let release = (): void => undefined
  const held = new Promise<void>((done) => {
    release = done
  })
  const requests: ReplyRequest[] = []
  app.fake('writer', async (request) => {
    requests.push(request)
    if (requests.length === 1) await held
    return { text: 'Fine.' }
  })
  const { run } = notDropped(await app.start('helper', { message: 'First.', thread: chat }, { as: maya }))
  for (let tries = 0; !requests.length && tries < 200; tries++) await new Promise((done) => setTimeout(done, 10))
  app.runs.stop(run)
  release()
  await app.as(maya).call('helper', { message: 'Second.', thread: chat })
  const last = requests.at(-1)
  assert.ok(last)
  assert.deepEqual(said(last), ['user: First.', 'assistant: This did not finish.', 'user: Second.'])
})

test('[27-9] a file sent on a conversation can still be downloaded after an hour', async (t) => {
  const { app, maya, chat } = await chatting(t)
  app.fake('writer', [{ text: 'Read it.' }])
  const note = String(await app.as(maya).call('keepNote', { words: 'The order is late.' }))
  const loose = String(await app.as(maya).call('keepNote', { words: 'Nobody keeps this.' }))
  await app.as(maya).call('helper', { message: 'Read this.', thread: chat, files: [note] })
  app.clock.advance('3 hours')
  await new Promise((done) => setTimeout(done, 200))
  const browser = app.browser({ as: maya })
  const answer = await browser.request('GET', `/_t/files/${note}`)
  assert.equal(answer.status, 200)
  // A file that no row holds is gone after its hour.
  assert.equal((await browser.request('GET', `/_t/files/${loose}`)).status, 404)
})
