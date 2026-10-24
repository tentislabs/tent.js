import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as fields from '../page/fields.ts'

test('[32-4] the check of a send that walked the types of the input is gone: a form checks by what the build made alone', () => {
  assert.equal(Object.hasOwn(fields, 'checked'), false, 'the fields of the page code hold no check of types')
  const form = readFileSync(new URL('../page/form/form.tsx', import.meta.url), 'utf8')
  assert.ok(form.includes('checkedBy(checks, '), 'a send checks by the checks of the stub')
  assert.ok(!form.includes('checksOf('), 'a form makes no check of types itself')
})
