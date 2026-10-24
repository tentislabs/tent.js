import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { heldToProjects } from './copies.ts'

/** Holds a rule to its two projects, and each finding of its failing project to a line of its file. */
async function heldRule(name: string): Promise<Finding[]> {
  const { findings, folder } = await heldToProjects(name)
  for (const one of findings) {
    const file = one.where?.file ?? ''
    const lines = readFileSync(join(folder, file), 'utf8').split('\n').length
    assert.ok((one.where?.line ?? 0) > 0 && (one.where?.line ?? 0) <= lines, `${one.code} names a line of ${file}`)
    assert.ok(one.message.length > 10 && one.fix, one.code)
    assert.equal(one.docs, `tent docs ${one.code}`)
    assert.equal(one.level, 'error', one.code)
  }
  return findings
}

test("[45-3] [15-1@10e] a kept count of a table in a tenant's file, on a row of the shared file, is T2025, at the table that keeps it; a count inside one file passes", async () => {
  const findings = await heldRule('T2025')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].where?.definition, 'teams')
  assert.match(findings[0].message, /tasks/)
})

test('[45-6] [15-1@10e] a sort and a range on a findable sealed column are T2026, at each query; an equal value passes, and is no T2011', async () => {
  const findings = await heldRule('T2026')
  assert.deepEqual(findings.map((one) => one.where?.definition).sort(), ['byEmailOrder', 'emailsAfter'])
})

test('[45-7] [15-1@10e] a link from a table to a table kept in memory is T2027, at the table of the link; a link from a table of memory to one that stays passes', async () => {
  const findings = await heldRule('T2027')
  assert.deepEqual(
    findings.map((one) => one.where?.definition),
    ['notes'],
  )
})
