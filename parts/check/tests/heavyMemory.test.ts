import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf, lineWith } from './copies.ts'

test('[45-7] [15-1@10e] `heavy` on a query of a table kept in memory is the note T2030, at the query; a heavy query of a table that stays passes', async () => {
  const passing = await checkRules(copyOf(join('T2030', 'pass'), 'T2030-pass'))
  assert.deepEqual(passing.findings, [])
  const folder = copyOf(join('T2030', 'fail'), 'T2030-fail')
  const { findings } = await checkRules(folder)
  const text = readFileSync(join(folder, 'functions', 'functions.ts'), 'utf8')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line, one.where?.definition]),
    [['T2030', 'note', 'functions/functions.ts', lineWith(text, "query('whoIsHere'"), 'whoIsHere']],
  )
  assert.match(findings[0].message, /presence/)
  assert.ok(findings[0].fix)
})
