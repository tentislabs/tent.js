import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { tested } from './recordedProject.ts'
import { copied } from './typed.ts'

/** The project `chanced` beside these tests, copied, with a folder for what its programs make. */
function chancedCopy(t: TestContext, name: string): string {
  const project = copied(t, name, 'chanced')
  mkdirSync(join(project, '..', 'temp'), { recursive: true })
  return project
}

/** The failures of a run of `tent test --json`. */
const failuresOf = (value: unknown): { test: string; got?: unknown; randomSeed?: string }[] => {
  const failures: unknown = Reflect.get(Object(value), 'failures')
  return Array.isArray(failures) ? failures : []
}

test('[53-17] in a test, random(), token(), step.random(), a row id and Math.random() called by the app own code give the same values on two runs of the same test with the same random seed, and other values with another', (t) => {
  const project = chancedCopy(t, 'chance-17')
  // The test compares three test apps, two of one seed and one of another, in the room of the program and in the test
  // room; and what one seed drew is held against what it draws in a run of another program.
  for (const room of ['program', 'apart']) {
    const drawn = [1, 2].map(() => {
      const ran = tested(project, 'tests/seeded.test.ts', '--room', room, '--all')
      assert.equal(ran.ended, 0, `${room}: ${ran.printed}`)
      return JSON.parse(readFileSync(join(project, 'drawn.json'), 'utf8'))
    })
    assert.deepEqual(drawn[1], drawn[0], room)
  }
})

test('[53-18] with clock held the app clock stands until moved; Date.now() in the app code reads it, in the room of the program, the test room and the held room, while the test own code reads the time of the system', (t) => {
  const project = chancedCopy(t, 'chance-18')
  for (const room of ['program', 'apart']) {
    const ran = tested(project, 'tests/held.test.ts', '--room', room, '--all')
    assert.equal(ran.ended, 0, `${room}: ${ran.printed}`)
  }
  // The held room carries the actions of a project that states `hold`, in a program of their own.
  const file = join(project, 'tent.ts')
  writeFileSync(file, readFileSync(file, 'utf8').replace("{ title: 'Chanced' }", "{ title: 'Chanced', hold: true }"))
  const held = tested(project, 'tests/held.test.ts', '--all')
  assert.equal(held.ended, 0, `held: ${held.printed}`)
})

test('[53-18] a test on a held clock that opened a page is named as reaching outside the held clock', (t) => {
  const project = chancedCopy(t, 'chance-18-page')
  const ran = tested(project, 'tests/paged.test.ts', '--all')
  assert.equal(ran.ended, 0, ran.printed)
  assert.match(
    ran.printed,
    /^reached outside the held clock tests\/paged\.test\.ts: a page opened on a held clock: the browser's own timing$/m,
  )
})

test('[53-19] a failing test prints its random seed, and a run with that seed fails the same way', (t) => {
  const project = chancedCopy(t, 'chance-19')
  const ran = tested(project, 'tests/failing.test.ts', '--json')
  assert.equal(ran.ended, 1, ran.printed)
  const [failed] = failuresOf(ran.answer.value)
  // Where a test names no seed, its seed is its name.
  assert.equal(failed?.randomSeed, 'a draw that is never what it is held to')
  assert.equal(typeof failed?.got, 'number')
  const words = (ran.answer.findings ?? []).map((one) => one.message).join('\n')
  assert.ok(words.includes(`random seed: ${failed.randomSeed}`), words)
  // The seed it printed, given to a test of another name, draws the same and fails the same way.
  const again = readFileSync(join(project, 'tests', 'failing.test.ts'), 'utf8')
    .replace("test('a draw that is never what it is held to'", "test('the same draw again'")
    .replace('testApp()', `testApp({ randomSeed: ${JSON.stringify(failed.randomSeed)} })`)
  writeFileSync(join(project, 'tests', 'failing.test.ts'), again)
  const rerun = tested(project, 'tests/failing.test.ts', '--json')
  assert.equal(rerun.ended, 1, rerun.printed)
  const [same] = failuresOf(rerun.answer.value)
  assert.deepEqual([same?.test, same?.got, same?.randomSeed], ['the same draw again', failed.got, failed.randomSeed])
})
