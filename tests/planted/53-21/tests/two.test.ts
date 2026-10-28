import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { b } from '../parts/two/b.ts'

test('[99-2] a test that loads another file', () => {
  appendFileSync(join(import.meta.dirname, '..', 'runs'), 'two\n')
  assert.ok(b > 0)
})
