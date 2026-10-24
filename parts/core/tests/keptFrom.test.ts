import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, date, link, max, min, number, project, sum, table, text } from '../index.ts'
import { describe } from '../internal.ts'

const shop = project('shop', { title: 'Shop' })
const orders = table('orders', {
  columns: { customer: link('customers'), total: number(), placedAt: date(), status: text() },
  access: { read: 'signedIn' },
})

/** The description of the shop, with its customers holding the columns given, and what describing it found. */
function described(columns: Record<string, unknown>) {
  const customers = table('customers', { columns: { name: text(), ...columns }, access: { read: 'signedIn' } })
  return describe({ definitions: [shop, orders, customers].map((value) => ({ value })) })
}

test('[45-3] a kept count, sum, least and most is a value word of `from`: the column stores how it is kept, a count as a whole number from 0, a sum from 0, and a least and a most as optional', () => {
  const { description, findings } = described({
    open: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) }),
    spent: number({ from: sum({ of: orders, by: 'customer', column: 'total' }) }),
    least: number({ from: min({ of: orders, by: 'customer', column: 'total' }) }),
    last: date({ from: max({ of: orders, by: 'customer', column: 'placedAt' }) }),
  })
  assert.deepEqual(
    findings.filter((one) => one.level === 'error'),
    [],
  )
  const columns = Object(description.tables.customers?.columns)
  assert.deepEqual(
    { ...columns.open, keeps: { ...columns.open.keeps, where: undefined } },
    { kind: 'number', whole: true, default: 0, keeps: { do: 'count', of: 'orders', by: 'customer', where: undefined } },
  )
  assert.ok(columns.open.keeps.where, 'the filter is kept')
  assert.deepEqual(columns.spent, {
    kind: 'number',
    default: 0,
    keeps: { do: 'sum', of: 'orders', by: 'customer', column: 'total' },
  })
  assert.deepEqual(columns.least, {
    kind: 'number',
    optional: true,
    keeps: { do: 'min', of: 'orders', by: 'customer', column: 'total' },
  })
  assert.deepEqual(columns.last, {
    kind: 'date',
    optional: true,
    keeps: { do: 'max', of: 'orders', by: 'customer', column: 'placedAt' },
  })
  // The column that the engine keeps holds no `from` of its own beside how it is kept.
  assert.equal(columns.open.from, undefined)
})

test('[45-3] a kept count or sum in a column that is no number, and a least or a most in a column of another kind than the column it reads, is T1014', () => {
  for (const columns of [
    { open: text({ from: count({ of: orders, by: 'customer' }) }) },
    { spent: date({ from: sum({ of: orders, by: 'customer', column: 'total' }) }) },
    { last: number({ from: max({ of: orders, by: 'customer', column: 'placedAt' }) }) },
    { least: date({ from: min({ of: orders, by: 'customer', column: 'total' }) }) },
  ]) {
    const { findings } = described(columns)
    assert.ok(
      findings.some((one) => one.code === 'T1014'),
      `${Object.keys(columns)[0]} is refused: ${JSON.stringify(findings)}`,
    )
  }
})
