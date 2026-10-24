import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf, lineWith } from './copies.ts'

// For each rule: the pieces of its failing project that a finding stands at, and what the finding says.
const cases: Record<string, [piece: string, says: RegExp][]> = {
  'T6007/incoming': [
    ["incoming('formAgain'", /formEvents.*\/hooks\/forms/],
    ["route('formRoute'", /formEvents.*\/hooks\/forms/],
  ],
  T3008: [["incoming('unsigned'", /neither `verify` nor `open`/]],
}

test('[32-7@8a] [15-1@8a] T3008 and the part of T6007 for a call coming in: each has a passing project and a failing project, and the failing one gives exactly its code, once for each mistake, at the line of the definition', async () => {
  const names = list.map((one) => one.name)
  for (const [name, pieces] of Object.entries(cases)) {
    const [code] = name.split('/')
    assert.ok(names.includes(name), `the rule ${name} is built`)
    const passing = await checkRules(copyOf(join(name, 'pass'), `${name.replace('/', '-')}-pass`))
    assert.deepEqual(passing.findings, [], `the passing project of ${name}`)
    const folder = copyOf(join(name, 'fail'), `${name.replace('/', '-')}-fail`)
    const text = readFileSync(join(folder, 'functions', 'hooks.ts'), 'utf8')
    const failing = (await checkRules(folder)).findings
    assert.deepEqual([...new Set(failing.map((one) => one.code))], [code], `the failing project of ${name}`)
    const lines = pieces.map(([piece]) => lineWith(text, piece))
    const found = failing.map((one) => `${one.where?.line}: ${one.message}`).join('\n')
    assert.deepEqual(failing.map((one) => one.where?.line).sort(), [...lines].sort(), `${name}:\n${found}`)
    for (const [k, [piece, says]] of pieces.entries())
      assert.ok(
        failing.some((one) => one.where?.line === lines[k] && says.test(one.message)),
        `${name} at ${piece}:\n${found}`,
      )
    for (const one of failing) assert.deepEqual([one.level, one.where?.file], ['error', 'functions/hooks.ts'])
  }
})
