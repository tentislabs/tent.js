import assert from 'node:assert/strict'
import test from 'node:test'
import { mcpApp, people } from './mcpApp.ts'
import { api, keyedApp, keyOf } from './keyedApp.ts'

test('[45-16] an API call sent twice with one Idempotency-Key runs once and is answered alike, and the same key with another input is T0002', async (t) => {
  const app = await keyedApp(t)
  const { key } = await keyOf(app, { scopes: ['*'] })
  // Every order costs 5: the sum of their totals counts them.
  const orders = async (): Promise<number> => Number(await app.as('system').call('totals', {})) / 5
  const once = { 'idempotency-key': 'order-0001-of-a-program' }
  const first = await api(app, 'POST', 'addOrder', { key, input: { title: 'Lamp', total: 5 }, headers: once })
  const again = await api(app, 'POST', 'addOrder', { key, input: { title: 'Lamp', total: 5 }, headers: once })
  assert.equal(first.status, 204)
  assert.deepEqual([again.status, again.body], [first.status, first.body])
  assert.equal(await orders(), 1)
  // The same key with another input is refused, and runs nothing.
  const other = await api(app, 'POST', 'addOrder', { key, input: { title: 'Chair', total: 9 }, headers: once })
  assert.deepEqual([other.status, Object(other.body).code], [400, 'T0002'])
  assert.equal(await orders(), 1)
  // Another key, and no key, run the call again.
  await api(app, 'POST', 'addOrder', { key, input: { title: 'Lamp', total: 5 }, headers: { 'idempotency-key': 'k2' } })
  await api(app, 'POST', 'addOrder', { key, input: { title: 'Lamp', total: 5 } })
  assert.equal(await orders(), 3)
  // The key is the caller's own: another key that sends it runs its own call.
  const { key: second } = await keyOf(app, { scopes: ['*'] })
  const theirs = await api(app, 'POST', 'addOrder', { key: second, input: { title: 'Lamp', total: 5 }, headers: once })
  assert.equal(theirs.status, 204)
  assert.equal(await orders(), 4)
})

test('[45-16] an MCP call sent twice with one Idempotency-Key runs once and is answered alike, and the same key with another input is T0002', async (t) => {
  const app = await mcpApp(t)
  const { ada } = await people(app)
  const client = app.mcp({ as: ada })
  const headers = { 'idempotency-key': 'tool-call-0001' }
  const call = (title: string) => client.request('tools/call', { name: 'addOrder', arguments: { title } }, { headers })
  const first = await call('Lamp')
  const again = await call('Lamp')
  assert.equal(first.status, 200)
  assert.deepEqual(again.body.result, first.body.result)
  assert.ok(Object(first.body.result).structuredContent, JSON.stringify(first.body))
  const listed = await client.call('openOrders', {})
  assert.deepEqual(Object(listed.structuredContent).value, [{ title: 'Lamp' }])
  const other = await call('Chair')
  assert.match(JSON.stringify(other.body), /T0002/)
  assert.deepEqual(Object((await client.call('openOrders', {})).structuredContent).value, [{ title: 'Lamp' }])
})
