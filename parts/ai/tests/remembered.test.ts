import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { anthropicEvents, sse, standIn } from './servers.ts'
import { layerOf } from './env.ts'
import { model, secret } from '../../core/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

const moment = (ms = 20): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** A test app of the journal, with two people. */
async function journal(t: test.TestContext): Promise<{ app: TestApp; maya: Caller; bob: Caller }> {
  const app = await testApp({ folder: copyOf(t, 'recalled') })
  t.after(() => app.close())
  // A meaning of three numbers, by the subject a text is about.
  app.fake('embedder', {
    embed: (text: string) => (/tent/.test(text) ? [1, 0, 0] : /lamp/.test(text) ? [0, 1, 0] : [0, 0, 1]),
  })
  return { app, maya: await app.user({ name: 'Maya', roles: [] }), bob: await app.user({ name: 'Bob', roles: [] }) }
}

/** A chat of a person. */
async function chatOf(app: TestApp, person: Caller): Promise<string> {
  const made = await app.write([{ add: 'chats', values: { by: person.user?.id } }], { as: 'system' })
  return String(Reflect.get(Object(Array.isArray(made) ? made[0] : undefined), 'id'))
}

/** Waits until every message has its meaning, moving the clock on so that the engine fills them. */
async function filled(app: TestApp): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const rows: unknown = await app.read({ from: 'messages', pick: ['id', 'meaning'] }, { as: 'system' })
    const all = Array.isArray(rows) ? rows : []
    if (all.length && all.every((row) => Array.isArray(Reflect.get(Object(row), 'meaning')))) return
    app.clock.advance('1 second')
    await moment()
  }
  assert.fail('the meanings of the messages were never filled')
}

/** Says one message on a chat, and waits for the answer. */
async function said(app: TestApp, agent: string, message: string, thread: string, as: Caller): Promise<void> {
  const { run } = notDropped(await app.start(agent, { message, thread }, { as }))
  await app.runs.wait(run)
}

/** The texts of the messages a request holds that the engine adds itself, beside the conversation. */
const ownOf = (request: ReplyRequest | undefined): string =>
  (request?.messages ?? [])
    .filter((one) => one.who === 'user')
    .map((one) => one.text ?? '')
    .join('\n')

test('[47-6] a provider tool that `trust` names is offered, one that it does not is asked about as sending out, and one the model does not name is never offered', async (t) => {
  const { app, maya } = await journal(t)
  const hosted: unknown[] = []
  app.fake('surfer', (request) => {
    hosted.push(Reflect.get(request, 'hosted'))
    return { text: 'Found it.' }
  })
  const { run } = notDropped(await app.start('browser', { message: 'What is new?' }, { as: maya }))
  let asked: { name: string; show?: unknown } | undefined
  for (let i = 0; i < 300 && !asked; i++) {
    asked = (app.runs.read(run)?.steps ?? []).map(Object).find((one) => one.state === 'waiting')
    await moment(10)
  }
  assert.equal(asked?.name, 'ask hosted codeExecution')
  assert.deepEqual(asked?.show, { tool: 'codeExecution', hosted: true })
  app.runs.approve(run, 'ask hosted codeExecution')
  assert.deepEqual(await app.runs.wait(run), { text: 'Found it.' })
  assert.deepEqual(hosted, [['webSearch', 'codeExecution']])
  // A no leaves the tool out of the run, and the trusted one stays.
  const second = notDropped(await app.start('browser', { message: 'And now?' }, { as: maya }))
  for (let i = 0; i < 300 && app.runs.read(second.run)?.state !== 'waiting'; i++) await moment(10)
  app.runs.refuse(second.run, 'ask hosted codeExecution')
  await app.runs.wait(second.run)
  assert.deepEqual(hosted[1], ['webSearch'])
  assert.ok(!JSON.stringify(hosted).includes('webFetch'), 'a tool the model does not name is never offered')
})

test('[47-6] anthropic hands a provider tool to its server in the form of its Messages API, and counts the searches', async (t) => {
  const server = await standIn(t, (_asked, response) =>
    sse(response, [
      ...anthropicEvents({ text: 'Found it.' }).slice(0, -2),
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 4, server_tool_use: { web_search_requests: 2 } },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ]),
  )
  const surfer = model('surfer', {
    provider: 'anthropic',
    name: 'claude-sonnet-5-5',
    key: secret('KEY'),
    url: `${server.origin}/v1`,
    hosted: ['webSearch'],
  })
  const layer = layerOf([surfer], { secrets: { KEY: 'sk-test' } })
  assert.equal(await layer.call('surfer', 'reply', ['What is new?']), 'Found it.')
  const tools: unknown = server.asked[0]?.json().tools
  assert.deepEqual(Array.isArray(tools) ? Reflect.get(Object(tools[0]), 'type') : undefined, 'web_search_20250305')
  assert.equal(layer.used[0]?.units?.webSearches, 2)
})

test('[47-7] `shrink: { nearest }` sends the nearest older turn of the thread, and none of another thread or person', async (t) => {
  const { app, maya, bob } = await journal(t)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    sent.push(request)
    return { text: 'Noted.' }
  })
  const chat = await chatOf(app, maya)
  const other = await chatOf(app, bob)
  await said(app, 'recaller', 'Bob likes a tent of his own.', other, bob)
  await said(app, 'recaller', 'I want a red tent.', chat, maya)
  await said(app, 'recaller', 'And a lamp for the desk.', chat, maya)
  await filled(app)
  sent.length = 0
  await said(app, 'recaller', 'Which tent was it?', chat, maya)
  const own = ownOf(sent[0])
  assert.match(own, /I want a red tent\./)
  assert.doesNotMatch(own, /Bob likes/)
  assert.doesNotMatch(
    own,
    /lamp for the desk/,
    'the nearest older turn alone is sent, beside the latest that keep sends',
  )
})

test("[47-7] `memory: { recall }` reads every conversation of the starter and none of another person's", async (t) => {
  const { app, maya, bob } = await journal(t)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    sent.push(request)
    return { text: 'Noted.' }
  })
  const first = await chatOf(app, maya)
  const second = await chatOf(app, maya)
  const bobs = await chatOf(app, bob)
  await said(app, 'keeper', 'My tent is green.', first, maya)
  await said(app, 'keeper', 'Bob has a tent too.', bobs, bob)
  await said(app, 'keeper', 'Hello again.', second, maya)
  await filled(app)
  sent.length = 0
  await said(app, 'keeper', 'What colour is my tent?', second, maya)
  const own = ownOf(sent[0])
  assert.match(own, /My tent is green\./)
  assert.doesNotMatch(own, /Bob has a tent/)
})

test("[47-7] the facts that `knows` names are the starter's rows, sent in each call, and none of another person: changes of the builder's keep and drop them", async (t) => {
  const { app, maya, bob } = await journal(t)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    sent.push(request)
    const last = request.messages.at(-1)
    if (last?.who === 'user' && /remember/.test(String(last.text)))
      return { calls: [{ tool: 'remember', with: { fact: 'Likes green tents.' } }] }
    const forget = /forget (\S+)/.exec(String(last?.text))
    if (last?.who === 'user' && forget) return { calls: [{ tool: 'forget', with: { id: forget[1] } }] }
    return { text: 'Noted.' }
  })
  const chat = await chatOf(app, maya)
  const bobs = await chatOf(app, bob)
  await said(app, 'keeper', 'Please remember this.', chat, maya)
  const facts = await app.read({ from: 'preferences' }, { as: 'system' })
  const kept = Array.isArray(facts) ? facts.map(Object) : []
  assert.deepEqual(
    kept.map((row) => [row.fact, row.by]),
    [['Likes green tents.', maya.user?.id]],
  )
  sent.length = 0
  await said(app, 'keeper', 'Hello.', chat, maya)
  assert.match(ownOf(sent[0]), /Likes green tents\./)
  sent.length = 0
  await said(app, 'keeper', 'Hello.', bobs, bob)
  assert.doesNotMatch(ownOf(sent[0]), /Likes green tents/, "Bob is sent no fact of Maya's")
  // Bob cannot drop a fact of Maya's: it is no row he may reach.
  await said(app, 'keeper', `forget ${kept[0]?.id}`, bobs, bob)
  assert.equal((await app.rows('preferences')).length, 1)
  await said(app, 'keeper', `forget ${kept[0]?.id}`, chat, maya)
  assert.equal((await app.rows('preferences')).length, 0)
})
