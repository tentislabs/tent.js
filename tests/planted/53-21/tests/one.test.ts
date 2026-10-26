import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { a } from '../parts/one/a.ts'

test('[99-1] a test that loads one file of a part', () => {
  appendFileSync(join(import.meta.dirname, '..', 'runs'), 'one\n')
  assert.ok(a > 0)
})
