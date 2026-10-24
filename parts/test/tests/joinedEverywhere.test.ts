import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { api } from './keyedApp.ts'
import { errorOf } from './mcpApp.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The project of one key started at every door, as a test app that is closed when the test ends. */
async function joining(t: test.TestContext): Promise<TestApp> {
  const app = await testApp({ folder: copyOf(t, 'joining') })
  closing(t, () => app.close())
  return app
}

/** Waits until something holds, and fails where it does not come to hold. */
async function until(holds: () => boolean | Promise<boolean>, what: string, within = 20_000): Promise<void> {
  const ends = performance.now() + within
  while (performance.now() < ends) {
    if (await holds()) return
    await new Promise<void>((next) => setTimeout(next, 5))
  }
  assert.fail(`it did not come to hold: ${what}`)
}

/** The run of a call that outlasted the time of an action: it is answered T0008 with its run. */
async function outlasted(work: Promise<unknown>): Promise<string> {
  const error: unknown = await work.then(
    () => undefined,
    (failed: unknown) => failed,
  )
  assert.equal(Object(error).code, 'T0008', String(error))
  return String(Object(Object(error).fields).run)
}

/** The run that a start made, where it was not dropped. */
function runOf(started: { run: string } | { dropped: true }): string {
  assert.ok('run' in started, 'the start was not dropped')
  return started.run
}

/** The marks that the work of the steps left, in their order. */
const marksOf = async (app: TestApp): Promise<string[]> =>
  [await app.call('allMarks', {}, system)].flat().map((row: unknown) => String(Object(row).what))

test("[46-9] one key started from a page, MCP and a model's tool call makes one run with `then: 'join'`, the line of the tool says a start may join, and the model is answered the run it joined", async (t) => {
  const app = await joining(t)
  const ada = await app.user({ email: 'ada@example.com' })
  app.fake('writer', [
    { text: 'Let me see to it.', calls: [{ tool: 'handle', with: { order: 'o1' } }] },
    { text: 'It is handled.' },
  ])
  // A page: the run waits an hour, so the call is answered its run once the time of an action has passed.
  const fromPage = await outlasted(app.as(ada).call('handle', { order: 'o1' }))
  // MCP: the same person, the same key, the same run.
  const fromMcp = await app.mcp({ as: ada }).call('handle', { order: 'o1' })
  assert.equal(errorOf(fromMcp).code, 'T0008')
  assert.equal(Object(errorOf(fromMcp).fields).run, fromPage)
  // A model's tool call, in a run of an agent that the same person started.
  const desk = runOf(await app.start('desk', { message: 'Handle order o1.' }, { as: ada }))
  await until(() => app.fake('writer').sent.length === 1, 'the model was asked, and called its tool')
  await until(
    () => app.runs.read(desk)?.steps.some((one) => one.state === 'started') === true,
    'the tool call waits for the run it joined',
  )
  assert.deepEqual(
    app.runs.find({ flow: 'handle' }).map((run) => [run.id, run.key, run.state]),
    [[fromPage, 'o1', 'waiting']],
    'one run of the key, whoever started it',
  )
  // The line of the tool tells the model that a start may join a run that is under way.
  const told = JSON.stringify(Object(app.fake('writer').sent[0]?.input).tools)
  assert.match(told, /under way/)

  app.clock.advance('2 hours')
  assert.deepEqual(await app.runs.wait(desk), { text: 'It is handled.' })
  // What the model was handed of its tool call is the answer of the run it joined.
  assert.match(JSON.stringify(app.fake('writer').sent[1]?.input), /handled.{0,8}o1/)
  assert.equal(app.runs.find({ flow: 'handle' }).length, 1)
})

test('[46-9] [46-10.1] from the API a key joins the run of a key that it started, and is refused T7103 for a run that another started', async (t) => {
  const app = await joining(t)
  const ada = await app.user({ email: 'ada@example.com' })
  const { key } = await app.key({ user: String(ada.user?.id), scopes: ['handle'] })
  const first = await api(app, 'POST', 'handle', { key, input: { order: 'o2' } })
  const second = await api(app, 'POST', 'handle', { key, input: { order: 'o2' } })
  assert.notEqual(first.status, 200, 'the run waits an hour')
  assert.equal(second.status, first.status)
  assert.equal(app.runs.find({ flow: 'handle', key: 'o2' }).length, 1, 'two starts of one key make one run')
  // A run that the person started on a page is theirs: a key is another starter, and is answered nothing of it.
  await outlasted(app.as(ada).call('handle', { order: 'o3' }))
  const other = await api(app, 'POST', 'handle', { key, input: { order: 'o3' } })
  assert.equal(other.status, 409)
  assert.match(JSON.stringify(other.body), /T7103/)
  assert.equal(app.runs.find({ flow: 'handle', key: 'o3' }).length, 1)
})

test('[46-9] an agent that states `pace` is paced: a second start within the hour is dropped, and `app.start` answers `{ dropped: true }`', async (t) => {
  const app = await joining(t)
  const ada = await app.user({ email: 'ada@example.com' })
  app.fake('writer', [{ text: 'Once.' }, { text: 'Twice.' }])
  const first = runOf(await app.start('once', { message: 'Hi.' }, { as: ada }))
  assert.deepEqual(await app.start('once', { message: 'Hi again.' }, { as: ada }), { dropped: true })
  assert.deepEqual(await app.runs.wait(first), { text: 'Once.' })
  assert.equal(app.runs.find({ flow: 'once' }).length, 1)
  app.clock.advance('2 hours')
  runOf(await app.start('once', { message: 'Hi, an hour on.' }, { as: ada }))
  assert.equal(app.runs.find({ flow: 'once' }).length, 2)
})

test('[46-9] an `onStop` of an agent runs once after its run is stopped, and `run.stopped` and `run.failed` are raised for the runs of agents', async (t) => {
  const app = await joining(t)
  const ada = await app.user({ email: 'ada@example.com' })
  app.fake('writer', [{ text: 'Let me see to it.', calls: [{ tool: 'handle', with: { order: 'o4' } }] }])
  const careful = runOf(await app.start('careful', { message: 'Handle order o4.' }, { as: ada }))
  await until(() => app.runs.find({ flow: 'handle' }).length === 1, 'its tool started the flow')
  app.runs.stop(careful)
  await until(async () => (await marksOf(app)).includes('careful stopped'), 'its onStop ran')
  await until(() => app.runs.read(careful)?.state === 'stopped', 'it ended stopped')
  await until(async () => (await marksOf(app)).includes('run.stopped careful'), 'run.stopped was heard')

  app.fake('writer', [{ fail: 'refused' }])
  const failing = runOf(await app.start('desk', { message: 'Fail.' }, { as: ada }))
  await until(() => app.runs.read(failing)?.state === 'failed', 'the run of the agent failed')
  await until(async () => (await marksOf(app)).includes('run.failed desk'), 'run.failed was heard')
  assert.equal((await marksOf(app)).filter((one) => one === 'careful stopped').length, 1, 'onStop ran once')
})
