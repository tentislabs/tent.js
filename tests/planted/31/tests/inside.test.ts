import { test } from 'node:test'

test('[99-2] a test that holds another', async (t) => {
  await t.test('[99-3] a test inside a test', () => {})
})
