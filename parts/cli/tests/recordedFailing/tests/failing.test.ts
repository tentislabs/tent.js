import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { addOrder } from '../functions/add'
import { openOrders } from '../functions/open'
import { broken, markPaid } from '../functions/paid'

test('the order stays open', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: ['staff'] })
  await app.as(ada).call(addOrder, { title: 'A lamp' })
  const [order] = await app.rows('orders')
  await app.as(ada).call(markPaid, { order: order.id })
  const [after] = await app.rows('orders')
  assert.equal(after.paid, false)
})

test('a customer marks the order paid', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(addOrder, { title: 'A desk' })
  const [order] = await app.rows('orders')
  await app.as(maya).call(markPaid, { order: order.id })
})

test('the code of the app fails', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(broken, {})
})

test('no order is open', async () => {
  const app = await testApp()
  const ada = await app.user({ name: 'Ada', roles: ['staff'] })
  await app.as(ada).call(addOrder, { title: 'A chair' })
  assert.deepEqual(await app.as(ada).call(openOrders, { limit: 5 }), [])
})
