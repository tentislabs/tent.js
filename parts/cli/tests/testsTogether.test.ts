import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { copied, shell } from './typed.ts'

test('[54-3] tent test runs the test files of an app side by side: three files that each wait for the others to begin all meet, and pass', (t) => {
  const project = copied(t, 'together', 'together')
  // The framework's run gives each of its programs a share of the cores; this test is of the whole computer's.
  const { NODE_TEST_CONTEXT: _, TENT_RUN_CORES: __, ...env } = process.env
  // As many files as this computer runs at once, three at the most: each file waits until that many have begun.
  const cores = Number(
    spawnSync(process.execPath, ['-p', "require('node:os').availableParallelism()"], { encoding: 'utf8', env }).stdout,
  )
  const together = Math.max(1, Math.min(3, cores - 1))
  const ended = spawnSync(process.execPath, [shell, 'test', '--all', '--json'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 240_000,
    env: { ...env, TENT_TOGETHER: String(together) },
  })
  const value = Object(Object(JSON.parse(ended.stdout || '{}')).value)
  assert.deepEqual([value.passed, value.failed], [3, 0], `${ended.stdout}${ended.stderr}`)
})
