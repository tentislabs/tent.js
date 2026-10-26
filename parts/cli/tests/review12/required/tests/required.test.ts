import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

test('a fixture the test file reads through require', () => {
  assert.equal(require('./fixture.json').word, 'one')
})
