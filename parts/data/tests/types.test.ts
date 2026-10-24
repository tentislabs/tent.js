import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Row } from '../index.ts'
import { at, described, fieldsOf, seal, shopStore, writing } from './shop.ts'
import { codeOf, system } from './work.ts'

const description = described()

test('[20-1a] every type but a vector stores and returns its value unchanged, with its edge values', (t) => {
  const store = shopStore(t)
  const write = writing(store, description, system)
  const owner = write((db) => at(db, 'users').add({ name: 'Ada', email: 'ada@example.com', roles: [] }))
  const rows: Row[] = [
    { must: 'only what is required' },
    {
      must: '',
      title: 'Çalışkan "quoted" \'single\'; -- no comment\nsecond line 東京 🙂',
      count: 0.1 + 0.2,
      whole: 2 ** 53 - 1,
      on: true,
      at: new Date('2026-10-13T08:09:10.123Z'),
      due: '2024-02-29',
      kind: 'a',
      owner: owner.id,
      paper: 'file-0001',
      names: ['a', '', 'ü'],
      moments: [new Date(0), new Date('1999-12-31T23:59:59.999Z')],
      shape: { label: 'x', when: new Date('2020-02-02T02:02:02.002Z'), deep: { n: -1.5 } },
      loose: { list: [1, null, 'x', { deep: [true, false] }], zero: 0, empty: '' },
    },
    {
      must: 'x'.repeat(100_000),
      count: -1e308,
      whole: -(2 ** 53 - 1),
      on: false,
      at: new Date('9999-12-31T23:59:59.999Z'),
      due: '9999-12-31',
    },
    {
      must: ' ',
      count: 5e-324,
      whole: 0,
      at: new Date('0001-01-01T00:00:00.000Z'),
      due: '0001-01-01',
      kind: 'b',
      names: [],
      loose: [],
    },
    { must: '0', count: 0, loose: 0, shape: { label: '', deep: { n: 0 } }, moments: [] },
    { must: 'false', loose: false },
    { must: 'text', loose: 'a text that is JSON too' },
  ]
  for (const values of rows) {
    const added = write((db) => at(db, 'things').add(values))
    const { id, createdAt, updatedAt, ...held } = added
    assert.deepEqual(held, values)
    assert.match(String(id), /^[0-9a-hjkmnp-tv-z]{26}$/)
    assert.ok(createdAt instanceof Date && updatedAt instanceof Date)
    // What is read back is what was added.
    assert.deepEqual(
      write((db) => at(db, 'things').get(String(id))),
      added,
    )
  }
  // A change gives every value back the same way, and leaves what it does not name.
  const [first, second] = write((db) => at(db, 'things').all())
  const changed = write((db) => at(db, 'things').change(String(first.id), { ...rows[1], must: 'changed' }))
  assert.deepEqual(
    { ...changed, id: 0, createdAt: 0, updatedAt: 0 },
    { ...second, must: 'changed', id: 0, createdAt: 0, updatedAt: 0 },
  )
  assert.deepEqual(changed.createdAt, first.createdAt)
})

test('[20-1a] a sealed column returns its value, and is readable neither in the data file nor in its kept earlier version', (t) => {
  const store = shopStore(t)
  const write = writing(store, description, system, { seal })
  const team = write((db) => at(db, 'teams').add({ name: 'North' }))
  const added = write((db) =>
    at(db, 'customers').add({ name: 'Acme', team: team.id, taxNo: 'TR-1234567', credit: 41.5 }),
  )
  assert.equal(added.taxNo, 'TR-1234567')
  assert.equal(added.credit, 41.5)
  assert.deepEqual(
    write((db) => at(db, 'customers').get(String(added.id))),
    added,
  )

  // The file holds the sealed text, bound to the table, the column and the row, and nothing of the value.
  const kept = store.sql?.('SELECT "taxNo", "credit" FROM "customers"', []) ?? []
  assert.deepEqual(kept, [
    {
      taxNo: seal.close('TR-1234567', `customers.taxNo.${added.id}`),
      credit: seal.close(41.5, `customers.credit.${added.id}`),
    },
  ])
  assert.ok(!JSON.stringify(kept).includes('TR-1234567'))

  // A change keeps the earlier version of the row, which holds the sealed text as the row held it.
  const changed = write((db) => at(db, 'customers').change(String(added.id), { taxNo: 'TR-7654321' }))
  assert.equal(changed.taxNo, 'TR-7654321')
  const earlier = store.read({ from: '_t_history' }, system).value
  assert.ok(Array.isArray(earlier) && earlier.length === 1)
  assert.ok(!JSON.stringify(earlier).includes('TR-1234567'))
  assert.ok(JSON.stringify(earlier).includes('sealed:customers.taxNo.'))
  // `history` opens it again, with the bound of the row it came from.
  const history = write((db) => at(db, 'customers').history(String(added.id)))
  assert.equal(history.length, 1)
  assert.equal(history[0].value.taxNo, 'TR-1234567')
  assert.equal(history[0].value.credit, 41.5)

  // A filter and a sort on a sealed column are refused, for a filter made in code.
  const reads: ((db: object) => unknown)[] = [
    (db: object) => at(db, 'customers').where({ taxNo: 'TR-7654321' }).all(),
    (db: object) =>
      at(db, 'customers')
        .where({ any: [{ name: 'Acme' }, { credit: { above: 1 } }] })
        .count(),
    (db: object) => at(db, 'customers').sort('taxNo').all(),
    (db: object) => at(db, 'customers').count({ taxNo: { empty: true } }),
  ]
  for (const read of reads)
    assert.equal(
      codeOf(() => write(read)),
      'T2011',
    )
  // With no key at hand a read and a write of a sealed column fail, and say so.
  const bare = writing(store, description, system)
  assert.equal(
    codeOf(() => bare((db) => at(db, 'customers').get(String(added.id)))),
    'T0019',
  )
  assert.equal(
    codeOf(() => bare((db) => at(db, 'customers').add({ name: 'Bolt', team: team.id, taxNo: 'x' }))),
    'T0019',
  )
  // A row whose sealed columns hold nothing needs no key.
  assert.equal(bare((db) => at(db, 'customers').add({ name: 'Bolt', team: team.id })).name, 'Bolt')
})

test('[20-1a] a column with from holds what its expression gives after every write, and a write to it is T2107', (t) => {
  const store = shopStore(t)
  const write = writing(store, description, system, { seal, now: () => Date.parse('2026-10-13T22:30:00Z') })
  const ada = write((db) => at(db, 'users').add({ name: 'Ada', email: 'ada@example.com', roles: [] }))
  const team = write((db) => at(db, 'teams').add({ name: 'North' }))
  const acme = write((db) => at(db, 'customers').add({ name: 'Acme', team: team.id }))
  const order = write((db) => at(db, 'orders').add({ customer: acme.id, placedBy: ada.id, net: 10.004 }))
  assert.equal(order.gross, 12)
  assert.equal(order.label, 'open 10.004')
  // The day of the moment in the zone of the project, which is three hours ahead of UTC.
  assert.equal(order.placedOn, '2026-10-14')
  // A `from` that names a column which holds nothing holds nothing.
  assert.ok(!('share' in order) && !('weight' in order))

  const changed = write((db) =>
    at(db, 'orders').change(String(order.id), { net: 99.99, status: 'paid', parts: 4, weights: [1, 2.5, 3] }),
  )
  assert.equal(changed.gross, 119.99)
  assert.equal(changed.label, 'paid 99.99')
  assert.equal(changed.share, 24.9975)
  assert.equal(changed.weight, 6.5)
  assert.deepEqual(
    write((db) => at(db, 'orders').get(String(order.id))),
    changed,
  )
  // A division by zero gives no finite number, and the column then holds nothing. A cleared column does the same.
  const byZero = write((db) => at(db, 'orders').change(String(order.id), { parts: 0, weights: null }))
  assert.ok(!('share' in byZero) && !('weight' in byZero))
  assert.equal(byZero.gross, 119.99)
  // It can be filtered and sorted like any column.
  assert.equal(
    write((db) =>
      at(db, 'orders')
        .where({ gross: { above: 100 } })
        .sort('-gross')
        .all(),
    ).length,
    1,
  )

  for (const wrong of [
    () => write((db) => at(db, 'orders').add({ customer: acme.id, placedBy: ada.id, net: 1, gross: 5 })),
    () => write((db) => at(db, 'orders').change(String(order.id), { label: 'mine' })),
    () => write((db) => at(db, 'orders').change(String(order.id), { placedOn: null })),
  ])
    assert.equal(codeOf(wrong), 'T2107')
  assert.deepEqual(
    write((db) => at(db, 'orders').get(String(order.id))),
    byZero,
  )
})

test('[20-13] a value that does not fit its column is T2107, and null clears an optional column and is refused for a required one', (t) => {
  const store = shopStore(t)
  const write = writing(store, description, system, { seal })
  const thing = write((db) => at(db, 'things').add({ must: 'here', title: 'a title', count: 1, names: ['a'] }))
  const wrong: [string, unknown][] = [
    ['count', Number.NaN],
    ['count', Number.POSITIVE_INFINITY],
    ['count', Number.NEGATIVE_INFINITY],
    ['count', '5'],
    ['whole', 1.5],
    ['title', 5],
    ['on', 'yes'],
    ['at', 'no moment'],
    ['at', new Date(Number.NaN)],
    ['due', '2024-02-30'],
    ['kind', 'c'],
    ['owner', 5],
    ['names', 'a'],
    ['names', [1]],
    ['moments', ['never']],
    ['shape', { label: 5, deep: { n: 1 } }],
    ['shape', { label: 'x' }],
    ['must', null],
    ['nope', 1],
    ['id', '00000000000000000000000000'],
    ['createdAt', new Date()],
  ]
  for (const [column, value] of wrong) {
    for (const call of [
      () => write((db) => at(db, 'things').add({ must: 'x', [column]: value })),
      () => write((db) => at(db, 'things').change(String(thing.id), { [column]: value })),
    ]) {
      assert.equal(codeOf(call), 'T2107', `${column}: ${String(value)}`)
      // The error names the column, and for a value inside a list or an object the place inside it.
      const named = Object.keys(fieldsOf(call))
      assert.ok(named.length > 0 && named.every((name) => name === column || name.startsWith(`${column}.`)), `${named}`)
    }
  }
  // Nothing for a required column, and a value past a limit of its type.
  assert.equal(
    codeOf(() => write((db) => at(db, 'things').add({ title: 'no must' }))),
    'T2107',
  )
  const team = write((db) => at(db, 'teams').add({ name: 'North' }))
  assert.equal(
    codeOf(() => write((db) => at(db, 'customers').add({ name: 'x'.repeat(81), team: team.id }))),
    'T2107',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'lines').add({ order: thing.id, qty: 0 }))),
    'T2107',
  )
  // Not one of them wrote anything.
  assert.deepEqual(
    write((db) => at(db, 'things').all()),
    [thing],
  )

  // `null` clears an optional column: the row then does not hold it.
  const cleared = write((db) => at(db, 'things').change(String(thing.id), { title: null, count: null, names: null }))
  assert.deepEqual(Object.keys(cleared).sort(), ['createdAt', 'id', 'must', 'updatedAt'])
  // Given for a column in an add, it is a value that was not given.
  const added = write((db) => at(db, 'things').add({ must: 'y', title: null }))
  assert.ok(!('title' in added))
})
