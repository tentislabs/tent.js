import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'

const cache = join('results', 'compile-cache')

test('[99-1] a test that starts a program which holds memory, both handed the compile cache of the run', () => {
  assert.ok(process.env.NODE_COMPILE_CACHE?.endsWith(cache), String(process.env.NODE_COMPILE_CACHE))
  // The program holds some forty megabytes for a moment, so that its peak is told apart from the test's own.
  const told = execFileSync(
    process.execPath,
    ['-e', "const held = Buffer.alloc(40 * 1024 * 1024, 1); process.stdout.write(String(process.env.NODE_COMPILE_CACHE) + ' ' + held.length)"],
    { encoding: 'utf8' },
  )
  assert.equal(told, `${process.env.NODE_COMPILE_CACHE} ${40 * 1024 * 1024}`)
})
