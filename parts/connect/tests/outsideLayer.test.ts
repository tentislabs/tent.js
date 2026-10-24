import assert from 'node:assert/strict'
import test from 'node:test'
import { secret, service } from '../../core/index.ts'
import { calling } from './calling.ts'
import { standIn } from './servers.ts'

test('[25-11] a tool call of an outside server carries the headers and the sign-in of its service, waits under `perSecond`, and writes one row of the log', async (t) => {
  const server = await standIn(t, (_, response, asked) => {
    const id = Reflect.get(Object(JSON.parse(asked.body)), 'id')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'found' }] } }))
  })
  const { call, description, logged, slept } = calling(
    [
      service('docs', {
        url: `${server.origin}/mcp`,
        mcp: true,
        auth: { bearer: secret('DOCS_KEY') },
        headers: { 'X-Team': 'blue' },
        limits: { perSecond: 1 },
      }),
    ],
    { secrets: { DOCS_KEY: 'the-key' } },
  )
  // The calls of an outside server are the tools that `mcp.lock.json` approved, which the build fills in.
  description.services.docs.calls = { search: { about: 'Searches', schema: { type: 'object' }, fingerprint: 'x' } }
  assert.equal(await call('docs', 'search', {}), 'found')
  assert.equal(await call('docs', 'search', {}), 'found')
  for (const one of server.asked) {
    assert.equal(one.headers.authorization, 'Bearer the-key')
    assert.equal(one.headers['x-team'], 'blue')
  }
  assert.equal(slept.filter((ms) => ms > 0).length, 1, 'the second call waits for the next second')
  assert.deepEqual(
    logged.map((row) => [row.service, row.call, row.status]),
    [
      ['docs', 'search', 200],
      ['docs', 'search', 200],
    ],
  )
})
