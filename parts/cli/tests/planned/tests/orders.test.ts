import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'

test('an order is added', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: [] })
  await app.as(ada).call('addOrder', { title: 'A shelf', count: 2, urgent: false })
  assert.equal((await app.rows('orders')).length, 1)
  await app.close()
})

test('a sample is added', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: [] })
  await app.as(ada).call('addSample', {})
  assert.equal((await app.rows('orders')).length, 1)
  await app.close()
})
