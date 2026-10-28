import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import type { TestApp } from 'tentjs/test'
import { testApp } from 'tentjs/test'
import { openOrders } from '../functions/open'

// One app for the whole file: its tests share its data.
let app: TestApp
before(async () => {
  app = await testApp()
})
after(() => app.close())

test('the shared app lists its orders', async () => {
  const maya = await app.user({ name: 'Maya', roles: [] })
  assert.deepEqual(await app.as(maya).call(openOrders, { limit: 5 }), [])
})
