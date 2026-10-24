import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { TestApp } from '../../test/index.ts'
import { evals, judge, testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

/** A step of a run as `app.runs.read` shows it. */
interface Shown {
  name: string
  state: string
  result?: unknown
}

/** A test app of the desk, whose models that decide, score and sort are served by a provider of its own. */
async function decisions(t: test.TestContext): Promise<{ app: TestApp; maya: Caller }> {
  const app = await testApp({ folder: copyOf(t, 'decided') })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

/** Waits until a person can read a score of a run in the table that shows the scores, and answers it. */
async function scoreOf(app: TestApp, run: string, as: Caller): Promise<Record<string, unknown> | undefined> {
  for (let i = 0; i < 300; i++) {
    const rows: unknown = await app.read({ from: 'ratings' }, { as })
    const found = (Array.isArray(rows) ? rows : []).map(Object).find((row) => row.run === run && row.kind === 'score')
    if (found) return found
    await new Promise((done) => setTimeout(done, 10))
  }
  return undefined
}

/** The steps of a run. */
const stepsOf = (app: TestApp, run: string): Shown[] => (app.runs.read(run)?.steps ?? []).map((one) => Object(one))

/** What the engine counted for one model, by unit, read as the system. */
async function countedFor(app: TestApp, model: string): Promise<Record<string, number>> {
  const rows: unknown = await app.read({ from: 'usage', where: { col: 'name', is: model } }, { as: 'system' })
  const sums: Record<string, number> = {}
  for (const row of Array.isArray(rows) ? rows.map(Object) : [])
    sums[String(row.unit)] = (sums[String(row.unit)] ?? 0) + Number(row.amount)
  return sums
}

test('[47-10] a model that decides, declared with its own input and output, is a guard as a judge: it is a step of the run, counted, and refuses', async (t) => {
  const { app, maya } = await decisions(t)
  app.fake('writer', [{ text: 'Glad to help, kindly.' }])
  const passed = notDropped(await app.start('desk', { message: 'Hello.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(passed.run), { text: 'Glad to help, kindly.' })
  assert.equal(stepsOf(app, passed.run).find((one) => one.name === 'guard in 1 gate')?.state, 'done')
  const refused = notDropped(await app.start('desk', { message: 'Say forbidden things.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(refused.run), { text: 'Not here.' })
  assert.equal(stepsOf(app, refused.run).find((one) => one.name === 'guard in 1 gate')?.state, 'failed')
  const counted = await countedFor(app, 'gate')
  assert.equal(counted.calls, 2)
  assert.equal(counted.decisions, 2)
})

test('[47-10] the same model is faked in a test as every model is', async (t) => {
  const { app, maya } = await decisions(t)
  app.fake('writer', [{ text: 'Fine.' }])
  const gate = app.fake('gate', { call: () => ({ score: 0, why: 'faked' }) })
  const { run } = notDropped(await app.start('desk', { message: 'Hello.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Not here.' })
  assert.deepEqual(gate.sent, [
    { call: 'call', input: { task: 'Hello.', answer: 'Hello.', rule: 'Holds no forbidden words' } },
  ])
})

test('[47-10] a model that scores is a judge: of the share of runs that are scored, and of a case', async (t) => {
  const { app, maya } = await decisions(t)
  app.fake('writer', [{ text: 'Glad to help, kindly.' }, { text: 'No.' }])
  const { run } = notDropped(await app.start('desk', { message: 'Hello.' }, { as: maya }))
  await app.runs.wait(run)
  const scored = await scoreOf(app, run, maya)
  assert.deepEqual([scored?.score, scored?.why], [0.9, 'scored'])
  assert.equal((await countedFor(app, 'scorer')).calls, 1)
  const result = await evals(app, 'desk', [{ say: 'Hello again.', expect: judge('scorer', 'Answers kindly') }], {
    as: maya,
  })
  assert.deepEqual([result.passed, result.failed], [0, 1], 'the answer "No." is not kind')
})

test('[47-10] a model that sorts is a tool of an agent: it is offered with its input, called in a step, and its output is the answer', async (t) => {
  const { app, maya } = await decisions(t)
  const tools: unknown[] = []
  app.fake('writer', (request) => {
    tools.push(...(request.tools ?? []).map((one) => one.name))
    const last = request.messages.at(-1)
    if (last?.who === 'user') return { calls: [{ tool: 'sorter', with: { message: 'I want a refund.' } }] }
    return { text: `It is a ${String(Reflect.get(Object(last?.result), 'kind'))}.` }
  })
  const { run } = notDropped(await app.start('desk', { message: 'Money back, please.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'It is a refund.' })
  assert.ok(tools.includes('sorter'))
  assert.deepEqual(stepsOf(app, run).find((one) => one.name === 'tool 1.1 sorter')?.result, { kind: 'refund' })
  assert.equal((await countedFor(app, 'sorter')).calls, 1)
})
