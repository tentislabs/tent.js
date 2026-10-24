import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

async function checked(side: 'pass' | 'fail'): Promise<Finding[]> {
  const folder = copyOf(join('T7014', side), `T7014-${side}`)
  return (await checkRules(folder)).findings
}

test('[15-1@8a] T7014 has a passing project and a failing project, and the failing one notes a call of `fetch` and an import of a network module of the runtime, each at its line', async () => {
  assert.ok(
    list.some((one) => one.name === 'T7014'),
    'the rule T7014 is built',
  )
  assert.deepEqual(await checked('pass'), [])
  const findings = await checked('fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [
      ['T7014', 'note', 'functions/reach.ts', 1],
      ['T7014', 'note', 'functions/reach.ts', 12],
    ],
  )
  for (const one of findings) {
    assert.ok(one.message.length > 10 && one.fix, one.message)
    assert.equal(one.docs, 'tent docs T7014')
  }
})
