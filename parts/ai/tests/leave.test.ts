import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A step of a run as `app.runs.read` shows it. */
interface Shown {
  name: string
  state: string
  show?: unknown
  error?: unknown
}

/** A test app of the project of what a tool call may do, a user, and the fake of the payments. */
async function guarded(
  t: test.TestContext,
): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>>; paid: ReturnType<TestApp['fake']> }> {
  const app = await testApp({ folder: copyOf(t, 'guarded') })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const paid = app.fake('payments', { pay: () => ({ id: 'p1' }) })
  return { app, maya, paid }
}

/** A faked model that asks for one tool when a person spoke last, and else answers what the tool answered. */
const oneTool =
  (tool: string, input: unknown = {}) =>
  (request: ReplyRequest) => {
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool, with: input }] }
    return { text: `Done: ${JSON.stringify(last?.error ?? last?.result ?? null)}` }
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

/** Waits until a test holds, a while at most. */
async function until(holds: () => boolean | Promise<boolean>): Promise<void> {
  for (let tries = 0; tries < 500 && !(await holds()); tries++) await new Promise((done) => setTimeout(done, 10))
}

test('[27-8] a tool that states danger: ask waits, a tool that sends waits unless trust names it, and an agreed tool that asks and pays asks no second time', async (t) => {
  const { app, maya, paid } = await guarded(t)
  app.fake('writer', oneTool('riskyPay', { amount: 5 }))
  const risky = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  assert.equal((await waiting(app, risky.run))?.name, 'ask 1.1')
  assert.equal(paid.sent.length, 0)
  app.runs.approve(risky.run, 'ask 1.1')
  assert.deepEqual(await app.runs.wait(risky.run), { text: 'Done: "paid"' })
  assert.equal(paid.sent.length, 1)
  app.fake('writer', oneTool('payDirect', { amount: 5 }))
  const direct = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  assert.equal((await waiting(app, direct.run))?.name, 'ask 1.1')
  app.fake('writer', oneTool('trustedPay', { amount: 5 }))
  const trusted = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(trusted.run), { text: 'Done: "paid"' })
  assert.equal(paid.sent.length, 2)
})

test('[27-8] an action that states sends: false and pays is stopped before the request, asked about by the name of the call, and pays once after the yes', async (t) => {
  const { app, maya, paid } = await guarded(t)
  app.fake('writer', oneTool('quietPay', { amount: 7 }))
  const { run } = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  const step = await waiting(app, run)
  assert.equal(step?.name, 'tool 1.1 quietPay')
  assert.deepEqual(step?.show, { call: 'payments.pay' })
  assert.equal(paid.sent.length, 0)
  app.runs.approve(run, 'tool 1.1 quietPay')
  assert.deepEqual(await app.runs.wait(run), { text: 'Done: "paid"' })
  assert.equal(paid.sent.length, 1)
})

test('[27-8] a second call of the step is asked about too, a yes sent twice agrees to nothing of it, and the mail of the first is not sent again', async (t) => {
  const { app, maya, paid } = await guarded(t)
  app.fake('writer', oneTool('mailThenPay', { amount: 7 }))
  const { run } = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  assert.deepEqual((await waiting(app, run))?.show, { call: 'mail.send' })
  assert.equal(app.mailbox.length, 0)
  app.runs.approve(run, 'tool 1.1 mailThenPay', undefined, { n: 1 })
  await until(() =>
    Boolean(
      stepsOf(app, run).find(
        (one) => one.state === 'waiting' && Reflect.get(Object(one.show), 'call') === 'payments.pay',
      ),
    ),
  )
  assert.deepEqual((await waiting(app, run))?.show, { call: 'payments.pay' })
  assert.equal(app.mailbox.length, 1)
  assert.equal(paid.sent.length, 0)
  assert.throws(() => app.runs.approve(run, 'tool 1.1 mailThenPay', undefined, { n: 1 }), { code: 'T0002' })
  app.runs.approve(run, 'tool 1.1 mailThenPay', undefined, { n: 2 })
  assert.deepEqual(await app.runs.wait(run), { text: 'Done: "done"' })
  assert.equal(app.mailbox.length, 1)
  assert.equal(paid.sent.length, 1)
})

test('[27-8] an agreed start of a flow that sends lets that flow send', async (t) => {
  const { app, maya } = await guarded(t)
  app.fake('writer', oneTool('startSender'))
  const { run } = notDropped(await app.start('guard', { message: 'Mail.' }, { as: maya }))
  assert.equal((await waiting(app, run))?.name, 'ask 1.1')
  app.runs.approve(run, 'ask 1.1')
  await app.runs.wait(run)
  await until(() => app.mailbox.length > 0)
  assert.equal(app.mailbox.length, 1)
})

test('[27-8] a no, and the end of limits.ask, tell the model that the person refused', async (t) => {
  const { app, maya, paid } = await guarded(t)
  const told: ReplyRequest[] = []
  const tool = oneTool('payDirect', { amount: 5 })
  app.fake('writer', (request) => {
    told.push(request)
    return tool(request)
  })
  const first = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  await waiting(app, first.run)
  app.runs.refuse(first.run, 'ask 1.1')
  const answer = String(Reflect.get(Object(await app.runs.wait(first.run)), 'text'))
  assert.match(answer, /refused/)
  const second = notDropped(await app.start('guard', { message: 'Pay.' }, { as: maya }))
  await waiting(app, second.run)
  app.clock.advance('2 minutes')
  const late = String(Reflect.get(Object(await app.runs.wait(second.run)), 'text'))
  assert.match(late, /refused/)
  assert.equal(paid.sent.length, 0)
})

test('[27-8] a change that asks, reached inside a flow tool that nobody agreed to, is asked about, and runs unasked inside one a person agreed to', async (t) => {
  const { app, maya } = await guarded(t)
  app.fake('writer', oneTool('tidy'))
  const { run } = notDropped(await app.start('guard', { message: 'Tidy.' }, { as: maya }))
  let inner: { run: string; step: Shown } | undefined
  await until(async () => {
    for (const one of await app.runs.find({ flow: 'tidy', of: 'all' })) {
      const step = stepsOf(app, one.id).find((s) => s.state === 'waiting')
      if (step) inner = { run: one.id, step }
    }
    return inner !== undefined
  })
  assert.deepEqual(inner?.step.show, { call: 'wipe' })
  assert.equal((await app.rows('notes')).length, 0)
  if (inner) app.runs.approve(inner.run, inner.step.name)
  assert.deepEqual(await app.runs.wait(run), { text: 'Done: "tidy"' })
  assert.equal((await app.rows('notes')).length, 1)
  app.fake('writer', oneTool('tidyAsked'))
  const asked = notDropped(await app.start('guard', { message: 'Tidy.' }, { as: maya }))
  assert.equal((await waiting(app, asked.run))?.name, 'ask 1.1')
  app.runs.approve(asked.run, 'ask 1.1')
  assert.deepEqual(await app.runs.wait(asked.run), { text: 'Done: "tidy"' })
  assert.equal((await app.rows('notes')).length, 2)
})

test('[27-8] a flow that a write of a tool set off, and that meets a refused call later, fails its step with T7111 and asks nobody', async (t) => {
  const { app, maya, paid } = await guarded(t)
  app.fake('writer', oneTool('addNote', { words: 'hello' }))
  const { run } = notDropped(await app.start('guard', { message: 'Note.' }, { as: maya }))
  await app.runs.wait(run)
  let failed: Shown | undefined
  await until(async () => {
    const [set] = await app.runs.find({ flow: 'onNote', of: 'all' })
    failed = set ? stepsOf(app, set.id).find((one) => one.state === 'failed') : undefined
    return failed !== undefined
  })
  assert.equal(Reflect.get(Object(failed?.error), 'code'), 'T7111')
  assert.equal(paid.sent.length, 0)
})

test('[27-8] a change tool that the description shows to set off a flow that sends is asked about before it runs; one it does not show it for is stopped before it writes, and after the yes writes once and the flow sends', async (t) => {
  const { app, maya } = await guarded(t)
  app.fake('writer', oneTool('addLetter', { words: 'one' }))
  const shown = notDropped(await app.start('guard', { message: 'Write.' }, { as: maya }))
  assert.equal((await waiting(app, shown.run))?.name, 'ask 1.1')
  assert.equal((await app.rows('letters')).length, 0)
  app.runs.stop(shown.run)
  app.fake('writer', oneTool('addLetterQuietly', { words: 'two' }))
  const quiet = notDropped(await app.start('guard', { message: 'Write.' }, { as: maya }))
  const step = await waiting(app, quiet.run)
  assert.deepEqual(step?.show, { call: 'onLetter' })
  assert.equal((await app.rows('letters')).length, 0)
  app.runs.approve(quiet.run, 'tool 1.1 addLetterQuietly')
  await app.runs.wait(quiet.run)
  assert.equal((await app.rows('letters')).length, 1)
  await until(() => app.mailbox.length > 0)
  assert.equal(app.mailbox.length, 1)
})

test('[27-8] what the model gives a flow tool that does not fit its input is answered T0002', async (t) => {
  const { app, maya } = await guarded(t)
  app.fake('writer', oneTool('noteFlow', { words: 5 }))
  const answer = String(Reflect.get(Object(await app.as(maya).call('guard', { message: 'Note.' })), 'text'))
  assert.match(answer, /T0002/)
  assert.equal((await app.rows('notes')).length, 0)
})
