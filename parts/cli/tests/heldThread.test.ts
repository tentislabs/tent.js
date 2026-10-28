import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { recordedCopy, tested } from './recordedProject.ts'

const name = 'a thread that reads a file and waits on a lock'
const file = 'tests/held.test.ts'

/** How a run printed the test of the held thread: `passed`, `failed` or `replayed`. */
const standing = (printed: string): string | undefined =>
  printed
    .split('\n')
    .map((line) => /^(passed|failed|replayed) (.+)$/.exec(line.trim()))
    .find((found) => found?.[2] === `${file}: ${name}`)?.[1]

test('[53-5] a thread of a test that reads a file of the project, then waits on a lock and is ended, keeps its note: the test runs again after the file changed', (t) => {
  const project = recordedCopy(t, 'recorded-held', 'recordedHeld')
  const first = tested(project)
  assert.equal(first.ended, 0, first.printed)
  assert.equal(standing(first.printed), 'passed', first.printed)
  const record: unknown = JSON.parse(readFileSync(join(project, '.tent', 'tests.json'), 'utf8'))
  const kept: unknown = Reflect.get(Object(Reflect.get(Object(Reflect.get(Object(record), 'tests')), file)), name)
  const outside: unknown = Array.isArray(kept) ? Reflect.get(Object(kept[0]), 'outside') : undefined
  assert.ok(Array.isArray(outside) && outside.includes('file held.txt'), JSON.stringify(kept))
  writeFileSync(join(project, 'held.txt'), 'held, as written again\n')
  const second = tested(project)
  assert.equal(second.ended, 0, second.printed)
  assert.equal(standing(second.printed), 'passed', second.printed)
})
