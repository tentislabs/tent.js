import assert from 'node:assert/strict'
import { test } from 'node:test'
import { list } from '../steps/list.ts'

test('[14-1] each step of the build has a place of its own: no two steps stand at one order', async () => {
  const at = new Map<number, string[]>()
  for (const entry of list) {
    const { step } = await entry.load()
    at.set(step.order, [...(at.get(step.order) ?? []), entry.name])
  }
  const shared = [...at]
    .filter(([, names]) => names.length > 1)
    .map(([order, names]) => `${order}: ${names.join(', ')}`)
  assert.deepEqual(shared, [], `steps that share a place: ${shared.join('; ')}`)
})
