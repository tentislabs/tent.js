import assert from 'node:assert/strict'
import { cpSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = join(import.meta.dirname, '..')

test('[99-1] a test that copies a folder of what it reads, as the tests of a project copy theirs, and reads the copy', () => {
  const copy = join(root, 'results', 'copy')
  rmSync(copy, { recursive: true, force: true })
  cpSync(join(root, 'fixture'), copy, { recursive: true })
  assert.equal(readFileSync(join(copy, 'inner', 'word.txt'), 'utf8').trim(), 'one')
})
