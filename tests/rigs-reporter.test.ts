import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, planted, result, run } from './rigs-plant.ts'

test('[03-27] a test with no id in its name fails the run, and is named', (t) => {
  const withIt = run(planted('27'))
  assert.notEqual(withIt.code, 0, withIt.out)
  assert.match(withIt.out, /a test with no id in its name: a test that carries no id/)
  assert.doesNotMatch(withIt.out, /a test with no id in its name: \[99-1\]/)

  const withoutIt = run(copyOf(t, '27', ['tests/nameless.test.ts']))
  assert.equal(withoutIt.code, 0, withoutIt.out)
})

test('[03-28] a test that was skipped fails the run and is held as failed, and a skipped group fails the run', (t) => {
  const cases = ['tests/option.test.ts', 'tests/body.test.ts', 'tests/group.test.ts']
  const alone = (one: string) => {
    const folder = copyOf(
      t,
      '28',
      cases.filter((other) => other !== one),
    )
    const ended = run(folder)
    assert.notEqual(ended.code, 0, ended.out)
    return { out: ended.out, tests: result(folder).tests }
  }

  const option = alone('tests/option.test.ts')
  assert.match(option.out, /a test that was skipped: \[99-2\] a test that is skipped by its option/)
  assert.deepEqual(option.tests, { '99-1': 'passed', '99-2': 'failed' })

  const body = alone('tests/body.test.ts')
  assert.match(body.out, /a test that was skipped: \[99-3\] a test that is skipped in its body/)
  assert.deepEqual(body.tests, { '99-1': 'passed', '99-3': 'failed' })

  const group = alone('tests/group.test.ts')
  assert.match(group.out, /a group that was skipped: a group that is skipped/)

  const folder = copyOf(t, '28', cases)
  const withoutThem = run(folder)
  assert.equal(withoutThem.code, 0, withoutThem.out)
  assert.deepEqual(result(folder).tests, { '99-1': 'passed' })
})

test('[03-29] the result file holds each id as its tests ended, and what the rigs of the run wrote', () => {
  const parts = join(planted('29'), 'results', 'parts')
  rmSync(parts, { recursive: true, force: true })
  mkdirSync(parts, { recursive: true })
  writeFileSync(join(parts, 'measure.left.before.json'), JSON.stringify({ value: 1, unit: 'ms' }))
  writeFileSync(join(parts, 'picture.chromium.left.before.json'), JSON.stringify('approved'))

  const ended = run(planted('29'))
  assert.notEqual(ended.code, 0, ended.out)
  const held = result(planted('29'))
  assert.deepEqual(held.tests, {
    '99-1': 'failed',
    '99-2': 'passed',
    '99-3': 'passed',
    '99-4': 'failed',
    '99-5': 'owed',
    '99-6': 'passed',
    '99-7': 'failed',
    '99-8': 'failed',
    '99-9': 'owed',
  })
  assert.deepEqual(held.measures, { 'start.first': { value: 3, unit: 'ms', bar: 5 } })
  assert.deepEqual(held.pictures, { 'chromium/front.page': 'new' })
})

test('[03-29] a file of the rigs of another form than its kind has fails the run, and is not gathered', (t) => {
  const forms = [
    'measure.no.number.json',
    'measure.no.unit.json',
    'measure.cut.short.json',
    'measure.one.more.json',
    'picture.chromium.old.json',
  ]
  const folder = copyOf(t, '29', ['tests/ids.test.ts'])
  const withThem = run(folder)
  assert.notEqual(withThem.code, 0, withThem.out)
  for (const file of forms) assert.ok(withThem.out.includes(`of another form than its kind has: ${file}`), withThem.out)
  assert.doesNotMatch(withThem.out, /of another form than its kind has: (measure\.start|picture\.chromium\.front)/)
  assert.deepEqual(result(folder).measures, { 'start.first': { value: 3, unit: 'ms', bar: 5 } })
  assert.deepEqual(result(folder).pictures, { 'chromium/front.page': 'new' })

  const withoutThem = run(copyOf(t, '29', ['tests/ids.test.ts', 'tests/forms.test.ts']))
  assert.equal(withoutThem.code, 0, withoutThem.out)
})

test('[03-31] a test that stands inside another test fails the run, and is named', (t) => {
  const withIt = run(planted('31'))
  assert.notEqual(withIt.code, 0, withIt.out)
  assert.match(withIt.out, /a test that stands inside another test: \[99-3\] a test inside a test/)
  assert.match(withIt.out, /a test that stands inside another test: \[99-6\] a test in a group inside a test/)
  assert.doesNotMatch(withIt.out, /a test that stands inside another test: \[99-[1245]\]/)

  for (const one of ['tests/inside.test.ts', 'tests/grouped.test.ts']) {
    const alone = run(copyOf(t, '31', [one]))
    assert.notEqual(alone.code, 0, alone.out)
    assert.equal(alone.out.match(/a test that stands inside another test/g)?.length, 1, alone.out)
  }

  const withoutIt = run(copyOf(t, '31', ['tests/inside.test.ts', 'tests/grouped.test.ts']))
  assert.equal(withoutIt.code, 0, withoutIt.out)
})

test('[03-30] a test file that imports a file which is not there fails the run, whatever the mark of its tests', (t) => {
  const withIt = run(planted('30'))
  assert.notEqual(withIt.code, 0, withIt.out)
  assert.match(withIt.out, /tests\/gone\.test\.ts/)
  assert.deepEqual(result(planted('30')).tests, { '99-1': 'passed' })

  const withoutIt = run(copyOf(t, '30', ['tests/gone.test.ts']))
  assert.equal(withoutIt.code, 0, withoutIt.out)
})
