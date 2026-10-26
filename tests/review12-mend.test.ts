import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyOf, result, run } from './rigs-plant.ts'

test('[53-21] in the framework repository, a test file runs again where a word of the environment that a program it starts or a thread of it read changed', (t) => {
  const folder = copyOf(t, 'review12-env')
  const first = run(folder, false, { REVIEW12_WORD: 'one' })
  assert.equal(first.code, 0, first.out)
  const second = run(folder, false, { REVIEW12_WORD: 'two' })
  assert.deepEqual([result(folder).tests['99-1'], result(folder).tests['99-2']], ['failed', 'failed'], second.out)
})
