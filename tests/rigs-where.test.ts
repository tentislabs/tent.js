import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { inEveryEngine, listed } from '../rig/where.ts'
import { copyOf, programs, result, root, run, start } from './rigs-plant.ts'

/** The tests of a planted tree that ran since the last look, each once by the word it wrote, in the order of the words. */
function ranIn(folder: string): string[] {
  const file = join(folder, 'runs')
  const ran = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
  rmSync(file, { force: true })
  return ran.sort()
}

test('[53-21] with --list, node scripts/tests.mjs runs only the test files its list names, a measure among them, and a replayed file outside the list stands in no result', (t) => {
  const folder = copyOf(t, '53-21')
  writeFileSync(join(folder, 'listed.txt'), 'tests/measure.test.ts\ntests/one.test.ts\n')
  const listedRun = start(root, programs.tests, folder, '--list=listed.txt')
  assert.equal(listedRun.code, 0, listedRun.out)
  assert.deepEqual(ranIn(folder), ['measure', 'one'])
  assert.deepEqual(result(folder).tests, { '99-1': 'passed', '99-3': 'passed' })

  // The record of the listed file was kept, so a whole run replays it and runs the others; a list of one file then
  // replays that file, and its result holds none of the others.
  const whole = run(folder)
  assert.equal(whole.code, 0, whole.out)
  assert.deepEqual(ranIn(folder), ['measure', 'two'])
  writeFileSync(join(folder, 'listed.txt'), 'tests/two.test.ts\n')
  const replayed = start(root, programs.tests, folder, '--list=listed.txt')
  assert.equal(replayed.code, 0, replayed.out)
  assert.deepEqual(ranIn(folder), [])
  assert.deepEqual(result(folder).tests, { '99-2': 'passed' })
})

test('[53-21] the two lists of where the tests run name test files of the repository, each once and in order', () => {
  for (const list of ['tests/systems.txt', 'tests/browsers.txt']) {
    const files = listed(root, list)
    assert.ok(files.length > 0, `${list} names files`)
    assert.deepEqual(files, [...new Set(files)].sort(), `${list} names each file once, in order`)
    for (const file of files)
      assert.ok(/^(tests|parts\/[^/]+\/tests)\/[^/]+\.test\.ts$/.test(file) && existsSync(join(root, file)), file)
  }
})

test('[54-4] a test file that tests/browsers.txt names goes through the three engines, and any other through Chromium alone', (t) => {
  const tree = mkdtempSync(join(tmpdir(), 'tent-where-'))
  t.after(() => rmSync(tree, { recursive: true, force: true }))
  mkdirSync(join(tree, 'tests'))
  writeFileSync(join(tree, 'tests', 'browsers.txt'), 'parts/test/tests/moves.test.ts\n')
  assert.equal(inEveryEngine('parts/test/tests/moves.test.ts', tree), true)
  assert.equal(inEveryEngine('parts/test/tests/landing.test.ts', tree), false)
  // A tree with no list runs every file in Chromium alone.
  rmSync(join(tree, 'tests', 'browsers.txt'))
  assert.equal(inEveryEngine('parts/test/tests/moves.test.ts', tree), false)
})
