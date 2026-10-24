import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Row } from '../index.ts'
import { matches } from '../index.ts'
import { at, described, reading, seedShop, shopStore, writing } from './shop.ts'
import { system } from './work.ts'

const description = described()

/** A filter as a plan stores it, as this test makes its cases. */
type Stored = Parameters<typeof matches>[0]

// Each operator that holds one value.
const withValue = ['is', 'not', 'above', 'after', 'atLeast', 'below', 'before', 'atMost']

test('[20-2] the store answers every filter as matches answers it for the same row, a row whose column holds nothing among them', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const moment = new Date('2026-03-04T05:06:07.000Z')
  // A row that holds nothing in any column, and rows that hold the values the cases ask for, an empty one among them.
  const given: Row[] = [
    {},
    { title: '', names: [], loose: '' },
    { title: 'Ada', count: 0, whole: 3, on: false, at: moment, due: '2026-03-04', kind: 'a', owner: s.ada },
    { title: 'bob', count: 5.5, whole: -1, on: true, at: new Date(0), due: '2027-01-01', kind: 'b', owner: s.bob },
    { names: ['a', 'b'], loose: [] },
    { names: ['b'], loose: { deep: [1] } },
    { loose: 'text' },
  ]
  writing(store, description, system)((db) => given.map((row, n) => at(db, 'things').add({ ...row, must: `row ${n}` })))
  const db = reading(store, description, system)
  const rows = at(db, 'things').all()
  assert.equal(rows.length, given.length)

  // The values that a filter of each column asks for, by what the column holds.
  const asked: Record<string, unknown[]> = {
    title: ['Ada', 'ada', 'b', ''],
    count: [0, 5.5, 3],
    whole: [3, 0],
    on: [true, false],
    at: [moment, new Date(1)],
    due: ['2026-03-04', '2026-12-31'],
    kind: ['a', 'b'],
    owner: [s.ada, s.cy],
  }
  // A text, a number, a moment and a day have an order. A boolean, a choice and a link are the same or not.
  const ordered = ['title', 'count', 'whole', 'at', 'due']
  const leaves: Stored[] = []
  for (const [col, values] of Object.entries(asked)) {
    const operators = ordered.includes(col) ? withValue : ['is', 'not']
    for (const value of values) for (const operator of operators) leaves.push({ col, [operator]: value })
    leaves.push({ col, in: values }, { col, in: [] }, { col, in: values.slice(0, 1) })
  }
  for (const col of [...Object.keys(asked), 'names', 'loose', 'shape', 'moments', 'paper'])
    leaves.push({ col, empty: true }, { col, empty: false })
  for (const part of ['a', 'D', 'bob', ''])
    leaves.push({ col: 'title', contains: part }, { col: 'title', startsWith: part })
  leaves.push({ col: 'names', contains: 'a' }, { col: 'names', contains: 'z' })
  // A value that is nothing fits no row, under every operator.
  leaves.push({ col: 'title', is: null }, { col: 'count', not: null }, { col: 'count', above: null })

  // Each leaf as it is, turned round once and twice, and joined with a second one both ways.
  const other: Stored = { col: 'count', above: 1 }
  const cases: Stored[] = leaves.flatMap((leaf) => [
    leaf,
    { not: leaf },
    { not: { not: leaf } },
    { not: { all: [leaf, other] } },
    { not: { any: [leaf, other] } },
    { any: [{ not: leaf }, other] },
    { all: [{ not: leaf }, { not: other }] },
  ])
  assert.ok(cases.length > 1000, `${cases.length} cases`)

  const differ: string[] = []
  for (const filter of cases) {
    const read = db.read({ from: 'things', where: filter })
    const found = (Array.isArray(read) ? read : []).map((row: Row) => String(row.must)).sort()
    const fit = rows
      .filter((row) => matches(filter, row))
      .map((row) => String(row.must))
      .sort()
    if (found.join() !== fit.join())
      differ.push(`${JSON.stringify(filter)}: the store [${found.join(', ')}], matches [${fit.join(', ')}]`)
  }
  assert.deepEqual(differ.slice(0, 5), [], `${differ.length} of ${cases.length} filters are answered otherwise`)
})
