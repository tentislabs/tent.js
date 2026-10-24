import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../index.ts'
import type { Helped } from './helping.ts'
import { helped, oneTool } from './helping.ts'
import { notDropped } from './started.ts'

/** The code that a promise was refused with, or `ok`. */
const codeOf = (call: unknown): Promise<string> =>
  Promise.resolve(call).then(
    () => 'ok',
    (error: unknown) => String(Reflect.get(Object(error), 'code')),
  )

/** Waits until a test holds, a while at most. */
async function until(holds: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 500 && !(await holds()); tries++) await new Promise((done) => setTimeout(done, 10))
}

/** A step of a run, as `runs.read` shows it. */
interface Shown {
  name: string
  state: string
  repeat: number
}

const stepsOf = (app: App, run: string): Shown[] => (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** Starts the helper on a new conversation, as a caller, and answers the run and the conversation. */
async function started(h: Helped, as: Caller, message = 'Go.'): Promise<{ run: string; chat: string }> {
  const chat = String(Reflect.get(Object(await h.app.call('newChat', {}, { as })), 'id'))
  const { run } = notDropped(await h.app.start('helper', { message, thread: chat }, { as }))
  return { run, chat }
}

/** The run under a run that is of a flow, once it is there. */
async function under(app: App, top: string, flow: string): Promise<string> {
  let found = ''
  await until(async () => {
    const [one] = (await app.runs.find({ top, of: 'all' })).filter((run) => run.flow === flow)
    found = one?.id ?? ''
    return found !== ''
  })
  return found
}

test('[27-6] a run the caller did not start, a run of another agent, and a run of an ordinary flow are T0001', async (t) => {
  const h = await helped(t)
  h.say(oneTool('refund', { order: 'o1' }))
  const { run } = await started(h, h.maya)
  await until(() => stepsOf(h.app, run).some((one) => one.state === 'waiting'))
  const ask = { run, step: 'ask 1.1', repeat: 1, n: 1 }
  assert.equal(await codeOf(h.app.call('helper.approve', ask, { as: h.leo })), 'T0001')
  assert.equal(await codeOf(h.app.call('helper.refuse', ask, { as: h.leo })), 'T0001')
  assert.equal(await codeOf(h.app.call('helper.stop', { run }, { as: h.leo })), 'T0001')
  // A run of another agent is not found.
  const theirs = notDropped(await h.app.start('other', { message: 'Go.' }, { as: h.maya }))
  await until(() => stepsOf(h.app, theirs.run).some((one) => one.state === 'waiting'))
  assert.equal(await codeOf(h.app.call('helper.approve', { ...ask, run: theirs.run }, { as: h.maya })), 'T0001')
  const flow = notDropped(await h.app.start('plain', {}, { as: h.maya }))
  assert.equal(await codeOf(h.app.call('helper.stop', { run: flow.run }, { as: h.maya })), 'T0001')
  assert.equal(await codeOf(h.app.call('helper.approve', ask, { as: h.maya })), 'ok')
})

test('[27-6] a step that is not a waiting ask, an n that is not the ask that waits, and a repeat that is not the pass that waits, are T0002', async (t) => {
  const h = await helped(t)
  h.say(oneTool('tidy'))
  const { run } = await started(h, h.maya)
  const tidy = await under(h.app, run, 'tidy')
  await until(() => stepsOf(h.app, tidy).some((one) => one.state === 'waiting'))
  assert.equal(
    await codeOf(h.app.call('helper.approve', { run, step: 'model 1', repeat: 1, n: 1 }, { as: h.maya })),
    'T0002',
  )
  const ask = { run: tidy, step: 'mail', repeat: 1, n: 1 }
  assert.equal(await codeOf(h.app.call('helper.approve', { ...ask, n: 2 }, { as: h.maya })), 'T0002')
  assert.equal(await codeOf(h.app.call('helper.approve', { ...ask, repeat: 2 }, { as: h.maya })), 'T0002')
  // The starter of the top run answers an ask on demand of a flow that is a tool.
  assert.equal(await codeOf(h.app.call('helper.approve', ask, { as: h.maya })), 'ok')
  await until(() => stepsOf(h.app, tidy).some((one) => one.state === 'waiting' && one.repeat === 2))
  assert.equal(await codeOf(h.app.call('helper.approve', { ...ask, repeat: 2 }, { as: h.maya })), 'ok')
  assert.deepEqual(await h.app.runs.wait(run), { text: '"tidied"' })
})

test('[27-6] an ask of a called run is approved by the starter of the top run, and shown with the tool call of the top run it happened under', async (t) => {
  const h = await helped(t)
  h.say((request) => {
    const last = request.messages.at(-1)
    if (request.instructions === 'You refund.')
      return last?.who === 'user'
        ? { calls: [{ tool: 'refund', input: { order: 'o2' } }] }
        : { text: String(last?.result) }
    return last?.who === 'user'
      ? { calls: [{ tool: 'inner', input: { message: 'Refund o2.' } }] }
      : { text: JSON.stringify(last?.result) }
  })
  const { run, chat } = await started(h, h.maya)
  const inner = await under(h.app, run, 'inner')
  await until(() => stepsOf(h.app, inner).some((one) => one.state === 'waiting'))
  const working: unknown = await h.app.call('helper.working', { thread: chat }, { as: h.maya })
  const [entry] = Object(working)
  assert.deepEqual(entry.asks, [
    { run: inner, step: 'ask 1.1', repeat: 1, n: 1, tool: 'inner', input: { message: 'Refund o2.' } },
  ])
  assert.deepEqual(entry.under, [{ run: inner, tool: 'inner', state: 'waiting' }])
  assert.equal(
    await codeOf(h.app.call('helper.approve', { run: inner, step: 'ask 1.1', repeat: 1, n: 1 }, { as: h.leo })),
    'T0001',
  )
  // The agent that is called as a tool runs its own asking tool once the person agreed.
  await h.app.call('helper.approve', { run: inner, step: 'ask 1.1', repeat: 1, n: 1 }, { as: h.maya })
  assert.deepEqual(await h.app.runs.wait(run), { text: '{"text":"refunded o2"}' })
})

test('[27-6] a wait-for that a flow tool made for itself is T0002', async (t) => {
  const h = await helped(t)
  h.say(oneTool('selfWait'))
  const { run } = await started(h, h.maya)
  const waits = await under(h.app, run, 'selfWait')
  await until(() => stepsOf(h.app, waits).some((one) => one.state === 'waiting'))
  assert.equal(
    await codeOf(h.app.call('helper.approve', { run: waits, step: 'go on', repeat: 1, n: 1 }, { as: h.maya })),
    'T0002',
  )
})

test('[27-6] a run that holds a conversation is stopped by another caller who may open it', async (t) => {
  const h = await helped(t)
  h.say(oneTool('refund', { order: 'o3' }))
  const { run, chat } = await started(h, h.maya)
  await until(() => stepsOf(h.app, run).some((one) => one.state === 'waiting'))
  assert.equal(await codeOf(h.app.call('helper.stop', { thread: chat }, { as: h.leo })), 'ok')
  assert.equal(await codeOf(h.app.runs.wait(run)), 'T5106')
})

test('[27-6] [05-2.4] [05-2.4@9a] a member of an agent that states no access is T0001, with the same answer as a name that is no function', async (t) => {
  const h = await helped(t)
  const named = await codeOf(h.app.call('nothing.working', {}, { as: h.maya }))
  assert.equal(await codeOf(h.app.call('closed.working', {}, { as: h.maya })), named)
  assert.equal(await codeOf(h.app.call('closed.stop', { run: 'x' }, { as: h.maya })), 'T0001')
})

test("[27-6] a visitor follows and approves their own run, and is refused another visitor's", async (t) => {
  const h = await helped(t)
  h.say(oneTool('refund', { order: 'o9' }))
  const call = async (name: string, input: object, cookie?: string) => {
    const answer = await h.app.request(
      new Request(`${h.origin}/_t/call/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: h.origin, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ input }),
      }),
    )
    const body = Object(await answer.json())
    return { body, cookie: (answer.headers.get('set-cookie') ?? '').split(';')[0] }
  }
  const started = await call('helper', { message: 'Refund o9.' })
  const run = String(Object(started.body.value).run)
  await until(() => stepsOf(h.app, run).some((one) => one.state === 'waiting'))
  const ask = { run, step: 'ask 1.1', repeat: 1, n: 1 }
  const stranger = await call('helper', { message: 'Hi.' })
  const refused = await call('helper.approve', ask, stranger.cookie)
  assert.equal(Object(refused.body.error).code, 'T0001')
  const working = await call('helper.working', { run }, started.cookie)
  assert.equal(Object(working.body.value)[0]?.run, run)
  const approved = await call('helper.approve', ask, started.cookie)
  assert.equal(approved.body.ok, true, JSON.stringify(approved.body))
  assert.deepEqual(await h.app.runs.wait(run), { text: '"refunded o9"' })
})
