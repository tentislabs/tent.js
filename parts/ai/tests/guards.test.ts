import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A step of a run as `app.runs.read` shows it. */
interface Shown {
  name: string
  state: string
  result?: unknown
  error?: unknown
}

/** A test app of the project of typed answers and guards, with two people, each with an order and a customer. */
async function desk(t: test.TestContext): Promise<{
  app: TestApp
  maya: Caller
  bob: Caller
  rows: { mayaOrder: string; bobOrder: string }
}> {
  const app = await testApp({ folder: copyOf(t, 'typed') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const bob = await app.user({ name: 'Bob', roles: [] })
  const added = await app.write(
    [
      { add: 'orders', values: { title: 'A lamp', total: 30, placedBy: maya.user?.id } },
      { add: 'orders', values: { title: 'A chair', total: 80, placedBy: bob.user?.id } },
      {
        add: 'customers',
        values: { name: 'Ann', email: 'ann@maya.example', note: 'pays late', keptBy: maya.user?.id },
      },
      { add: 'customers', values: { name: 'Carl', email: 'carl@bob.example', keptBy: bob.user?.id } },
    ],
    { as: 'system' },
  )
  const ids = (Array.isArray(added) ? added : []).map((row) => String(Reflect.get(Object(row), 'id')))
  return { app, maya, bob, rows: { mayaOrder: ids[0] ?? '', bobOrder: ids[1] ?? '' } }
}

/** The steps of a run. */
const stepsOf = (app: TestApp, run: string): Shown[] => (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** The code of the error a step failed with. */
const codeOf = (step: Shown | undefined): unknown => Reflect.get(Object(step?.error), 'code')

/** A chat of a person, for an agent that keeps a conversation. */
async function chatOf(app: TestApp, person: Caller): Promise<string> {
  const made = await app.write([{ add: 'chats', values: { by: person.user?.id } }], { as: 'system' })
  return String(Reflect.get(Object(Array.isArray(made) ? made[0] : undefined), 'id'))
}

test('[47-2] an `in` guard that refuses the message ends the turn with T7131 before any model step, and the person gets `guards.refused`', async (t) => {
  const { app, maya } = await desk(t)
  const asked: ReplyRequest[] = []
  app.fake('writer', (request) => {
    asked.push(request)
    return { text: 'Here you are.' }
  })
  const chat = await chatOf(app, maya)
  const { run } = notDropped(
    await app.start('careful', { message: 'Say forbidden things.', thread: chat }, { as: maya }),
  )
  assert.deepEqual(await app.runs.wait(run), { text: 'Sorry, that is not something I can answer.' })
  assert.equal(asked.length, 0, 'the model was never asked')
  const guard = stepsOf(app, run).find((one) => one.name === 'guard in 1 tone')
  assert.equal(guard?.state, 'failed')
  assert.equal(codeOf(guard), 'T7131')
  assert.match(String(Reflect.get(Object(guard?.error), 'message')), /tone/)
  assert.match(String(Reflect.get(Object(guard?.error), 'message')), /a forbidden word, from person/)
  // The conversation holds what the person was answered, and never an answer of the model.
  const said = (await app.rows('messages')).filter((row) => row.who === 'assistant').map((row) => row.text)
  assert.deepEqual(said, ['Sorry, that is not something I can answer.'])
  // A message that passes is answered by the model.
  const { run: next } = notDropped(await app.start('careful', { message: 'Hello.', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(next), { text: 'Here you are.' })
  assert.equal(stepsOf(app, next).find((one) => one.name === 'guard in 1 tone')?.state, 'done')
})

test('[47-2] an `in` guard runs on the answer of a tool from outside the app before the model sees it, and not on a tool that reads the app alone', async (t) => {
  const { app, maya } = await desk(t)
  const handed: string[] = []
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    handed.push(String(last?.result ?? last?.text))
    if (request.messages.length === 1) return { calls: [{ tool: 'myOrders' }] }
    if (request.messages.length === 3) return { calls: [{ tool: 'news' }] }
    return { text: 'Done.' }
  })
  const chat = await chatOf(app, maya)
  const { run } = notDropped(await app.start('careful', { message: 'What is new?', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Sorry, that is not something I can answer.' })
  const names = stepsOf(app, run).map((one) => one.name)
  assert.ok(!names.some((name) => name.startsWith('guard in 1.')), 'the answer of a read of the app is not guarded')
  const guarded = stepsOf(app, run).find((one) => one.name === 'guard in 2.1 tone')
  assert.equal(codeOf(guarded), 'T7131')
  assert.match(String(Reflect.get(Object(guarded?.error), 'message')), /from tool/)
  assert.ok(!handed.some((one) => one.includes('forbidden')), 'the model never saw the steering text')
})

test('[47-2] told as a list, the answer of a tool from outside that `call` names meets the `in` guards, and so does its error', async (t) => {
  const { app, maya } = await desk(t)
  for (const tool of ['news', 'weather']) {
    const handed: unknown[] = []
    app.fake('writer', (request) => {
      handed.push(...request.messages)
      if (request.messages.at(-1)?.who === 'user') return { calls: [{ tool: 'call', with: { name: tool, input: {} } }] }
      return { text: 'Done.' }
    })
    const { run } = notDropped(await app.start('listing', { message: 'What is new?' }, { as: maya }))
    assert.deepEqual(await app.runs.wait(run), { text: 'Sorry, that is not something I can answer.' }, tool)
    assert.equal(codeOf(stepsOf(app, run).find((one) => one.name === 'guard in 1.1 tone')), 'T7131', tool)
    assert.ok(!JSON.stringify(handed).includes('forbidden'), `the model never saw the steering text of ${tool}`)
  }
})

test('[47-2] an `out` guard refuses an answer before it is kept or sent, and the person gets `guards.refused`', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', [{ text: 'Here are some forbidden words.' }])
  const chat = await chatOf(app, maya)
  const { run } = notDropped(await app.start('careful', { message: 'Hello.', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Sorry, that is not something I can answer.' })
  assert.equal(codeOf(stepsOf(app, run).find((one) => one.name === 'guard out tone')), 'T7131')
  const kept = JSON.stringify(await app.rows('messages'))
  assert.doesNotMatch(kept, /forbidden words/, 'the refused answer is kept nowhere')
})

test('[47-2] `noOtherPeople` refuses an answer that names a row the starter may not read, and passes one that names their own', async (t) => {
  const { app, maya, rows } = await desk(t)
  app.fake('writer', [{ text: `Your order is ${rows.mayaOrder}.` }, { text: `Look at order ${rows.bobOrder}.` }])
  const own = notDropped(await app.start('discreet', { message: 'Which order?' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(own.run), { text: `Your order is ${rows.mayaOrder}.` })
  const other = notDropped(await app.start('discreet', { message: 'Which order?' }, { as: maya }))
  const answer = Object(await app.runs.wait(other.run))
  assert.doesNotMatch(String(answer.text), new RegExp(rows.bobOrder))
  assert.equal(codeOf(stepsOf(app, other.run).find((one) => one.name === 'guard out noOtherPeople')), 'T7131')
})

test('[47-2] `noOtherPeople` holds a typed answer too: a value that names a row of another person is refused, and held to its type', async (t) => {
  const { app, maya, rows } = await desk(t)
  app.fake('writer', (request) =>
    request.messages.at(-1)?.who === 'user'
      ? { calls: [{ tool: 'answer', with: { order: rows.bobOrder } }] }
      : { text: 'Again.' },
  )
  const { run } = notDropped(await app.start('picker', { message: 'Pick the order of Bob.' }, { as: maya }))
  const answer = Object(await app.runs.wait(run))
  assert.equal(answer.value, undefined, 'no value that was refused is answered')
  assert.doesNotMatch(JSON.stringify(answer), new RegExp(rows.bobOrder))
  assert.equal(codeOf(stepsOf(app, run).find((one) => one.name === 'guard out noOtherPeople')), 'T7131')
})

test('[47-2] `noPersonal` refuses a personal value of a row the starter may not read and a private value of any, and passes a personal value of their own', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', [
    { text: 'Write to ann@maya.example.' },
    { text: 'Write to carl@bob.example.' },
    { text: 'Ann pays late, I am told.' },
  ])
  const answers: unknown[] = []
  const guards: unknown[] = []
  for (let n = 0; n < 3; n++) {
    const { run } = notDropped(await app.start('discreet', { message: 'Whom do I write to?' }, { as: maya }))
    answers.push(Object(await app.runs.wait(run)).text)
    guards.push(codeOf(stepsOf(app, run).find((one) => one.name === 'guard out noPersonal')))
  }
  assert.equal(answers[0], 'Write to ann@maya.example.')
  assert.deepEqual(guards, [undefined, 'T7131', 'T7131'])
  assert.doesNotMatch(String(answers[1]), /carl@bob/)
  assert.doesNotMatch(String(answers[2]), /pays late/)
})

test('[47-2] the answer of a turn whose work a sequence did meets the `out` guards: a sequence passes no guard by', async (t) => {
  const { app, maya } = await desk(t)
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool: 'sequence', with: { run: "return 'a forbidden plan'" } }] }
    return { text: String(last?.result) }
  })
  const { run } = notDropped(await app.start('planner', { message: 'Plan.' }, { as: maya }))
  const answer = Object(await app.runs.wait(run))
  assert.doesNotMatch(String(answer.text), /forbidden/)
  assert.equal(codeOf(stepsOf(app, run).find((one) => one.name === 'guard out tone')), 'T7131')
})
