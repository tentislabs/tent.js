import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[45-15] `app.make` writes that many rows as the system, each filled from its types, a link with a row it makes first, and what the test gives it in place', async (t) => {
  const app = await testApp({ folder: copyOf(t, 'madeRows') })
  closing(t, () => app.close())
  const made = await app.make('orders', 50)
  assert.equal(made.length, 50)
  const orders: unknown = await app.read({ from: 'orders' }, system)
  const customers: unknown = await app.read({ from: 'customers' }, system)
  const [all, theirs] = [Array.isArray(orders) ? orders : [], Array.isArray(customers) ? customers : []]
  assert.equal(all.length, 50)
  assert.equal(theirs.length, 50, 'each order made its customer first')
  const ids = new Set(theirs.map((one) => Reflect.get(Object(one), 'id')))
  assert.ok(
    all.every((one) => ids.has(Reflect.get(Object(one), 'customer'))),
    'every order links a customer that is there',
  )
  const [first] = all.map((one) => Object(one))
  assert.equal(first.paid, false)
  assert.equal(first.state, 'shipped', 'a column with a default keeps it')
  assert.equal(first.note, undefined, 'a column that may be left out is left out')
  assert.ok(first.placedAt instanceof Date)
  assert.match(String(first.due), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(Reflect.get(Object(theirs[0]), 'tier'), 'bronze', 'a choice takes its first value')
  assert.equal(
    new Set(theirs.map((one) => Reflect.get(Object(one), 'name'))).size,
    50,
    'texts of a unique column differ',
  )
  // What the test gives stands in place of what the types would fill, by the number of the row.
  const one = theirs[0]
  const given = await app.make('orders', 3, (i) => ({
    total: i * 10,
    customer: Reflect.get(Object(one), 'id'),
    note: `row ${i}`,
  }))
  assert.deepEqual(
    given.map((row) => [Reflect.get(Object(row), 'total'), Reflect.get(Object(row), 'note')]),
    [
      [0, 'row 0'],
      [10, 'row 1'],
      [20, 'row 2'],
    ],
  )
  const after: unknown = await app.read({ from: 'customers' }, system)
  assert.equal(Array.isArray(after) ? after.length : 0, 50, 'a link that is given makes no row')
})
