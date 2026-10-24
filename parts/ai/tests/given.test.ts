import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import type { ReplyRequest } from '../index.ts'
import type { FakeAnswer, TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf, workFolder } from './projects.ts'
import { notDropped } from './started.ts'

/** A test app of the project of what a program gives a run, with a user. */
async function sourced(t: test.TestContext): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>> }> {
  const app = await testApp({ folder: copyOf(t, 'sourced') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

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

test('[27-12] a source offered to the engine gives a run its tools, and after a restart the run finds them again', async (t) => {
  const folder = workFolder(t)
  const killed = await runKilled(join(import.meta.dirname, 'killed', 'sourced.ts'), {
    times: 1,
    when: 'saved model 1',
    seed: 2712,
    args: [copyOf(t, 'sourced'), join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told')],
  })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const found = /^ended: (.*)$/m.exec(again.out)
  assert.ok(found, again.out)
  const ended = JSON.parse(found[1])
  assert.deepEqual(ended.answer, { text: 'deskLookUp at one for system: tent' })
  assert.deepEqual(ended.steps, ['model 1:done', 'tool 1.1 deskLookUp:done', 'model 2:done'])
  // The tools of a source stand after the agent's own.
  assert.deepEqual(ended.handed, [['lookUp', 'deskLookUp']])
})

test('[27-12] a run whose source is not offered fails with T0001, and nothing a caller sends through the door names a source', async (t) => {
  const { app, maya } = await sourced(t)
  app.fake('writer', [{ text: 'Hello.' }])
  const { run } = notDropped(
    await app.start('counted', { message: 'Hi.' }, { as: maya, sources: [{ name: 'gone', context: {} }] }),
  )
  const [code] = Object(await refusal(app.runs.wait(run)))
  assert.equal(code, 'T0001')
  assert.equal(
    String(Reflect.get(Object(await app.runs.wait(run).catch((error: unknown) => error)), 'message')).includes('gone'),
    true,
  )
  const [refused] = Object(
    await refusal(app.as(maya).call('counted', { message: 'Hi.', sources: [{ name: 'gone', context: {} }] })),
  )
  assert.equal(refused, 'T0002')
})

test('[27-12] limits given to app.start make the limits of a run smaller and never larger', async (t) => {
  const { app, maya } = await sourced(t)
  const runOf = async (agent: string, limits: object, units?: Record<string, number>) => {
    const faked = app.fake('writer', loops(units))
    const { run } = notDropped(await app.start(agent, { message: 'Go.' }, { as: maya, limits }))
    return { refused: await refusal(app.runs.wait(run)), sent: faked.sent.length }
  }
  // A smaller `steps` holds, and a larger one does not.
  assert.deepEqual(await runOf('helper', { steps: 1 }), {
    refused: ['T7102', { limit: 'steps', unit: 'steps' }],
    sent: 1,
  })
  assert.deepEqual(await runOf('helper', { steps: 5 }), {
    refused: ['T7102', { limit: 'steps', unit: 'steps' }],
    sent: 2,
  })
  // Of a unit that both name in `perRun` the smaller holds.
  assert.deepEqual(await runOf('counted', { perRun: { calls: 2 } }), {
    refused: ['T7102', { limit: 'perRun', unit: 'calls' }],
    sent: 2,
  })
  assert.deepEqual(await runOf('counted', { perRun: { calls: 9 } }), {
    refused: ['T7102', { limit: 'perRun', unit: 'calls' }],
    sent: 3,
  })
  // A unit that the start alone names bounds the run, and one that the agent alone names still does.
  assert.deepEqual(await runOf('counted', { perRun: { tokensOut: 10 } }, { tokensOut: 6 }), {
    refused: ['T7102', { limit: 'perRun', unit: 'tokensOut' }],
    sent: 2,
  })
  assert.deepEqual(await runOf('counted', { perRun: { tokensOut: 1000 } }, { tokensOut: 6 }), {
    refused: ['T7102', { limit: 'perRun', unit: 'calls' }],
    sent: 3,
  })
})

test('[27-12] a driver made in engine.ts runs the agent that names it, with the env ours is made from', async (t) => {
  const { app, maya } = await sourced(t)
  const { run } = notDropped(await app.start('custom', { message: 'Go.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'mine: [] by claude-sonnet-5-5' })
  assert.deepEqual(
    (app.runs.read(run)?.steps ?? []).map((one) => `${one.name}:${one.state}`),
    ['look:done'],
  )
})

test('[27-12] an agent that names a driver nobody made stops the app from opening with T7114', async (t) => {
  await assert.rejects(testApp({ folder: copyOf(t, 'undriven') }), { code: 'T7114' })
})

test("[27-12] an entry of words reaches the model in place of the engine's own sentence", async (t) => {
  const { app, maya } = await sourced(t)
  const told: ReplyRequest[] = []
  app.fake('writer', (request) => {
    told.push(request)
    return request.messages.at(-1)?.who === 'user'
      ? { calls: [{ tool: 'payNow', with: {} }] }
      : { text: String(request.messages.at(-1)?.error) }
  })
  const { run } = notDropped(await app.start('polite', { message: 'Pay.' }, { as: maya }))
  for (let tries = 0; tries < 500 && app.runs.read(run)?.state !== 'waiting'; tries++)
    await new Promise((done) => setTimeout(done, 10))
  app.runs.refuse(run, 'ask 1.1')
  assert.deepEqual(await app.runs.wait(run), { text: 'The person said no, kindly.' })
})
