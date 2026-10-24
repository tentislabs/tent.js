import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { markPaid } from '../functions/orders'

test('a customer cannot mark an order paid', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  const [order] = await app.rows('orders')
  await assert.rejects(app.as(maya).call(markPaid, { order: order.id }), { code: 'T3101' })
  await app.close()
})

test('the staff may', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada again', roles: ['staff'] })
  const [order] = await app.rows('orders')
  await app.as(ada).call(markPaid, { order: order.id })
  assert.equal((await app.rows('orders')).filter((row) => row.paid).length, 2)
  await app.close()
})
