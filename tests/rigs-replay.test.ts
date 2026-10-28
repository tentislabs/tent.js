import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, programs, result, root, run, start } from './rigs-plant.ts'

/** The tests of a planted tree that ran since the last look, each once by the word it wrote, in the order of the words. */
function ranIn(folder: string): string[] {
  const file = join(folder, 'runs')
  const ran = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
  rmSync(file, { force: true })
  return ran.sort()
}

test('[53-21] in the framework repository, node scripts/tests.mjs after a change of one source file runs only the test files that loaded it, --all runs every file, and a measure and a night test always run', (t) => {
  const folder = copyOf(t, '53-21')
  const first = run(folder)
  assert.equal(first.code, 0, first.out)
  assert.deepEqual(ranIn(folder), ['measure', 'one', 'two'])
  // Nothing changed: the two files are replayed, their tests stand as passed, and the measure is taken anew.
  const second = run(folder)
  assert.equal(second.code, 0, second.out)
  assert.deepEqual(ranIn(folder), ['measure'])
  assert.match(second.out, /replayed tests\/one\.test\.ts/)
  assert.deepEqual(result(folder).tests, { '99-1': 'passed', '99-2': 'passed', '99-3': 'passed' })
  // A change of the one source file that one test file loads runs that file again, and replays the other.
  writeFileSync(join(folder, 'parts', 'one', 'a.ts'), 'export const a = 3\n')
  const third = run(folder)
  assert.equal(third.code, 0, third.out)
  assert.deepEqual(ranIn(folder), ['measure', 'one'])
  // --all runs every file.
  const all = start(root, programs.tests, folder, '--all')
  assert.equal(all.code, 0, all.out)
  assert.deepEqual(ranIn(folder), ['measure', 'one', 'two'])
  // A night test runs in every night.
  for (let night = 0; night < 2; night++) {
    const heavy = run(folder, true)
    assert.equal(heavy.code, 0, heavy.out)
    assert.deepEqual(ranIn(folder), ['heavy'])
  }
})
