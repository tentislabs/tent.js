import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typedApart } from './typed.ts'

test('[15-6@4] `tent test` shows the whole failure of a test that failed, with what that test wrote out and where it failed, and its fix names what a builder of an app can run', (t) => {
  const project = copied(t, 'tested-whole')
  writeFileSync(
    join(project, 'tests', 'fails.test.ts'),
    `import test from 'node:test'
import assert from 'node:assert/strict'

test('a test that passes, and writes', () => {
  console.log('written by the test that passed')
})

test('the order holds its total', () => {
  console.log('the order as the test found it: 42')
  console.error('said on the side of the errors')
  assert.deepEqual({ total: 4250, paid: false }, { total: 42.5, paid: false })
})

test('a test that throws', () => {
  console.log('before it threw')
  throw new TypeError('the row has no owner')
})
`,
  )
  // The command starts the test runner of the runtime, which starts none inside a test: so it is a program of its own.
  const tested = typedApart(project, 'test', '--json')
  assert.equal(tested.ended, 1)
  const found = (tested.answer.findings ?? []).filter((one) => one.where?.file === 'tests/fails.test.ts')
  assert.equal(found.length, 2)
  const [compared, thrown] = found.map((one) => one.message)
  // The whole failure: both values, as the runner sets them side by side, and the line of the test file.
  assert.match(compared, /the order holds its total/)
  assert.match(compared, /4250/)
  assert.match(compared, /42\.5/)
  assert.match(compared, /fails\.test\.ts:11/)
  // What that test wrote out, on both sides, and nothing that another test wrote.
  assert.match(compared, /the order as the test found it: 42/)
  assert.match(compared, /said on the side of the errors/)
  assert.doesNotMatch(compared, /written by the test that passed/)
  assert.doesNotMatch(compared, /before it threw/)
  assert.match(thrown, /TypeError: the row has no owner/)
  assert.match(thrown, /before it threw/)
  assert.match(thrown, /fails\.test\.ts:16/)
  assert.doesNotMatch(thrown, /the order as the test found it/)
  // The fix names what a builder of an app can run: the command itself, and no call of the runtime.
  for (const one of found) {
    assert.match(String(one.fix), /\`tent test\`/)
    assert.doesNotMatch(String(one.fix), /node --test/)
  }
  // Typed with no --json, the same is printed as text.
  const typed = typedApart(project, 'test')
  assert.equal(typed.ended, 1)
  assert.match(typed.printed, /the order as the test found it: 42/)
  assert.match(typed.printed, /TypeError: the row has no owner/)
})
