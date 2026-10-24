import assert from 'node:assert/strict'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { list, number, project, query, TentError, text } from '../../core/index.ts'
import { describe, toolList } from '../../core/internal.ts'
import type { McpEnv } from '../mcp/env.ts'
import { mcpServer } from '../mcp/server.ts'

const ada: Caller = { kind: 'user', user: { id: 'ada', roles: [] } }

test('[25-4] `callFunction` refuses an input that does not fit as `call` of an agent does: what does not fit, and the two lines of the function', async () => {
  const many = Array.from({ length: 21 }, (_, at) =>
    query(`order${String(at).padStart(2, '0')}`, {
      access: 'signedIn',
      offer: ['mcp'],
      about: `Reads the open order number ${at}.`,
      input: { count: number() },
      output: list(text()),
      run: () => [],
    }),
  )
  const { description } = describe({
    definitions: [{ value: project('shop', {}) }, ...many.map((value) => ({ value }))],
  })
  let ran = 0
  const env: McpEnv = {
    description: () => description,
    call: async () => {
      ran++
      return []
    },
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
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'callFunction', arguments: { name: 'order07', input: { count: 'seven' } } },
    }),
  })
  const answer = await mcpServer(env).handle(request, { caller: ada, origin: 'http://localhost' })
  const result = Object(Object(await answer.json()).result)
  const error = Object(Object(result._meta)['tent.error'])
  assert.equal(result.isError, true)
  assert.equal(error.code, 'T0002')
  assert.match(String(error.message), /count/)
  assert.ok(String(error.message).endsWith(toolList(description, ['order07']).own), String(error.message))
  assert.equal(ran, 0, 'the function is not called')
})
