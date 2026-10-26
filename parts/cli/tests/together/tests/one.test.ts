import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Each file marks that it began, then waits until as many files as the test asks have begun: files that run one
// after another never meet, and each gives up at its bound.
const marks = join(import.meta.dirname, '..', 'began')
const together = Number(process.env.TENT_TOGETHER ?? '3')

test('one meets the files beside it', async () => {
  mkdirSync(marks, { recursive: true })
  writeFileSync(join(marks, 'one'), '')
  const until = performance.now() + 20_000
  while (readdirSync(marks).length < together && performance.now() < until)
    await new Promise((done) => setTimeout(done, 50))
  assert.ok(readdirSync(marks).length >= together, 'the other files ran beside this one')
})
