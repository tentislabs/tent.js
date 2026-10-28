import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../internal.ts'
import { testsTouching, touchedOf, untestedOf } from '../internal.ts'

// A description with a definition of each kind that the check holds to the tests, and a model, which it does not.
const description: Description = Object({
  tables: { orders: {}, archive: {} },
  functions: { addOrder: { kind: 'change' }, forgotten: { kind: 'query' } },
  flows: { kept: {}, helper: { agent: {} } },
  screens: { home: { path: '/' } },
  components: { Price: {} },
  routes: { feed: { path: '/feed.xml' } },
  models: { writer: {} },
  services: {},
  incoming: {},
  commands: {},
})

// The record of the tests as `tent test` keeps it: one test that ran twice under one name, and one that touched nothing.
const record = {
  tests: {
    'tests/orders.test.ts': {
      'an order is added': [
        { result: 'passed', ms: 3, key: 'a', touched: { functions: ['addOrder'], wrote: ['orders'], asked: ['/x'] } },
        { result: 'passed', ms: 3, key: 'b', touched: { flows: ['helper'], read: ['orders'] } },
      ],
      'nothing at all': [{ result: 'passed', ms: 1, key: 'c', touched: {} }],
    },
  },
}

test('[53-8] what each test touched is read from the record of the tests, and what no test touched is read from it in one place: each function, flow, screen, table and route, by its name and kind', () => {
  const touched = touchedOf(record)
  assert.deepEqual(touched, {
    'tests/orders.test.ts: an order is added': ['addOrder', 'helper', 'orders'],
    'tests/orders.test.ts: nothing at all': [],
  })
  assert.deepEqual(untestedOf(description, touched), [
    { name: 'archive', kind: 'table' },
    { name: 'feed', kind: 'route' },
    { name: 'forgotten', kind: 'function' },
    { name: 'home', kind: 'screen' },
    { name: 'kept', kind: 'flow' },
  ])
  assert.deepEqual(testsTouching(touched, 'orders'), ['tests/orders.test.ts: an order is added'])
  assert.deepEqual(testsTouching(touched, 'archive'), [])
  // A record of another form holds no test.
  assert.deepEqual(touchedOf({ tests: 'none' }), {})
  assert.deepEqual(touchedOf(undefined), {})
})
