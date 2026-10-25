import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, planted, result, run } from './rigs-plant.ts'

// The rig of the measures, by the address a planted file imports it from wherever the file lies.
const budgets = new URL('../rig/budgets.ts', import.meta.url).href

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

test('[03-2] a measure above a bar that is owed, by the owner, after the release is written and said, and its test passes', (t) => {
  const folder = copyOf(t, '2', [])
  const bars = JSON.parse(readFileSync(join(folder, 'budgets.json'), 'utf8'))
  bars['slow.work'].owed = 'reached after the release'
  writeFileSync(join(folder, 'budgets.json'), JSON.stringify(bars))
  const owed = run(folder)
  const held = result(folder)
  assert.equal(held.tests['99-1'], 'passed', owed.out)
  assert.equal(held.tests['99-2'], 'failed', 'a bar that is not owed holds as before')
  assert.ok(timeOf(held.measures['slow.work'], 5) > 5, owed.out)
  assert.match(
    owed.out,
    /the measure slow\.work is [\d.]+ ms, above its bar of 5, which is owed: reached after the release/,
  )
})

test('[03-2] a share that a test works out itself is held to its bar in percent, owed or not, and written', (t) => {
  const folder = copyOf(t, '2', ['tests/over.test.ts', 'tests/under.test.ts'])
  const bars = JSON.parse(readFileSync(join(folder, 'budgets.json'), 'utf8'))
  bars['share.owed'] = { bar: 2, unit: 'percent', owed: 'reached after the release' }
  bars['share.held'] = { bar: 2, unit: 'percent' }
  writeFileSync(join(folder, 'budgets.json'), JSON.stringify(bars))
  writeFileSync(
    join(folder, 'tests', 'share.test.ts'),
    [
      "import { test } from 'node:test'",
      `import { held } from '${budgets}'`,
      "test('[99-8] a share above a bar that is owed', () => held('share.owed', 3, 'percent'))",
      "test('[99-9] a share above a bar that is not owed', () => held('share.held', 3, 'percent'))",
      '',
    ].join('\n'),
  )
  const ran = run(folder)
  const written = result(folder)
  assert.equal(written.tests['99-8'], 'passed', ran.out)
  assert.equal(written.tests['99-9'], 'failed', ran.out)
  assert.deepEqual(written.measures['share.owed'], { value: 3, unit: 'percent', bar: 2 })
  assert.match(ran.out, /the measure share\.held is 3 percent, above its bar of 2/)
})

test('[03-2] the files that measure run alone after the others, and the run writes one result file of both', (t) => {
  const folder = copyOf(t, '2', ['tests/over.test.ts'])
  // A file that measures nothing ends a second after it starts, and leaves a mark that it ended.
  writeFileSync(
    join(folder, 'tests', 'plain.test.ts'),
    [
      "import { writeFileSync } from 'node:fs'",
      "import { test } from 'node:test'",
      "import { setTimeout as wait } from 'node:timers/promises'",
      "test('[99-6] a test that measures nothing', async () => {",
      '  await wait(1000)',
      "  writeFileSync('results/plain.done', '')",
      '})',
      '',
    ].join('\n'),
  )
  // A file that measures finds the mark: no file ran beside it.
  writeFileSync(
    join(folder, 'tests', 'alone.test.ts'),
    [
      "import assert from 'node:assert/strict'",
      "import { existsSync } from 'node:fs'",
      "import { test } from 'node:test'",
      `import { measure } from '${budgets}'`,
      "test('[99-7] a file that measures starts after the others ended', async () => {",
      "  assert.ok(existsSync('results/plain.done'))",
      "  await measure('alone.work', () => 1, { unit: 'bytes' })",
      '})',
      '',
    ].join('\n'),
  )
  const both = run(folder)
  assert.equal(both.code, 0, both.out)
  const held = result(folder)
  assert.deepEqual(held.tests, {
    '99-3': 'passed',
    '99-4': 'passed',
    '99-5': 'passed',
    '99-6': 'passed',
    '99-7': 'passed',
  })
  assert.deepEqual(Object.keys(held.measures).sort(), ['alone.work', 'no.bar', 'quick.work', 'small.file'])
})

test('[03-35] in a run that reports its bars, as the automatic runs on shared machines do, a measure above a bar that is not owed is written and said, and its test passes', (t) => {
  const folder = copyOf(t, '2', [])
  const reported = run(folder, false, { TENT_BARS: 'report' })
  assert.equal(reported.code, 0, reported.out)
  const held = result(folder)
  assert.deepEqual(held.tests, {
    '99-1': 'passed',
    '99-2': 'passed',
    '99-3': 'passed',
    '99-4': 'passed',
    '99-5': 'passed',
  })
  assert.ok(timeOf(held.measures['slow.work'], 5) > 5, reported.out)
  assert.match(
    reported.out,
    /the measure big\.file is 250 bytes, above its bar of 100, which this run reports and does not hold/,
  )
})
