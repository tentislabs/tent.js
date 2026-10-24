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
  show?: unknown
  result?: unknown
}

/** A test app of the counter, with two people, and a chat of Maya's. */
async function counter(t: test.TestContext): Promise<{ app: TestApp; maya: Caller; bob: Caller; chat: string }> {
  const app = await testApp({ folder: copyOf(t, 'handed') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const bob = await app.user({ name: 'Bob', roles: [] })
  const made = await app.write([{ add: 'chats', values: { by: maya.user?.id } }], { as: 'system' })
  const chat = String(Reflect.get(Object(Array.isArray(made) ? made[0] : undefined), 'id'))
  return { app, maya, bob, chat }
}

/** The steps of a run. */
const stepsOf = (app: TestApp, run: string): Shown[] => (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** Waits until a step of a run waits, or the run ends, and answers the step that waits. */
async function waiting(app: TestApp, run: string): Promise<Shown | undefined> {
  for (let tries = 0; tries < 500; tries++) {
    const found = stepsOf(app, run).find((one) => one.state === 'waiting')
    if (found) return found
    const state = app.runs.read(run)?.state
    if (state === 'done' || state === 'failed' || state === 'stopped') return undefined
    await new Promise((done) => setTimeout(done, 10))
  }
  return undefined
}

/** Who a request was made for, by the instructions of the agent. */
const whose = (request: ReplyRequest): string => /You are (the )?(\w+)/.exec(request.instructions ?? '')?.[2] ?? ''

test('[47-4] after `handOver`, the next message of the thread is answered by the other agent, and the hand-over is a step of the run', async (t) => {
  const { app, maya, chat } = await counter(t)
  const answered: string[] = []
  app.fake('writer', (request) => {
    answered.push(whose(request))
    const last = request.messages.at(-1)
    if (whose(request) === 'front' && last?.who === 'user')
      return { text: 'Billing will help.', calls: [{ tool: 'handOver', with: { to: 'billing', why: 'a bill' } }] }
    return { text: `This is ${whose(request)}.` }
  })
  const first = notDropped(await app.start('front', { message: 'My bill is wrong.', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(first.run), { text: 'Billing will help.' })
  const step = stepsOf(app, first.run).find((one) => one.name === 'tool 1.1 handOver')
  assert.equal(step?.state, 'done')
  assert.deepEqual(step?.result, { to: 'billing', why: 'a bill' })
  // The front desk was asked once: the run ended at the hand-over.
  assert.deepEqual(answered, ['front'])
  const next = notDropped(await app.start('front', { message: 'It is twice too high.', thread: chat }, { as: maya }))
  assert.equal(app.runs.read(next.run)?.flow, 'billing')
  assert.deepEqual(await app.runs.wait(next.run), { text: 'This is billing.' })
  // The conversation goes on: billing is sent what was said before.
  const kept = (await app.rows('messages')).filter((row) => row.who === 'user').map((row) => row.text)
  assert.deepEqual(kept, ['My bill is wrong.', 'It is twice too high.'])
})

test('[47-4] the thread is held by the other agent in the engine, not by a row of the conversation: with every row gone, the next start is still its', async (t) => {
  const { app, maya, chat } = await counter(t)
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    if (whose(request) === 'front' && last?.who === 'user')
      return { calls: [{ tool: 'handOver', with: { to: 'billing', why: 'a bill' } }] }
    return { text: `This is ${whose(request)}.` }
  })
  const first = notDropped(await app.start('front', { message: 'My bill is wrong.', thread: chat }, { as: maya }))
  await app.runs.wait(first.run)
  const rows = await app.rows('messages')
  await app.write(
    rows.map((row) => ({ remove: 'messages', id: String(row.id) })),
    { as: 'system' },
  )
  const next = notDropped(await app.start('front', { message: 'Hello again.', thread: chat }, { as: maya }))
  assert.equal(app.runs.read(next.run)?.flow, 'billing')
  assert.deepEqual(await app.runs.wait(next.run), { text: 'This is billing.' })
})

test('[47-4] a hand-over to an agent whose `access` the starter does not pass is refused, and the thread stays where it was', async (t) => {
  const { app, maya, chat } = await counter(t)
  const told: unknown[] = []
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool: 'handOver', with: { to: 'staffDesk', why: 'more rights' } }] }
    told.push(last?.error)
    return { text: 'I stay.' }
  })
  const { run } = notDropped(await app.start('front', { message: 'Hand me to the staff.', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'I stay.' })
  assert.deepEqual(told, ['Error T3101: not allowed'])
  const next = notDropped(await app.start('front', { message: 'Again.', thread: chat }, { as: maya }))
  assert.equal(app.runs.read(next.run)?.flow, 'front')
  await app.runs.wait(next.run)
})

test('[47-4] `trust` does not carry: a tool the first agent trusts asks a person under the one it handed over to', async (t) => {
  const { app, maya, chat } = await counter(t)
  app.fake('writer', (request) => {
    const last = request.messages.at(-1)
    const who = whose(request)
    if (last?.who !== 'user') return { text: 'Done.' }
    if (who === 'front' && /hand/.test(String(last.text)))
      return { calls: [{ tool: 'handOver', with: { to: 'billing', why: 'a bill' } }] }
    return { calls: [{ tool: 'sendNote', with: { words: 'hello' } }] }
  })
  const trusted = notDropped(await app.start('front', { message: 'Send a note.', thread: chat }, { as: maya }))
  assert.deepEqual(await app.runs.wait(trusted.run), { text: 'Done.' })
  const handed = notDropped(await app.start('front', { message: 'Please hand me over.', thread: chat }, { as: maya }))
  await app.runs.wait(handed.run)
  const billed = notDropped(await app.start('front', { message: 'Send a note.', thread: chat }, { as: maya }))
  assert.equal(app.runs.read(billed.run)?.flow, 'billing')
  assert.equal((await waiting(app, billed.run))?.name, 'ask 1.1')
})

/** A fake that asks once, with what it is told, and then answers what the person said. */
const asking = (input: unknown) => (request: ReplyRequest) => {
  const last = request.messages.at(-1)
  if (last?.who === 'user') return { calls: [{ tool: 'question', with: input }] }
  return { text: `You said ${JSON.stringify(last?.result ?? last?.error)}.` }
}

test('[47-5] a question: the run waits, and `helper.approve` with an answer that fits one of the choices goes on', async (t) => {
  const { app, maya } = await counter(t)
  app.fake('writer', asking({ question: 'Which size?', choices: ['S', 'M'] }))
  const { run } = notDropped(await app.start('asker', { message: 'A shirt, please.' }, { as: maya }))
  const step = await waiting(app, run)
  assert.equal(step?.name, 'question 1.1')
  assert.deepEqual(step?.show, { tool: 'question', input: { question: 'Which size?', choices: ['S', 'M'] } })
  await assert.rejects(
    app.as(maya).call('asker.approve', { run, step: 'question 1.1', data: 'XL' }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0002',
  )
  assert.equal(app.runs.read(run)?.state, 'waiting')
  await app.as(maya).call('asker.approve', { run, step: 'question 1.1', data: 'M' })
  assert.deepEqual(await app.runs.wait(run), { text: 'You said "M".' })
})

test('[47-5] an answer is held to the `shape` of the question, and another caller cannot answer', async (t) => {
  const { app, maya, bob } = await counter(t)
  const shape = { type: 'object', properties: { count: { type: 'number' } }, required: ['count'] }
  app.fake('writer', asking({ question: 'How many?', shape }))
  const { run } = notDropped(await app.start('asker', { message: 'Some shirts.' }, { as: maya }))
  assert.equal((await waiting(app, run))?.name, 'question 1.1')
  await assert.rejects(
    app.as(bob).call('asker.approve', { run, step: 'question 1.1', data: { count: 2 } }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0001',
  )
  await assert.rejects(
    app.as(maya).call('asker.approve', { run, step: 'question 1.1', data: { count: 'two' } }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'T0002',
  )
  await app.as(maya).call('asker.approve', { run, step: 'question 1.1', data: { count: 2 } })
  assert.deepEqual(await app.runs.wait(run), { text: 'You said {"count":2}.' })
})
