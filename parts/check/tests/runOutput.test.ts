import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

async function checked(rule: string, side: 'pass' | 'fail'): Promise<Finding[]> {
  const folder = copyOf(join(rule, side), `${rule.replace('/', '-')}-${side}`)
  return (await checkRules(folder)).findings
}

test('[15-1] T7009 holds a query written with `run` that answers a record, and a change written with `run` that answers one, each stating no `output`, at its line', async () => {
  assert.ok(list.some((one) => one.name === 'T7009/run'))
  assert.deepEqual(await checked('T7009/run', 'pass'), [])
  const findings = await checked('T7009/run', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [
      ['T7009', 'error', 'functions/orders.ts', 5],
      ['T7009', 'error', 'functions/orders.ts', 14],
      ['T7009', 'error', 'functions/orders.ts', 20],
    ],
  )
  assert.match(findings[0].message, /`output`/)
  assert.match(findings[0].fix ?? '', /`output`/)
  assert.equal(findings[0].docs, 'tent docs T7009')
})
