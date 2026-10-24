import assert from 'node:assert/strict'
import test from 'node:test'
import { testApp } from 'tentjs/test'
import { addOrder, addOrderOut } from '../functions/orders'

test('what a change answers', async () => {
  const app = await testApp()
  // A change in code with no output answers nothing: the type of its call says so.
  const added = await app.as('system').call(addOrder, { name: 'A shelf' })
  assert.equal(added, undefined)
  console.log(added.id) // refused
  // With a stated output it answers that.
  const out = await app.as('system').call(addOrderOut, { name: 'A lamp' })
  assert.equal(typeof out.id, 'string')
  // By its name, a function is typed by the list of the project: a change in our own words answers its row.
  const set = await app.as('system').call('addOrderSet', { name: 'A desk' })
  assert.equal(set.name, 'A desk')
  assert.equal(set.nmae, 'A desk') // refused
  // The rows of a table, named by its name, are typed by the list of the project too.
  const [first] = await app.rows('orders')
  assert.equal(typeof first.name, 'string')
  assert.equal(typeof first.createdAt.getTime(), 'number')
  console.log(first.nmae) // refused
  await app.close()
})
