import assert from 'node:assert/strict'
import test from 'node:test'
import { api, keyedApp, keyOf } from './keyedApp.ts'
import { mcpApp, people } from './mcpApp.ts'

test("[45-19.12] at /api/ an Idempotency-Key of another caller is unknown: sent with that caller's very call, and with another, it runs as the sender's own", async (t) => {
  const app = await keyedApp(t)
  const keyFor = async (name: string): Promise<string> =>
    (await keyOf(app, { scopes: ['*'], user: (await app.user({ name })).user?.id })).key
  const [ada, bob, carol] = [await keyFor('Ada'), await keyFor('Bob'), await keyFor('Carol')]
  const once = { 'idempotency-key': 'the-order-of-ada-0001' }
  const lamp = { title: 'Lamp', total: 5 }
  assert.equal((await api(app, 'POST', 'addOrder', { key: ada, input: lamp, headers: once })).status, 204)
  // Bob sends Ada's key with her very call: nothing kept is answered him, and the call runs as his.
  const same = await api(app, 'POST', 'addOrder', { key: bob, input: lamp, headers: once })
  assert.equal(same.status, 204, JSON.stringify(same.body))
  // Carol sends it with another call: no T0002 tells her that the key was used, and it runs as hers.
  const other = await api(app, 'POST', 'addOrder', { key: carol, input: { title: 'Chair' }, headers: once })
  assert.equal(other.status, 204, JSON.stringify(other.body))
  const titlesOf = async (key: string): Promise<unknown> => Object((await api(app, 'GET', 'myOrders', { key })).body)
  assert.deepEqual(await titlesOf(ada), [{ title: 'Lamp' }])
  assert.deepEqual(await titlesOf(bob), [{ title: 'Lamp' }])
  assert.deepEqual(await titlesOf(carol), [{ title: 'Chair' }])
})

test("[45-19.12] at /mcp an Idempotency-Key of another caller is unknown: sent with that caller's very call, it is answered the sender's own answer, and runs as theirs", async (t) => {
  const app = await mcpApp(t)
  const { ada, bob } = await people(app)
  const headers = { 'idempotency-key': 'the-tool-call-of-ada-0001' }
  const call = (who: typeof ada) =>
    app.mcp({ as: who }).request('tools/call', { name: 'addOrder', arguments: { title: 'Lamp' } }, { headers })
  const idOf = (answer: Awaited<ReturnType<typeof call>>): unknown =>
    Reflect.get(Object(Object(answer.body.result).structuredContent), 'id')
  const first = idOf(await call(ada))
  const theirs = idOf(await call(bob))
  assert.equal(typeof first, 'string')
  assert.equal(typeof theirs, 'string')
  assert.notEqual(theirs, first, "Bob was answered the answer of Ada's call")
  const listed = async (who: typeof ada): Promise<unknown> =>
    Object((await app.mcp({ as: who }).call('openOrders', {})).structuredContent).value
  assert.deepEqual(await listed(ada), [{ title: 'Lamp' }])
  assert.deepEqual(await listed(bob), [{ title: 'Lamp' }])
})
