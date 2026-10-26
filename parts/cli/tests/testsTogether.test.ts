import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { test } from 'node:test'
import { copied, shell } from './typed.ts'

test('[54-3] tent test runs the test files of an app side by side: three files that each wait for the others to begin all meet, and pass', (t) => {
  const project = copied(t, 'together', 'together')
  // As many files as this computer runs at once, three at the most: each file waits until that many have begun.
  const together = Math.max(1, Math.min(3, availableParallelism() - 1))
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ended = spawnSync(process.execPath, [shell, 'test', '--all', '--json'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 240_000,
    env: { ...env, TENT_TOGETHER: String(together) },
  })
  const value = Object(Object(JSON.parse(ended.stdout || '{}')).value)
  assert.deepEqual([value.passed, value.failed], [3, 0], `${ended.stdout}${ended.stderr}`)
})
