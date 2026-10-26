import test from 'node:test'
import assert from 'node:assert/strict'
import type { TestApp } from 'tentjs/test'
import { testApp } from 'tentjs/test'
import { addOrder } from '../functions/add'

// One app that the first test opens and the second goes on with: no `before` hook opens it.
let app: TestApp | undefined

test('the first test opens the app and adds an order', async () => {
  app = await testApp()
  const maya = await app.user({ name: 'Maya', roles: [] })
  await app.as(maya).call(addOrder, { title: 'A lamp' })
})

test('the second test reads what the first one added', async () => {
  if (!app) throw new Error('no app was opened')
  const rows = await app.rows('orders')
  assert.deepEqual(
    rows.map((one) => one.title),
    ['A lamp'],
  )
  await app.close()
})
