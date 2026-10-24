import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { TestApp } from '../../test/index.ts'
import { testApp } from '../../test/index.ts'
import { eventsOf } from '../../connect/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

// What the agents and the providers owe that no other test holds: each fails while the code does otherwise.

// The tools and the agents of these tests, added to the definitions of the project of the limits.
const small = `
export const longWord = query('longWord', {
  about: 'Gives a long word',
  access: 'signedIn',
  input: { word: text({ optional: true }) },
  output: text(),
  run: () => 'x'.repeat(LENGTH),
})

export const smallResult = agent('smallResult', {
  model: writer, instructions: 'You help.', tools: [longWord], access: 'signedIn',
  limits: { steps: 5, perRun: { calls: 100 }, result: 300 },
})

// A tool that fails its first call as a server that is down does, and answers the next.
let flakyCalls = 0
export const flaky = action('flaky', {
  about: 'Fails once, then answers',
  access: 'signedIn',
  input: { word: text({ optional: true }) },
  output: text(),
  sends: false,
  run: () => {
    flakyCalls++
    if (flakyCalls === 1) throw new Error('The server is down for a moment.')
    return 'ok'
  },
})

export const triesTwice = agent('triesTwice', {
  model: writer, instructions: 'You help.', tools: [{ tool: flaky, tries: 2 }], access: 'signedIn',
  limits: { steps: 5, perRun: { calls: 100 } },
})

export const savedNotes = agent('savedNotes', {
  model: writer, instructions: 'You help.', tools: [], access: 'signedIn', reasoning: { save: true },
  limits: { steps: 5, perRun: { calls: 100 }, result: 300 },
})
`

/** A test app of the project of the limits with these added, and a user who may start its agents. */
async function smallOnes(
  t: test.TestContext,
  length = 2000,
): Promise<{ app: TestApp; maya: Awaited<ReturnType<TestApp['user']>> }> {
  const folder = copyOf(t, 'limited')
  appendFileSync(join(folder, 'functions.ts'), small.replace('LENGTH', String(length)))
  const app = await testApp({ folder })
  t.after(() => app.close())
  return { app, maya: await app.user({ name: 'Maya', roles: [] }) }
}

/** The answer of the tool as the second model step was handed it. */
function toolAnswer(sent: { input: unknown }[]): unknown {
  const second = Object(sent[1]?.input)
  const messages: unknown[] = Array.isArray(second.messages) ? second.messages : []
  return messages.find((one) => Reflect.get(Object(one), 'who') === 'tool')
}

test('[27-3] a tool answer past the limits.result of the agent reaches the model as Error T5102: the answer was too large', async (t) => {
  const { app, maya } = await smallOnes(t)
  const faked = app.fake('writer', [{ calls: [{ tool: 'longWord' }] }, { text: 'Done.' }])
  assert.deepEqual(await app.as(maya).call('smallResult', { message: 'Go.' }), { text: 'Done.' })
  // An answer over the limit of a step's result is told to the model as an error, in the engine's own words.
  const told = toolAnswer(faked.sent)
  assert.equal(Reflect.get(Object(told), 'error'), 'Error T5102: the answer was too large')
  assert.equal(Reflect.get(Object(told), 'result'), undefined)
})

test('[27-3] a tool answer under the limits.result of the agent reaches the model whole', async (t) => {
  const { app, maya } = await smallOnes(t, 20)
  const faked = app.fake('writer', [{ calls: [{ tool: 'longWord' }] }, { text: 'Done.' }])
  assert.deepEqual(await app.as(maya).call('smallResult', { message: 'Go.' }), { text: 'Done.' })
  assert.equal(Reflect.get(Object(toolAnswer(faked.sent)), 'result'), 'x'.repeat(20))
})

test('[27-15] saved reasoning that would pass limits.result of the agent is left out of the model step first, and marked as left out', async (t) => {
  const { app, maya } = await smallOnes(t)
  app.fake('writer', [{ text: 'Done.', reasoning: 'n'.repeat(2000) }])
  const { run } = notDropped(await app.start('savedNotes', { message: 'Go.' }, { as: maya }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Done.' })
  const step = (app.runs.read(run)?.steps ?? []).find((one) => one.name === 'model 1')
  assert.equal(step?.state, 'done')
  // A model step is held to `limits.result` as every step is: where it would pass it, its saved reasoning goes first.
  assert.ok(JSON.stringify(step?.result).length <= 300, 'the saved result is held to limits.result')
  assert.equal(Reflect.get(Object(step?.result), 'reasoning'), undefined)
})

test('[27-2] a tool that states tries: 2 and fails once with a server error is made twice at once, and the model hears of no failure', async (t) => {
  const { app, maya } = await smallOnes(t)
  const faked = app.fake('writer', [{ calls: [{ tool: 'flaky' }] }, { text: 'Done.' }])
  const { run } = notDropped(await app.start('triesTwice', { message: 'Go.' }, { as: maya }))
  // The second try is made at once, with no wait between the two: the run has ended well within three seconds.
  for (let waited = 0; waited < 3000 && app.runs.read(run)?.state !== 'done'; waited += 20)
    await new Promise((done) => setTimeout(done, 20))
  const steps = (app.runs.read(run)?.steps ?? []).map((one) => `${one.name}:${one.state}`)
  assert.deepEqual(steps, ['model 1:done', 'tool 1.1 flaky:done', 'model 2:done'])
  assert.equal(Reflect.get(Object(toolAnswer(faked.sent)), 'result'), 'ok')
})

test('[26-2] a line break of CR and LF that two pieces of a stream split is one line break, and ends no event', async () => {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(line) {
      line.enqueue(encoder.encode('data: a\r'))
      line.enqueue(encoder.encode('\ndata: b\r\n\r\n'))
      line.close()
    },
  })
  const events: string[] = []
  for await (const event of eventsOf(body)) events.push(event.data)
  // One event, whose two lines of data are joined by a line feed: the CR and the LF are one end of a line.
  assert.deepEqual(events, ['a\nb'])
})
