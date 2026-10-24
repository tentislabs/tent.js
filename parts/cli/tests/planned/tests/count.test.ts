import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

test('the orders are counted', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: [] })
  assert.equal(await app.as(ada).call('countOrders', {}), 0)
  await app.close()
})
