import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { measure } from '../../../../rig/budgets.ts'

test('[99-3] a measure under the bar of its name', async () => {
  await measure('quick.work', () => wait(1))
})

test('[99-4] a name with no bar is written and held to nothing: the middle one of five', async () => {
  const sizes = [9, 1, 8, 2, 7]
  assert.equal(await measure('no.bar', () => sizes.pop(), { unit: 'bytes' }), 7)
  assert.equal(sizes.length, 0)
})

test('[99-5] a warm measure calls its run once more, and does not count that call', async () => {
  const sizes = [1000, 5, 1, 4, 2, 3]
  let calls = 0
  assert.equal(await measure('small.file', async () => sizes[calls++], { warm: true }), 3)
  assert.equal(calls, 6)
})
