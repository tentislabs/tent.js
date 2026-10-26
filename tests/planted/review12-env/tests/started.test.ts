import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'

test('[99-1] a test whose program it starts reads a word of the environment that the test hands on whole', () => {
  const read = execFileSync(process.execPath, ['-e', "process.stdout.write(process.env.REVIEW12_WORD ?? 'none')"], {
    encoding: 'utf8',
    env: { ...process.env },
  })
  assert.equal(read, 'one')
})
