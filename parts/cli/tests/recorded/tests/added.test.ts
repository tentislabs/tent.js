import test from 'node:test'
import assert from 'node:assert/strict'
import { testApp } from 'tentjs/test'
import { addOrder } from '../functions/add'
import { charge } from '../functions/charge'

test('an order is added and paid for', async () => {
  const app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(addOrder, { title: 'A lamp' })
  const [order] = await app.rows('orders')
  app.fake('pay', { charge: { ok: true } })
  assert.deepEqual(await app.as(maya).call(charge, { order: order.id }), { ok: true })
  // An address that no screen answers: a screen added there later is what this test reaches.
  await app.as(maya).page('/nowhere')
  await app.close()
})
