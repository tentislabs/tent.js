import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typedApart } from './typed.ts'

test('[52-1] `tent test --room apart` runs the tests of an app with the test room asked for, and `--room program` and no flag in the room of the program', (t) => {
  const project = copied(t, 'tested-room')
  rmSync(join(project, 'tests'), { recursive: true, force: true })
  mkdirSync(join(project, 'tests'))
  // A test of the app that tells which room its run asked for, as `testApp` reads it.
  writeFileSync(
    join(project, 'tests', 'room.test.ts'),
    `import test from 'node:test'
import assert from 'node:assert/strict'

test('the room of the run', () => {
  assert.equal(process.env.TENT_ROOM ?? 'program', process.env.ROOM_ASKED)
})
`,
  )
  const ran = (room: string, ...words: string[]): number => {
    process.env.ROOM_ASKED = room
    try {
      return typedApart(project, 'test', ...words, '--json').ended
    } finally {
      delete process.env.ROOM_ASKED
    }
  }
  assert.equal(ran('apart', '--room', 'apart'), 0, 'the tests ran with the test room asked for')
  assert.equal(ran('program', '--room', 'program'), 0)
  // With no flag the run keeps the room that the program which typed the command states.
  assert.equal(ran(process.env.TENT_ROOM ?? 'program'), 0)
  assert.equal(ran('program', '--room', 'apart'), 1, 'the test fails where the run asked for another room')
})
