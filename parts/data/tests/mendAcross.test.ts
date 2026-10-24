import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TableLayout } from '../index.ts'
import { planTableChanges } from '../index.ts'

const table = (name: string, columns: TableLayout['columns'], tenant?: string): TableLayout => ({
  name,
  columns,
  indexes: [],
  unique: [],
  search: [],
  ...(tenant === undefined ? {} : { tenant }),
})

const link = (to: string): TableLayout['columns'][string] => ({ kind: 'link', table: to, onRemove: 'remove' })

const tables = (tenant: string): TableLayout[] => [
  table('teams', { name: { kind: 'text' } }),
  table('rooms', { name: { kind: 'text' } }),
  table('notes', { team: link('teams'), room: link('rooms'), body: { kind: 'text' } }, tenant),
]

test('[50-5] a table whose tenants are of another table than before is found with T2001, whose fix names the two switches with move that take it there', () => {
  const { findings } = planTableChanges(tables('team'), tables('room'))
  assert.deepEqual(
    findings.map((one) => one.code),
    ['T2001'],
  )
  const fix = String(findings[0]?.fix)
  assert.match(fix, /two/)
  assert.match(fix, /--move/)
  assert.match(fix, /shared file/)
})
