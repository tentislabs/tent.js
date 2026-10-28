import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'

test('[54-6] a program whose page of Chromium was ended while a command of it waited ends with its tests, and is not held open by that command', () => {
  const { NODE_TEST_CONTEXT: _, ...handed } = process.env
  const began = performance.now()
  const ended = spawnSync(
    process.execPath,
    ['--import=./rig/jsx.ts', '--test', join('parts', 'engine', 'tests', 'review12Ended', 'waits.test.ts')],
    { cwd: join(import.meta.dirname, '..', '..', '..'), encoding: 'utf8', timeout: 300_000, env: handed },
  )
  const took = performance.now() - began
  assert.equal(ended.status, 0, `${ended.stdout}${ended.stderr}`)
  // The test itself takes seconds; a command left waiting held the program for the three minutes of its bound.
  assert.ok(took < 90_000, `the program ended ${Math.round(took / 1000)} s after it began`)
})
