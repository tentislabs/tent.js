import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../index.ts'
import { codeOf } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'

// Functions that state `system`, written with `rows`, with `set` and as code, beside one that states none.
const stated = `
export const everyOrder = query('everyOrder', {
  access: 'signedIn',
  system: 'the desk lists the orders of everyone',
  rows: orders.oldest('createdAt'),
})

export const ownOrders = query('ownOrders', { access: 'signedIn', rows: orders.oldest('createdAt') })

export const settle = change('settle', {
  access: 'signedIn',
  system: 'whoever stands at the desk settles any order',
  input: { order: text() },
  set: orders.change(input('order'), { paid: true }),
})

export const countLimited = query('countLimited', {
  access: 'signedIn',
  system: 'it counts the orders through db',
  output: number(),
  run: ({ db }) => db.orders.all().length,
})

export const countFull = query('countFull', {
  access: 'signedIn',
  system: 'it counts the orders through db.system',
  output: number(),
  run: ({ db }) => db.system.orders.all().length,
})
`

test('[11-2@4] a function that states system and is written with rows or with set is carried out with full access: its plan reads and its writes write what the rules of the table keep from its caller, its access alone says who may call it, and in code db stays limited to the caller', async (t) => {
  tempOf(t)
  const project = copyOf(t, 'shop')
  appendFileSync(join(project, 'functions', 'orders.ts'), stated)
  const app = await testApp({ folder: project })
  closing(t, () => app.close())
  const [ada, bob] = [await app.user({ name: 'Ada', roles: [] }), await app.user({ name: 'Bob', roles: [] })]
  // The orders of the two, among the orders that the seed of the project made for others.
  const titles = async (name: string, as: typeof ada): Promise<string[]> =>
    Object(await app.as(as).call(name, {}))
      .map((row: { title: string }) => row.title)
      .filter((title: string) => title.includes(' of '))
  const first: { id?: string } = Object(await app.as(ada).call('addOrder', { title: 'a lamp of Ada' }))
  await app.as(ada).call('addOrder', { title: 'a desk of Ada' })
  await app.as(bob).call('addOrder', { title: 'a chair of Bob' })
  // The table lets only the owner read a row: a query with `rows` answers Bob his own order, and no other.
  assert.deepEqual(await titles('ownOrders', bob), ['a chair of Bob'])
  // The same plan in a query that states `system` reads every row, for the same caller.
  assert.deepEqual(await titles('everyOrder', bob), ['a lamp of Ada', 'a desk of Ada', 'a chair of Bob'])
  assert.deepEqual(await titles('everyOrder', ada), ['a lamp of Ada', 'a desk of Ada', 'a chair of Bob'])
  // The table lets only staff change a row: Bob is none, and the change that states no `system` is not his to call.
  assert.equal(await codeOf(app.as(bob).call('markPaid', { order: first.id })), 'T3101')
  // A change with `set` that states `system` writes the row of another, which the rule of the table keeps from Bob.
  const settled: { id?: string; paid?: boolean } = Object(await app.as(bob).call('settle', { order: first.id }))
  assert.deepEqual([settled.id, settled.paid], [first.id, true])
  const held = (await app.rows('orders')).find((row) => row.id === first.id)
  assert.equal(held?.paid, true)
  // Its `access` alone says who may call it: nobody is told to sign in, for the query and for the change.
  assert.equal(await codeOf(app.as('nobody').call('everyOrder', {})), 'T0006')
  assert.equal(await codeOf(app.as('nobody').call('settle', { order: first.id })), 'T0006')
  // In code full access is `db.system`, and `db` itself stays limited to the caller.
  const every = (await app.rows('orders')).length
  assert.ok(every >= 3)
  assert.deepEqual([await app.as(bob).call('countLimited', {}), await app.as(bob).call('countFull', {})], [1, every])
  assert.equal(Object(await app.as(bob).call('everyOrder', {})).length, every)
})
