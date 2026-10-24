import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { lockedTool } from '../../connect/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import type { Stand, StandTool } from './outsideServer.ts'
import { outsideServer } from './outsideServer.ts'
import { closing, copyOf } from './projects.ts'
import { untilWithin } from './remotes.ts'
import { notDropped } from './started.ts'

/** A tool of the stand-in, by its name, with an input of one text. */
const toolOf = (name: string): StandTool => ({
  name,
  description: `The tool ${name}`,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

/**
 * The project of the outside servers with the board at its stand-in, its tools in the lock, and two agents that
 * write sequences: one that trusts the board, and one that does not.
 */
function sequenceApp(t: TestContext, board: Stand): Promise<TestApp> {
  const folder = copyOf(t, 'outsided')
  const services = join(folder, 'services.ts')
  writeFileSync(services, readFileSync(services, 'utf8').replaceAll('http://127.0.0.1:1', board.remote.origin))
  const tools = Object.fromEntries(
    board.tools.map((one) => [
      one.name,
      lockedTool({ name: one.name, about: one.description, schema: one.inputSchema }),
    ]),
  )
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify({ board: { tools } }, null, 2)}\n`)
  appendFileSync(
    join(folder, 'functions.ts'),
    [
      '',
      "const sequenced = { model: writer, instructions: 'Use the tools.', tools: [board], access: 'signedIn' as const, sequence: true as const, limits: { steps: 6, perRun: { tokensOut: 20000 } } }",
      "export const sequencer = agent('sequencer', { ...sequenced, about: 'Calls the board in a sequence', trust: [board] })",
      "export const askingSequencer = agent('askingSequencer', { ...sequenced, about: 'Calls the board in a sequence, and asks first' })",
      '',
    ].join('\n'),
  )
  return testApp({ folder, real: ['board'] }).then((app) => {
    closing(t, () => app.close())
    return app
  })
}

/** A model that writes one sequence, which calls the board's tool `find` by its name, and then tells what it gave. */
const sequencing = (request: ReplyRequest) => {
  const last = request.messages.at(-1)
  // The model names the tool as the run tells it, the name of its service and of the tool.
  const told = 'board.find'
  if (last?.who === 'user')
    return { calls: [{ tool: 'sequence', with: { run: `return call('${told}', { words: 'tea' })` } }] }
  const answer = request.messages.findLast((one) => one.who === 'tool')
  return { text: `Told: ${JSON.stringify(answer?.result ?? answer?.error ?? null)}` }
}

test('[27-18] [25-11] a sequence calls a tool of an outside server like any tool, under the same trust and the same asks', async (t) => {
  const board = await outsideServer(t, {
    tools: [toolOf('find')],
    answer: () => ({ content: [{ type: 'text', text: 'found three' }] }),
  })
  const app = await sequenceApp(t, board)
  app.fake('writer', sequencing)
  const ada = await app.user({ name: 'Ada', roles: [] })
  // Trusted, the tool is called at once, and its answer reaches the model.
  const trusted = notDropped(await app.start('sequencer', { message: 'Go.' }, { as: ada }))
  assert.match(String(Object(await app.runs.wait(trusted.run)).text), /found three/)
  const calls = () => board.asked.filter((one) => one.method === 'tools/call')
  assert.equal(calls().length, 1)
  assert.deepEqual(Object(calls()[0]?.params.arguments), { words: 'tea' })
  // Not trusted, the sequence waits for the person before the tool is called, as the tool alone would.
  const asking = notDropped(await app.start('askingSequencer', { message: 'Go.' }, { as: ada }))
  let waiting: Record<string, unknown> | undefined
  await untilWithin('the run waits for the person', () => {
    waiting = (app.runs.read(asking.run)?.steps ?? []).map(Object).find((one) => one.state === 'waiting')
    return waiting !== undefined
  })
  assert.equal(calls().length, 1, 'nothing was called before the yes')
  app.runs.approve(asking.run, String(waiting?.name))
  assert.match(String(Object(await app.runs.wait(asking.run)).text), /found three/)
  assert.equal(calls().length, 2)
})
