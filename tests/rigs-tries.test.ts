import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { system } from '../rig/system.ts'
import { copyOf, programs, result, root, run, start } from './rigs-plant.ts'

const flakyName = '[99-1] a test that fails at its first try and passes at its second'

test('[03-33] a test that fails is run once more, alone with the tests of its file: one that passes then passes the run and is named flaky, and one that fails again fails it', (t) => {
  const folder = copyOf(t, '33', ['tests/broken.test.ts'])
  const summary = join(folder, 'summary.md')
  writeFileSync(summary, '')
  const once = run(folder, false, { GITHUB_STEP_SUMMARY: summary })
  assert.equal(once.code, 0, once.out)
  assert.ok(once.out.includes(`flaky: ${flakyName}`), once.out)
  assert.deepEqual(result(folder).tests, { '99-1': 'passed', '99-2': 'passed' })
  assert.equal(readFileSync(join(folder, 'runs'), 'utf8'), 'ran\n', 'a file whose tests passed is not run again')
  // The flaky test is named where everyone sees it: in the result file, in the summary of the job and on the page
  // of state.
  assert.deepEqual(JSON.parse(readFileSync(join(folder, 'results', `${system()}.json`), 'utf8')).flaky, [flakyName])
  assert.ok(readFileSync(summary, 'utf8').includes(flakyName), readFileSync(summary, 'utf8'))
  const page = start(root, 'docs/state.mjs', join(folder, 'results'))
  assert.equal(page.code, 0, page.out)
  const flaky = readFileSync(join(folder, 'results', 'state.md'), 'utf8').split('## The flaky tests\n')[1] ?? ''
  assert.ok(flaky.includes(`- ${system()}: ${flakyName}`), flaky)

  const broken = copyOf(t, '33')
  const twice = run(broken)
  assert.notEqual(twice.code, 0, twice.out)
  assert.doesNotMatch(twice.out, /flaky: \[99-3\]/)
  assert.deepEqual(result(broken).tests, { '99-1': 'passed', '99-2': 'passed', '99-3': 'failed' })
  const failed = JSON.parse(readFileSync(join(broken, 'results', 'failed.json'), 'utf8'))
  assert.deepEqual(
    failed.failing.map((one: { name: string }) => one.name),
    ['[99-3] a test that fails at each try'],
  )
})

test('[03-33] with --times=3 the files of a list run three times in a row and none a second time: one failure fails the run, and nothing is named flaky', (t) => {
  const folder = copyOf(t, '33', ['tests/broken.test.ts'])
  writeFileSync(join(folder, 'new.txt'), 'tests/flaky.test.ts\ntests/plain.test.ts\n')
  const thrice = start(root, programs.tests, folder, '--list=new.txt', '--times=3')
  assert.notEqual(thrice.code, 0, thrice.out)
  assert.doesNotMatch(thrice.out, /flaky:/)
  assert.equal(readFileSync(join(folder, 'runs'), 'utf8'), 'ran\nran\nran\n', 'each file of the list ran three times')

  // Files that pass each time pass the run.
  const passing = copyOf(t, '33', ['tests/broken.test.ts', 'tests/flaky.test.ts'])
  writeFileSync(join(passing, 'new.txt'), 'tests/plain.test.ts\n')
  const kept = start(root, programs.tests, passing, '--list=new.txt', '--times=3')
  assert.equal(kept.code, 0, kept.out)
  assert.equal(readFileSync(join(passing, 'runs'), 'utf8'), 'ran\nran\nran\n')
})
