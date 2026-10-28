import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('a test that reads a file of the project through a program it starts', () => {
  const read = execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync('data.txt', 'utf8'))"], {
    encoding: 'utf8',
  })
  assert.equal(read.trim(), 'one')
})
