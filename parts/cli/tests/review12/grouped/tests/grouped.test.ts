import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { openOrders } from '../functions/open'

test('orders', () => {
  assert.ok(true)
})

describe('orders', () => {
  test('open orders inside a group', async () => {
    const app = await testApp()
    const maya = await app.user({ name: 'Maya', roles: [] })
    assert.deepEqual(await app.as(maya).call(openOrders, { limit: 5 }), [])
    await app.close()
  })
})
