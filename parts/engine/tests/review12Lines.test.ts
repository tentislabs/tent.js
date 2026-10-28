import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'

test('[53-21] a line that a thread wrote into the memory of its program is told, also where a thread before it was ended between taking its room and writing its line', () => {
  const { NODE_TEST_CONTEXT: _, ...handed } = process.env
  const ended = spawnSync(process.execPath, [join(import.meta.dirname, 'review12Lines', 'told.ts')], {
    encoding: 'utf8',
    timeout: 60_000,
    env: handed,
  })
  assert.equal(ended.status, 0, ended.stderr)
  assert.equal(ended.stdout, 'the second line\n')
})
