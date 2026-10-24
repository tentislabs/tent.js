import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import type { ReplyRequest } from '../index.ts'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf, workFolder } from './projects.ts'
import { notDropped } from './started.ts'

/** A test app of the project of the tools that are runs, with a user. */
async function nested(t: test.TestContext): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>> }> {
  const app = await testApp({ folder: copyOf(t, 'nested') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

/** The input a model gives a tool by its name: a number to a flow, a message to an agent. */
const inputOf = (tool: string): unknown => (tool === 'tally' ? { n: 1 } : { message: 'Go on.' })

/**
 * A faked model that asks for every tool it is handed, once, when a person spoke last, and else answers what the
 * tools answered. Where `again` holds it asks for its tools after every answer.
 */
const askingAll =
  (again = false) =>
  (request: ReplyRequest) => {
    const last = request.messages.at(-1)
    const tools = request.tools ?? []
    if (tools.length && (last?.who === 'user' || again))
      return { calls: tools.map((one, i) => ({ id: `c${i}`, tool: one.name, with: inputOf(one.name) })) }
    const answers = request.messages.filter((one) => one.who === 'tool')
    return { text: JSON.stringify(answers.map((one) => one.error ?? one.result)) }
  }

/** The code and the fields that a promise was refused with, or `ok`. */
const refusal = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => 'ok',
    (error: unknown) => [Reflect.get(Object(error), 'code'), Reflect.get(Object(error), 'fields')],
  )

test('[27-10] a flow and an agent as tools are each a run of their own, which can be read step by step', async (t) => {
  const { app, maya } = await nested(t)
  app.fake('writer', askingAll())
  const { run } = notDropped(await app.start('outer', { message: 'Ask them.' }, { as: maya }))
  const answer = String(Reflect.get(Object(await app.runs.wait(run)), 'text'))
  assert.deepEqual(JSON.parse(answer), [2, { text: '[2]' }])
  const called = await app.runs.find({ top: run, of: 'all' })
  const byFlow = Object.fromEntries(called.filter((one) => one.id !== run).map((one) => [one.flow, one.id]))
  assert.deepEqual(Object.keys(byFlow).sort(), ['inner', 'tally'])
  const stepsOf = (id: string): string[] => (app.runs.read(id)?.steps ?? []).map((one) => `${one.name}:${one.state}`)
  assert.deepEqual(stepsOf(byFlow.tally), ['add:done'])
  assert.deepEqual(stepsOf(byFlow.inner), ['model 1:done', 'tool 1.1 tally:done', 'model 2:done'])
})

test("[27-10] the caller's perRun stops both the caller and the agent it called", async (t) => {
  const { app, maya } = await nested(t)
  app.fake('writer', askingAll(true))
  const { run } = notDropped(await app.start('capped', { message: 'Ask.' }, { as: maya }))
  assert.deepEqual(await refusal(app.runs.wait(run)), ['T7102', { limit: 'perRun', unit: 'calls' }])
  const [inner] = (await app.runs.find({ top: run, of: 'all' })).filter((one) => one.flow === 'inner')
  assert.ok(inner)
  assert.deepEqual(await refusal(app.runs.wait(inner.id)), ['T7102', { limit: 'perRun', unit: 'calls' }])
})

test('[27-10] a fourth level of agents gives T5105', async (t) => {
  const { app, maya } = await nested(t)
  app.fake('writer', askingAll())
  const { run } = notDropped(await app.start('first', { message: 'Go down.' }, { as: maya }))
  await app.runs.wait(run)
  const [third] = (await app.runs.find({ top: run, of: 'all' })).filter((one) => one.flow === 'third')
  assert.ok(third)
  const step = (app.runs.read(third.id)?.steps ?? []).find((one) => one.name === 'tool 1.1 fourth')
  assert.equal(Reflect.get(Object(Reflect.get(Object(step), 'error')), 'code'), 'T5105')
  assert.equal((await app.runs.find({ top: run, of: 'all' })).filter((one) => one.flow === 'fourth').length, 0)
})

test('[27-10] the program killed while the caller waits for the agent it called starts no second run', async (t) => {
  const folder = workFolder(t)
  const killed = await runKilled(join(import.meta.dirname, 'killed', 'nested.ts'), {
    times: 1,
    when: 'waiting',
    seed: 2710,
    args: [copyOf(t, 'nested'), join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told')],
  })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /^ended: \{"answer":\{"text":"\[\{\\"text\\":\\"inside\\"\}\]"\},"inner":1\}$/m)
})
