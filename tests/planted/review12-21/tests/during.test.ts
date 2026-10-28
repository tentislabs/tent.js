import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const file = join(import.meta.dirname, '..', 'data.txt')

test('[99-2] a test that reads a file which is changed while the run goes on', () => {
  assert.equal(readFileSync(file, 'utf8').trim(), 'one')
  // Stands for a change that a person or an agent makes while the run goes on, after the test read the file.
  writeFileSync(file, 'two\n')
})
