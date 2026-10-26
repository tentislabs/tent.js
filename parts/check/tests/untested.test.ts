import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Facts } from '../../core/internal.ts'
import { checkRules } from '../ours.ts'
import { copyOf, heldToProjects } from './copies.ts'

// What the tests of the project touched in their last run, as `tent test` keeps it: one test, which added an order.
const facts: Facts = {
  tableFindings: [],
  waitingStepNames: {},
  touched: { 'tests/orders.test.ts: an order is added': ['addOrder', 'orders'] },
}

test('[15-1@12] T9004: a function, a flow, a screen, a table and a route that no test touched in its last run is a warning at its definition, whose fix names `tent test`; with no record of the tests it finds nothing', async () => {
  const { findings } = await heldToProjects('T9004', facts)
  assert.deepEqual(findings.map((one) => [one.level, one.where?.definition, one.where?.file]).sort(), [
    ['warning', 'archive', 'functions/orders.ts'],
    ['warning', 'forgotten', 'functions/orders.ts'],
  ])
  for (const one of findings) {
    assert.ok((one.where?.line ?? 0) > 0)
    assert.match(String(one.fix), /`tent test`/)
    assert.equal(one.docs, 'tent docs T9004')
  }
  // A project whose tests never ran has no record: nothing is known of what they touch, and nothing is told.
  const unrecorded = await checkRules(copyOf(join('T9004', 'fail'), 'T9004-unrecorded'), {
    facts: { tableFindings: [], waitingStepNames: {} },
  })
  assert.deepEqual(
    unrecorded.findings.filter((one) => one.code === 'T9004'),
    [],
  )
})
