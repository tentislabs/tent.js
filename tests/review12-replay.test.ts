import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, result, run } from './rigs-plant.ts'

test('[53-21] in the framework repository, a test file runs again where a file inside a folder it copied changed', (t) => {
  const folder = copyOf(t, 'review12-21')
  const first = run(folder)
  assert.equal(first.code, 0, first.out)
  writeFileSync(join(folder, 'fixture', 'inner', 'word.txt'), 'two\n')
  const second = run(folder)
  assert.equal(result(folder).tests['99-1'], 'failed', second.out)
})

test('[53-21] in the framework repository, a file changed while the run goes on runs the test that read it again', (t) => {
  const folder = copyOf(t, 'review12-21')
  const first = run(folder)
  assert.equal(first.code, 0, first.out)
  const second = run(folder)
  assert.equal(result(folder).tests['99-2'], 'failed', second.out)
})
