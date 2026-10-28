import test from 'node:test'
import assert from 'node:assert/strict'

test('a word the test file imports as it runs', async () => {
  const { said } = await import('../lib/said')
  assert.equal(said, 'one')
})
