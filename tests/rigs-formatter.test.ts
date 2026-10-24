import assert from 'node:assert/strict'
import { test } from 'node:test'
import { command, copyOf } from './rigs-plant.ts'

test('[03-10] a file that the formatter would lay out differently fails the run, and is named', (t) => {
  const withIt = command(copyOf(t, '10'), 'lint')
  assert.notEqual(withIt.code, 0, withIt.out)
  assert.match(withIt.out, /rig\/wide\.ts format/)
  assert.doesNotMatch(withIt.out, /rig\/even\.ts/)

  const withoutIt = command(copyOf(t, '10', ['rig/wide.ts']), 'lint')
  assert.equal(withoutIt.code, 0, withoutIt.out)
})
