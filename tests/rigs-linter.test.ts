import assert from 'node:assert/strict'
import { test } from 'node:test'
import { command, copyOf } from './rigs-plant.ts'

test('[03-14] an `any` fails the linter, and so does a warning, as a parameter that is not used', (t) => {
  const any = command(copyOf(t, '14', ['rig/spare.ts']), 'lint')
  assert.notEqual(any.code, 0, any.out)
  assert.match(any.out, /rig\/loose\.ts.*noExplicitAny/)
  assert.doesNotMatch(any.out, /rig\/tight\.ts/)

  const warning = command(copyOf(t, '14', ['rig/loose.ts']), 'lint')
  assert.notEqual(warning.code, 0, warning.out)
  assert.match(warning.out, /rig\/spare\.ts.*noUnusedFunctionParameters/)
  assert.match(warning.out, /Found 1 warning/)
  assert.doesNotMatch(warning.out, /Found \d+ error|rig\/tight\.ts/)

  const neither = command(copyOf(t, '14', ['rig/loose.ts', 'rig/spare.ts']), 'lint')
  assert.equal(neither.code, 0, neither.out)
})

test('[03-24] a `!` that claims a value is there fails the linter', (t) => {
  const withIt = command(copyOf(t, '24'), 'lint')
  assert.notEqual(withIt.code, 0, withIt.out)
  assert.match(withIt.out, /rig\/claim\.ts.*noNonNullAssertion/)
  assert.doesNotMatch(withIt.out, /rig\/asked\.ts/)

  const withoutIt = command(copyOf(t, '24', ['rig/claim.ts']), 'lint')
  assert.equal(withoutIt.code, 0, withoutIt.out)
})
