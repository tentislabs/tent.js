import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { openOrders } from '../functions/open'

test('open orders are listed', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.deepEqual(await app.as(maya).call(openOrders, { limit: 5 }), [])
  await app.close()
})
