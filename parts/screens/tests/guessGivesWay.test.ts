import assert from 'node:assert/strict'
import test from 'node:test'
import type { OptimisticPlans } from '../page/worked.ts'
import { workedOut } from '../page/worked.ts'

// A change that adds a stay with the guest it is handed, and a query of every stay by its guest.
const plans: OptimisticPlans = {
  changes: {
    book: { writes: [{ add: 'stays', values: { guest: { input: 'guest' } } }], defaults: { stays: {} } },
  },
  queries: { allStays: { plan: { from: 'stays', sort: [{ by: 'guest' }] } } },
}

const guestsOf = (value: unknown): unknown[] =>
  (Array.isArray(value) ? value : []).map((row) => Reflect.get(Object(row), 'guest'))

test('[44-8] [32-4] the row an optimistic result shows gives way to the real row that live data brings before the call is answered: the list holds it once', () => {
  const worked = workedOut(plans, 'book', { guest: 'Bo' }, undefined)
  assert.ok(worked)
  const [result] = worked.results
  const before = [{ id: 'r1', guest: 'Ann' }]
  // The moment the call is made, the list shows the row of the optimistic result beside what it held.
  assert.deepEqual(guestsOf(result.to(before, {}, {})), ['Ann', 'Bo'])
  // Live data brings the real row while the answer of the call is still on its way: it stands once.
  const live = [...before, { id: 'r2', guest: 'Bo' }]
  assert.deepEqual(guestsOf(result.to(live, {}, {})), ['Ann', 'Bo'])
  // And once the call is answered, as before.
  worked.answered({ id: 'r2' })
  assert.deepEqual(guestsOf(result.to(live, {}, {})), ['Ann', 'Bo'])
})

test('[44-8] [32-4] what live data brings while the call is on its way is shown once the call is answered, the optimistic result standing until then', () => {
  const worked = workedOut(plans, 'book', { guest: 'Bo' }, undefined)
  assert.ok(worked)
  const [result] = worked.results
  const before = [{ id: 'r1', guest: 'Ann' }]
  assert.deepEqual(guestsOf(result.to(before, {}, {})), ['Ann', 'Bo'])
  // Another person's row, and the real one, come while the call is on its way: they wait for its answer.
  const live = [...before, { id: 'r3', guest: 'Cy' }, { id: 'r2', guest: 'Bo' }]
  assert.deepEqual(guestsOf(result.to(live, {}, {})), ['Ann', 'Bo'])
  worked.answered({ id: 'r2' })
  assert.deepEqual(guestsOf(result.to(live, {}, {})), ['Ann', 'Bo', 'Cy'])
})
