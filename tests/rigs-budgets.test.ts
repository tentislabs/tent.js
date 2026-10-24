import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyOf, planted, result, run } from './rigs-plant.ts'

/** Holds that a measure of a time is written with its unit and its bar, and answers the time. */
function timeOf(measure: unknown, bar: number): number {
  assert.ok(typeof measure === 'object' && measure !== null && 'value' in measure && typeof measure.value === 'number')
  assert.deepEqual(measure, { value: measure.value, unit: 'ms', bar })
  return measure.value
}

test('[03-2] a measure above the bar of its name fails its test and is written, and one under its bar or with no bar passes', (t) => {
  const withThem = run(planted('2'))
  assert.notEqual(withThem.code, 0, withThem.out)
  const held = result(planted('2'))
  assert.deepEqual(held.tests, {
    '99-1': 'failed',
    '99-2': 'failed',
    '99-3': 'passed',
    '99-4': 'passed',
    '99-5': 'passed',
  })
  const { 'slow.work': slow, 'quick.work': quick, ...sizes } = held.measures
  assert.ok(timeOf(slow, 5) > 5, withThem.out)
  assert.ok(timeOf(quick, 5000) < 5000, withThem.out)
  assert.deepEqual(sizes, {
    'big.file': { value: 250, unit: 'bytes', bar: 100 },
    'no.bar': { value: 7, unit: 'bytes' },
    'small.file': { value: 3, unit: 'bytes', bar: 100 },
  })
  assert.match(withThem.out, /the measure slow\.work is [\d.]+ ms, above its bar of 5/)
  assert.match(withThem.out, /the measure big\.file is 250 bytes, above its bar of 100/)

  const folder = copyOf(t, '2', ['tests/over.test.ts'])
  const withoutThem = run(folder)
  assert.equal(withoutThem.code, 0, withoutThem.out)
  assert.deepEqual(result(folder).tests, { '99-3': 'passed', '99-4': 'passed', '99-5': 'passed' })
})
