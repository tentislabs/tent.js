import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { list, number, project, query, TentError, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe, toolLine, toolList } from '../../core/internal.ts'
import type { McpEnv } from '../mcp/env.ts'
import { mcpServer } from '../mcp/server.ts'

const ada: Caller = { kind: 'user', user: { id: 'ada', roles: [] } }

/** Describes the definitions of a test, held in memory with a project. */
function described(definitions: object[]): Description {
  const made = describe({ definitions: [{ value: project('shop', {}) }, ...definitions.map((value) => ({ value }))] })
  const errors = made.findings.filter((one) => one.level === 'error')
  if (errors.length) throw new Error(`the definitions do not describe: ${errors.map((one) => one.message)}`)
  return made.description
}

/** The layer over a description, whose functions answer nothing, and a request of the standard to it. */
async function asked(description: Description, method: string, params: object): Promise<Record<string, unknown>> {
  const env: McpEnv = {
    description: () => description,
    call: async () => [],
    wire: (error) => ({
      status: 400,
      error: {
        code: error instanceof TentError ? error.code : 'T0009',
        name: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }),
    limit: () => 300_000,
  }
  const request = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const answer = await mcpServer(env).handle(request, { caller: ada, origin: 'http://localhost' })
  return Object(Object(await answer.json()).result)
}

const run = (): string[] => []

test('[25-2] the description of a tool is the `about` of its function, and after it the line that the engine writes for a tool', async () => {
  const description = described([
    query('openOrders', {
      access: 'signedIn',
      offer: ['mcp'],
      about: 'Lists the open orders.',
      input: { limit: number({ optional: true }) },
      output: list(text()),
      run,
    }),
  ])
  const line = toolLine(description, undefined, 'openOrders')
  assert.notEqual(line, '', 'the engine writes a line for this tool')
  const { tools } = await asked(description, 'tools/list', {})
  const [listed] = Array.isArray(tools) ? tools : []
  assert.equal(Reflect.get(Object(listed), 'description'), `Lists the open orders. ${line}`)
})

test('[25-4] `findFunction` answers each function as its two lines of the list', async () => {
  const many = Array.from({ length: 21 }, (_, at) =>
    query(`order${String(at).padStart(2, '0')}`, {
      access: 'signedIn',
      offer: ['mcp'],
      about: `Reads the open order number ${at}.`,
      output: list(text()),
      run,
    }),
  )
  const description = described(many)
  const found = await asked(description, 'tools/call', { name: 'findFunction', arguments: { words: 'number 7' } })
  // The two lines may stand as a text of their own or inside a record: either way their text is in the answer.
  const answered = JSON.stringify(found.structuredContent)
  const { own } = toolList(description, ['order07'])
  assert.ok(own.includes('\n'), own)
  assert.ok(
    answered.includes(JSON.stringify(own).slice(1, -1)),
    `findFunction answers ${answered}, and not the two lines ${JSON.stringify(own)}`,
  )
})
