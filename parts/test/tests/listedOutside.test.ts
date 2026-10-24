import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
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
import { notDropped } from './started.ts'

/** A tool of the board, with an input of one text. */
const toolOf = (name: string, description: string): StandTool => ({
  name,
  description,
  inputSchema: { type: 'object', properties: { words: { type: 'string' } } },
})

/** The stand-in of the board, which answers each tool with its name and what it was handed. */
const boardOf = (t: TestContext): Promise<Stand> =>
  outsideServer(t, {
    tools: [toolOf('listBoards', 'The boards of the team'), toolOf('addCard', 'Adds a card to the board')],
    answer: (name, input) => ({ content: [{ type: 'text', text: `${name} answered ${String(input.words ?? '')}` }] }),
  })

/** The project of the board, at its stand-in, with its tools approved in the lock, as a test app. */
async function boardApp(t: TestContext, board: Stand): Promise<TestApp> {
  const folder = copyOf(t, 'listedOutside')
  const file = join(folder, 'services.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace('http://127.0.0.1:1', board.remote.origin))
  const tools = Object.fromEntries(
    board.tools.map((one) => [
      one.name,
      lockedTool({ name: one.name, about: one.description, schema: one.inputSchema }),
    ]),
  )
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify({ board: { tools } }, null, 2)}\n`)
  const app = await testApp({ folder, real: ['board'] })
  closing(t, () => app.close())
  return app
}

/** The calls of `tools/call` that the stand-in was asked, each as its tool and what it was handed. */
const called = (board: Stand): unknown[] =>
  board.asked
    .filter((one) => one.method === 'tools/call')
    .map((one) => [one.params.name, Reflect.get(Object(one.params.arguments), 'words')])

test("[27-17@9b] with tell: 'list' a tool of an outside server stands in the list under its dotted name with its line, and a call of it by name is its step", async (t) => {
  const board = await boardOf(t)
  const app = await boardApp(t, board)
  const sent: ReplyRequest[] = []
  app.fake('writer', (request) => {
    sent.push(request)
    if (request.messages.at(-1)?.who === 'user')
      return { calls: [{ tool: 'call', with: { name: 'board.listBoards', input: { words: 'open' } } }] }
    return { text: `Told: ${String(request.messages.at(-1)?.result)}` }
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const { run } = notDropped(await app.start('lister', { message: 'Which boards?' }, { as: ada }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Told: listBoards answered open' })
  const instructions = String(sent[0]?.instructions)
  assert.match(instructions, /^board\.listBoards\(words\?: string\)$/m)
  assert.match(instructions, /^ {2}The boards of the team Sends data out\.$/m)
  assert.match(instructions, /^board\.addCard\(words\?: string\)$/m)
  assert.deepEqual(
    (sent[0]?.tools ?? []).map((one) => one.name),
    ['call'],
  )
  assert.ok((app.runs.read(run)?.steps ?? []).some((one) => one.name === 'tool 1.1 board.listBoards'))
  assert.deepEqual(called(board), [['listBoards', 'open']])
})

test('[27-18@9b] a sequence calls a tool of an outside server by its dotted name, and is handed what it returns', async (t) => {
  const board = await boardOf(t)
  const app = await boardApp(t, board)
  app.fake('writer', (request) => {
    if (request.messages.at(-1)?.who === 'user')
      return {
        calls: [
          { tool: 'sequence', with: { run: "const listed = board.listBoards({ words: 'open' })\nreturn listed" } },
        ],
      }
    return { text: `Told: ${JSON.stringify(request.messages.at(-1)?.result)}` }
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const { run } = notDropped(await app.start('sequencer', { message: 'Which boards?' }, { as: ada }))
  assert.deepEqual(await app.runs.wait(run), { text: 'Told: "listBoards answered open"' })
  assert.ok((app.runs.read(run)?.steps ?? []).some((one) => one.name === 'tool 1.1.1 board.listBoards'))
  assert.deepEqual(called(board), [['listBoards', 'open']])
})

test('[27-18@9b] a chat app is asked by one question for every call that the ask of a sequence lists, with the title of its tool and its input', async (t) => {
  const board = await boardOf(t)
  const app = await boardApp(t, board)
  app.fake('writer', (request) => {
    if (request.messages.at(-1)?.who === 'user')
      return {
        calls: [
          {
            tool: 'sequence',
            with: {
              run: "board.addCard({ words: 'first card' })\nboard.addCard({ words: 'second card' })\nreturn 'added'",
            },
          },
        ],
      }
    return { text: 'Done.' }
  })
  const ada = await app.user({ name: 'Ada', roles: [] })
  const client = app.mcp({ as: ada, asks: true })
  const asked = await client.call('planner', { message: 'Add two cards.' })
  assert.equal(asked.resultType, 'input_required', JSON.stringify(asked))
  const message = String(Object(Object(Object(asked.inputRequests).ask).params).message)
  assert.match(message, /first card/)
  assert.match(message, /second card/)
  assert.match(message, /Add card/)
  assert.deepEqual(called(board), [], 'nothing was added before the yes')
})
