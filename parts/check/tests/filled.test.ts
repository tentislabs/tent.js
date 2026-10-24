import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

async function checked(side: 'pass' | 'fail'): Promise<Finding[]> {
  const folder = copyOf(join('T2015', side), `T2015-${side}`)
  return (await checkRules(folder)).findings
}

test('[15-1@7b] T2015 has a passing project and a failing project, and the failing one gives exactly its code', async () => {
  assert.ok(
    list.some((one) => one.name === 'T2015'),
    'the rule T2015 is built',
  )
  assert.deepEqual(await checked('pass'), [])
  const findings = await checked('fail')
  assert.deepEqual([...new Set(findings.map((one) => one.code))], ['T2015'])
  for (const one of findings) {
    assert.ok((one.where?.line ?? 0) > 0, one.message)
    assert.ok(one.message.length > 10 && one.fix, one.message)
    assert.equal(one.docs, 'tent docs T2015')
  }
})

test('[51-12] the check reports as T2015 a filled column that is required, a by that names no action, an input that names no column, a ring of filled columns, an answer that does not fit, work that states no system or states rows, and a filter with filled on a column that states no by', async () => {
  const told = (await checked('fail')).map((one) => one.message)
  for (const piece of [
    /notes\.required.* required/,
    /notes\.byQuery.* no action/,
    /notes\.nowhere.* `nothing`/,
    /ring/,
    /notes\.size.* does not fit/,
    /notes\.looseOne.* states no `system`/,
    /notes\.rowsOne.* states `rows`/,
    /`filled`.* notes\.title/,
  ])
    assert.ok(
      told.some((one) => piece.test(one)),
      `${piece}: ${JSON.stringify(told)}`,
    )
})
