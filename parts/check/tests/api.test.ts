import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf, lineWith } from './copies.ts'

test('[32-7@8a] [15-1@8a] the part of T6007 for the API: a route at the address of an offered function is T6007, at its line, and a route under /api/ at another address is none', async () => {
  assert.ok(
    list.some((one) => one.name === 'T6007/api'),
    'the rule is built',
  )
  const passing = await checkRules(copyOf(join('T6007', 'api', 'pass'), 'T6007-api-pass'))
  assert.deepEqual(passing.findings, [])
  const folder = copyOf(join('T6007', 'api', 'fail'), 'T6007-api-fail')
  const text = readFileSync(join(folder, 'functions', 'api.ts'), 'utf8')
  const failing = (await checkRules(folder)).findings
  assert.deepEqual([...new Set(failing.map((one) => one.code))], ['T6007'])
  const found = failing.map((one) => `${one.where?.line}: ${one.message}`).join('\n')
  assert.deepEqual(
    failing.map((one) => one.where?.line).sort(),
    [lineWith(text, "route('totalsRoute'"), lineWith(text, "route('addRoute'")].sort(),
    found,
  )
  assert.ok(
    failing.some((one) => /totals/.test(one.message) && /\/api\/totals/.test(one.message)),
    found,
  )
  for (const one of failing) assert.deepEqual([one.level, one.where?.file], ['error', 'functions/api.ts'])
})
