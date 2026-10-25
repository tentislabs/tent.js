import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planted, result, run } from './rigs-plant.ts'

// The name of this test must not hold the mark of a heavy test itself, or the run of a pull request leaves it out.
test('[03-23] a heavy test is left out of the run of a pull request, and the night run carries it out', () => {
  const byDay = run(planted('23'))
  assert.equal(byDay.code, 0, byDay.out)
  assert.deepEqual(result(planted('23')).tests, { '99-1': 'passed', '99-3': 'passed', '99-5': 'passed' })

  const byNight = run(planted('23'), true)
  assert.equal(byNight.code, 0, byNight.out)
  assert.deepEqual(result(planted('23'), true).tests, { '99-2': 'passed', '99-4': 'passed', '99-6': 'passed' })
})

test('[03-34] the night run ends where a file holds no heavy test and its first hook opens what its last one closes', () => {
  const byNight = run(planted('34'), true)
  assert.equal(byNight.code, 0, byNight.out)
  assert.deepEqual(result(planted('34'), true).tests, { '99-2': 'passed' })
})
