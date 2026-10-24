import assert from 'node:assert/strict'
import test from 'node:test'
import type { FakeAnswer, TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** The code and the fields that a promise was refused with, or `ok`. */
const refusal = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => 'ok',
    (error: unknown) => [Reflect.get(Object(error), 'code'), Reflect.get(Object(error), 'fields')],
  )

/** A faked model that asks for one look-up in every answer, and reports what it used. */
const loops = (units?: Record<string, number>) => (): FakeAnswer => ({
  text: 'Looking.',
  calls: [{ tool: 'lookUp', with: { word: 'tent' } }],
  ...(units ? { units } : {}),
})

/** A test app of the project of the limits, with a user who may start its agents. */
async function limited(t: test.TestContext): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>> }> {
  const app = await testApp({ folder: copyOf(t, 'limited') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

test('[27-3] steps end a run with T7102 before the next call', async (t) => {
  const { app, maya } = await limited(t)
  const faked = app.fake('writer', loops())
  assert.deepEqual(await refusal(app.as(maya).call('stepper', { message: 'Go.' })), [
    'T7102',
    { limit: 'steps', unit: 'steps' },
  ])
  assert.equal(faked.sent.length, 2)
})

test('[27-3] an agent that states no limits is ended by no number of calls to its model', async (t) => {
  const { app, maya } = await limited(t)
  // Twenty answers that each ask for the tool, more than the twelve a run was once given unasked, then one that is done.
  let asked = 0
  const faked = app.fake('writer', (): FakeAnswer => {
    asked += 1
    return asked <= 20 ? loops()() : { text: 'Done.' }
  })
  assert.equal(await refusal(app.as(maya).call('unlimited', { message: 'Go.' })), 'ok')
  assert.equal(faked.sent.length, 21)
})

test('[27-3] time ends a run with T7102 before the next call', async (t) => {
  const { app, maya } = await limited(t)
  app.fake('writer', loops())
  assert.deepEqual(await refusal(app.as(maya).call('short', { message: 'Go.' })), [
    'T7102',
    { limit: 'time', unit: 'ms' },
  ])
})

test('[27-3] perRun ends a run at the first call after the limit was passed, and with two units it names the one that was passed', async (t) => {
  const { app, maya } = await limited(t)
  const faked = app.fake('writer', loops({ tokensIn: 1, tokensOut: 6 }))
  assert.deepEqual(await refusal(app.as(maya).call('budget', { message: 'Go.' })), [
    'T7102',
    { limit: 'perRun', unit: 'tokensOut' },
  ])
  // Six and six passed ten: the third call was not made.
  assert.equal(faked.sent.length, 2)
  app.fake('writer', loops({ tokensIn: 60, tokensOut: 1 }))
  assert.deepEqual(await refusal(app.as(maya).call('twoUnits', { message: 'Go.' })), [
    'T7102',
    { limit: 'perRun', unit: 'tokensIn' },
  ])
})

test('[27-13] a forced loop is stopped by perRun at the first call after the limit was passed', async (t) => {
  const { app, maya } = await limited(t)
  // Each answer asks for the tool again, and writes ten tokens: past twenty-five after the third.
  const faked = app.fake('writer', loops({ tokensOut: 10 }))
  assert.deepEqual(await refusal(app.as(maya).call('loop', { message: 'Go.' })), [
    'T7102',
    { limit: 'perRun', unit: 'tokensOut' },
  ])
  assert.equal(faked.sent.length, 3)
})

test('[27-3] perRun of calls ends the run before the fourth call of a model that reports no number at all', async (t) => {
  const { app, maya } = await limited(t)
  const faked = app.fake('writer', loops())
  assert.deepEqual(await refusal(app.as(maya).call('threeCalls', { message: 'Go.' })), [
    'T7102',
    { limit: 'perRun', unit: 'calls' },
  ])
  assert.equal(faked.sent.length, 3)
})

test('[27-3] one tool call more than toolCalls ends the run, and the tools of one answer run toolsAtOnce at a time', async (t) => {
  const { app, maya } = await limited(t)
  app.fake('writer', () => ({ calls: [1, 2, 3].map((n) => ({ tool: 'slowly', with: { n } })) }))
  assert.deepEqual(await refusal(app.as(maya).call('fewTools', { message: 'Go.' })), [
    'T7102',
    { limit: 'toolCalls', unit: 'calls' },
  ])
  let round = 0
  app.fake('writer', () =>
    round++ === 0 ? { calls: [1, 2, 3].map((n) => ({ tool: 'slowly', with: { n } })) } : { text: 'Done.' },
  )
  const { run } = notDropped(await app.start('oneAtOnce', { message: 'Go.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Done.' })
  const results = (app.runs.read(run)?.steps ?? [])
    .filter((one) => one.name.startsWith('tool '))
    .map((one) => one.result)
  assert.equal(results.length, 3)
  assert.equal(Math.max(...results.map((one) => Number(Reflect.get(Object(one), 'most')))), 1)
})

test('[27-3] with together: { max: 1 } a second run waits its turn', async (t) => {
  const { app, maya } = await limited(t)
  let release = (): void => undefined
  const held = new Promise<void>((done) => {
    release = done
  })
  let asked = 0
  app.fake('writer', async () => {
    asked++
    if (asked === 1) await held
    return { text: `Answer ${asked}.` }
  })
  const first = notDropped(await app.start('lonely', { message: 'One.' }, { as: maya }))
  const second = notDropped(await app.start('lonely', { message: 'Two.' }, { as: maya }))
  for (let tries = 0; asked === 0 && tries < 200; tries++) await new Promise((done) => setTimeout(done, 10))
  assert.equal(app.runs.read(second.run)?.state, 'queued')
  release()
  assert.deepEqual(await app.runs.wait(first.run), { text: 'Answer 1.' })
  assert.deepEqual(await app.runs.wait(second.run), { text: 'Answer 2.' })
})
