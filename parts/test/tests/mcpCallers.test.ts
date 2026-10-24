import assert from 'node:assert/strict'
import test from 'node:test'
import { errorOf, callerIdOf, mcpApp, people } from './mcpApp.ts'

test('[25-8a] a key lists and calls the functions of its scopes, one outside them is T3101, and a function that asks a person is T7120', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const { key } = await app.key({ user: callerIdOf(ada), scopes: ['openOrders', 'addOrder', 'removeOrder'] })
  const client = app.mcp({ as: { token: key } })
  assert.deepEqual((await client.tools()).map((one) => String(one.name)).sort(), [
    'addOrder',
    'openOrders',
    'removeOrder',
  ])
  const added = await client.call('addOrder', { title: 'by a key' })
  assert.equal(added.isError, undefined, JSON.stringify(added))
  const [row] = await app.rows('orders')
  assert.equal(row.placedBy, callerIdOf(ada), 'a key of a user calls as that user')
  const outside = await client.call('titles', {})
  assert.equal(errorOf(outside).code, 'T3101')
  const asks = await client.call('removeOrder', { order: String(row.id) })
  assert.equal(errorOf(asks).code, 'T7120')
  assert.equal((await app.rows('orders')).length, 1, 'nothing was removed')
  // A key that was removed, and one that was made up, name nobody.
  assert.equal((await app.mcp({ as: { token: `${key}x` } }).request('tools/list', {})).status, 401)
})

test('[25-8a] [11-2@9b] a user that `identify` names calls as that user, and a function that asks a person is T7120 for them too', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: { headers: { 'company-user': 'ada@example.com' } } })
  const added = await client.call('addOrder', { title: 'through the login of the company' })
  assert.equal(added.isError, undefined, JSON.stringify(added))
  const [row] = await app.rows('orders')
  assert.equal(row.placedBy, callerIdOf(ada))
  assert.deepEqual(Object(await client.call('openOrders', {})).structuredContent, {
    value: [{ title: 'through the login of the company' }],
  })
  const asks = await client.call('removeOrder', { order: String(row.id) })
  assert.equal(errorOf(asks).code, 'T7120')
  assert.ok(Object(errorOf(asks).fields).ask, 'the refusal carries the text of the ask')
})

test('[11-2@9b] a call over MCP by the caller of the admin token runs as the user it names', async (t) => {
  const app = await mcpApp(t)
  const { bob } = await people(app)
  await app.mcp({ as: bob }).call('addOrder', { title: 'by Bob' })
  const [row] = await app.rows('orders')
  assert.equal(row.placedBy, callerIdOf(bob))
})
