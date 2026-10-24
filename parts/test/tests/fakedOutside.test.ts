import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { lockedTool } from '../../connect/index.ts'
import type { ReplyRequest } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'
import { notDropped } from './started.ts'

// The one approved tool of the board, which takes a name and a colour, the name needed.
const renameBoard = lockedTool({
  name: 'renameBoard',
  about: 'Renames a board',
  schema: {
    type: 'object',
    properties: { name: { type: 'string' }, colour: { type: 'string' } },
    required: ['name'],
  },
})

/** The project of the outside servers with the board's tool approved, and actions that call it from code. */
async function approvedApp(t: TestContext): Promise<TestApp> {
  const folder = copyOf(t, 'outsided')
  writeFileSync(join(folder, 'mcp.lock.json'), `${JSON.stringify({ board: { tools: { renameBoard } } }, null, 2)}\n`)
  appendFileSync(
    join(folder, 'functions.ts'),
    [
      '',
      "export const renamePlans = action('renamePlans', { access: 'signedIn', input: {}, output: json(), run: () => board.renameBoard({ name: 'Plans', colour: 'red' }) })",
      "export const paintPlans = action('paintPlans', { access: 'signedIn', input: {}, output: json(), run: () => board.renameBoard({ name: 'Plans', size: 3 }) })",
      "export const renameNothing = action('renameNothing', { access: 'signedIn', input: {}, output: json(), run: () => board.renameBoard({ colour: 'red' }) })",
      '',
    ].join('\n'),
  )
  const app = await testApp({ folder })
  closing(t, () => app.close())
  return app
}

test('[24-16] a faked outside MCP server takes the fields its lock file holds for a tool, from code and from an agent, and refuses the others', async (t) => {
  const app = await approvedApp(t)
  const ada = await app.user({ name: 'Ada', roles: [] })
  const board = app.fake('board', { renameBoard: ({ name }: { name: string }) => ({ renamed: name }) })
  assert.deepEqual(await app.as(ada).call('renamePlans', {}), { renamed: 'Plans' })
  assert.deepEqual(
    board.sent.map((one) => [one.call, one.input]),
    [['renameBoard', { name: 'Plans', colour: 'red' }]],
  )
  await assert.rejects(app.as(ada).call('paintPlans', {}), (error: unknown) => {
    assert.equal(Object(error).code, 'T0002')
    assert.match(String(Object(error).message), /size/)
    return true
  })
  await assert.rejects(app.as(ada).call('renameNothing', {}), (error: unknown) => {
    assert.equal(Object(error).code, 'T0002')
    assert.match(String(Object(error).message), /name/)
    return true
  })
  assert.equal(board.sent.length, 1)

  app.fake('writer', (request: ReplyRequest) => {
    const last = request.messages.at(-1)
    const tool = request.tools?.find((one) => one.name.replace(/[^A-Za-z]/g, '') === 'boardrenameBoard')?.name
    if (last?.who === 'user') return { calls: [{ tool: tool ?? 'board.renameBoard', with: { name: 'Roadmap' } }] }
    const answer = request.messages.findLast((one) => one.who === 'tool')
    return { text: `Told: ${JSON.stringify(answer?.error ?? answer?.result ?? null)}` }
  })
  const started = notDropped(await app.start('helper', { message: 'Rename it.' }, { as: ada }))
  assert.match(String(Object(await app.runs.wait(started.run)).text), /Roadmap/)
  assert.deepEqual(board.sent.at(-1)?.input, { name: 'Roadmap' })
})
