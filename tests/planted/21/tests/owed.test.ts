import assert from 'node:assert/strict'
import { test } from 'node:test'

test('[99-2] a marked test that is not met', { todo: true }, () => {
  assert.fail('not built')
})

test('[99-3] a plain test', () => {})
