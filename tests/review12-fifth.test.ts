import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, result, run } from './rigs-plant.ts'

test('[53-21] in the framework repository, a test file runs again where a file changed that a thread of a thread read, its outer thread ended', (t) => {
  const folder = copyOf(t, 'review12-nested')
  const first = run(folder)
  assert.equal(first.code, 0, first.out)
  writeFileSync(join(folder, 'data.txt'), 'two\n')
  const second = run(folder)
  assert.equal(result(folder).tests['99-1'], 'failed', second.out)
})
