import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, result, run } from './rigs-plant.ts'

test('[03-33] a test that fails is run once more, alone with the tests of its file: one that passes then passes the run and is named flaky, and one that fails again fails it', (t) => {
  const folder = copyOf(t, '33', ['tests/broken.test.ts'])
  const once = run(folder)
  assert.equal(once.code, 0, once.out)
  assert.match(once.out, /flaky: \[99-1\] a test that fails at its first try and passes at its second/)
  assert.deepEqual(result(folder).tests, { '99-1': 'passed', '99-2': 'passed' })
  assert.equal(readFileSync(join(folder, 'runs'), 'utf8'), 'ran\n', 'a file whose tests passed is not run again')

  const broken = copyOf(t, '33')
  const twice = run(broken)
  assert.notEqual(twice.code, 0, twice.out)
  assert.doesNotMatch(twice.out, /flaky: \[99-3\]/)
  assert.deepEqual(result(broken).tests, { '99-1': 'passed', '99-2': 'passed', '99-3': 'failed' })
})
