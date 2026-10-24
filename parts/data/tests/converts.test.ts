import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boolean, choice, date, day, link, list, number, project, table, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Row, Store } from '../index.ts'
import { factsOf, findMisfits } from '../index.ts'
import { at, described, reading, writing } from './shop.ts'
import { appTables, foundIn, planned, started, switched } from './switch.ts'
import { codeOf, system } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const shop = project('shop', {})

/** The rows of a table as the system reads them, without what every row has beside its columns. */
function rowsOf(store: Store, description: Description, name: string): Row[] {
  return at(reading(store, description, system), name)
    .all()
    .map(({ id: _, createdAt: __, updatedAt: ___, ...row }) => row)
}

/** One row of the rule: a type, the type it becomes, values that fit with what they become, and a value that does not fit. */
interface Converts {
  what: string
  from: () => object
  to: () => object
  fits: unknown[]
  become: unknown[]
  misfit?: unknown
}

const optional = { optional: true } as const
const rule: Converts[] = [
  {
    what: 'number to text: always, each number as JavaScript writes it',
    from: () => number(optional),
    to: () => text(optional),
    fits: [2, 2.5, -1, 0.1 + 0.2, 1e21, 0],
    become: ['2', '2.5', '-1', '0.30000000000000004', '1e+21', '0'],
  },
  {
    what: 'text to number: when every value reads as a number',
    from: () => text(optional),
    to: () => number(optional),
    fits: ['2', '-2.5', '1e3', '0'],
    become: [2, -2.5, 1000, 0],
    misfit: 'two',
  },
  {
    what: 'whole to not whole: always',
    from: () => number({ whole: true, optional: true }),
    to: () => number(optional),
    fits: [1, -2, 0],
    become: [1, -2, 0],
  },
  {
    what: 'not whole to whole: when every value is whole',
    from: () => number(optional),
    to: () => number({ whole: true, optional: true }),
    fits: [1, -3, 2e9],
    become: [1, -3, 2e9],
    misfit: 2.5,
  },
  {
    what: 'choice to text: always',
    from: () => choice(['a', 'b'], optional),
    to: () => text(optional),
    fits: ['a', 'b'],
    become: ['a', 'b'],
  },
  {
    what: 'text to choice: when every value is in the list',
    from: () => text(optional),
    to: () => choice(['a', 'b'], optional),
    fits: ['a', 'b', 'a'],
    become: ['a', 'b', 'a'],
    misfit: 'c',
  },
  {
    what: 'a wider list of choices: always',
    from: () => choice(['a', 'b'], optional),
    to: () => choice(['a', 'b', 'c'], optional),
    fits: ['a', 'b'],
    become: ['a', 'b'],
  },
]

const things = (v: object) => described([shop, table('things', { columns: { v: Object(v), tag: text() }, access })])

/** A store that holds one row of `things` for each value, and one whose column holds nothing. */
function holding(t: Parameters<typeof started>[0], type: object, values: unknown[]): Store {
  const { store } = started(t, [shop])
  const description = things(type)
  switched(store, description)
  writing(
    store,
    description,
    system,
  )((db) => {
    for (const [tag, v] of values.entries()) at(db, 'things').add({ v, tag: String(tag) })
    at(db, 'things').add({ tag: 'nothing' })
  })
  return store
}

test('[20-11] each row of the converts cleanly rule: a fitting set of rows converts, and one misfit refuses and is counted', (t) => {
  for (const { what, from, to, fits, become, misfit } of rule) {
    const next = things(to())
    const store = holding(t, from(), fits)
    switched(store, next)
    assert.deepEqual(
      rowsOf(store, next, 'things').map((row) => row.v),
      [...become, undefined],
      what,
    )
    // What was converted is held as the new type from then on.
    const again = writing(store, next, system)((db) => at(db, 'things').add({ v: become[0], tag: 'again' }))
    assert.deepEqual(again.v, become[0], what)
    if (misfit === undefined) continue

    const other = holding(t, from(), [...fits, misfit])
    const { steps, findings } = planned(other, next)
    assert.deepEqual(findings, [], what)
    assert.deepEqual(findMisfits(other, steps), [{ table: 'things', column: 'v', rows: 1 }], what)
    const [found, ...others] = factsOf(other, next).tableFindings
    assert.deepEqual(others, [], what)
    assert.equal(found.code, 'T2001', what)
    assert.match(found.message, /\b1 row /, what)
  }
})

test('[20-11] the number 2 becomes the text 2, and every other change of type is never applied by itself', (t) => {
  const store = holding(t, number(optional), [2])
  const next = things(text(optional))
  switched(store, next)
  assert.equal(rowsOf(store, next, 'things')[0].v, '2')
  assert.deepEqual(store.sql?.('SELECT "v" FROM "things" ORDER BY "_n"', []), [{ v: '2' }, { v: null }])

  const never: [object, object][] = [
    [date(optional), day(optional)],
    [day(optional), date(optional)],
    [number(optional), boolean(optional)],
    [boolean(optional), number(optional)],
    [text(optional), date(optional)],
    [text(optional), list(text(), optional)],
    [number(optional), choice(['1', '2'], optional)],
  ]
  for (const [from, to] of never) {
    const other = holding(t, from, [])
    assert.deepEqual(foundIn(other, things(to)), ['T2001'], JSON.stringify([from, to]))
  }
})

test('[20-11] a retired column and a retired table that a later layout holds again are revived with their values, and a revived link whose row is gone is cleared', (t) => {
  const customers = table('customers', { columns: { name: text() }, access })
  const drafts = table('drafts', { columns: { title: text() }, access })
  const orders = (customer: object, note: object) =>
    table('orders', { columns: { customer: Object(customer), note: Object(note), net: number() }, access })
  const first = described([shop, customers, orders(link('customers'), text()), drafts])
  const { store } = started(t, [shop])
  switched(store, first)
  const [acme, bolt] = writing(
    store,
    first,
    system,
  )((db) => {
    const ids = ['Acme', 'Bolt'].map((name) => String(at(db, 'customers').add({ name }).id))
    at(db, 'orders').add({ customer: ids[0], note: 'first', net: 10 })
    at(db, 'orders').add({ customer: ids[1], note: 'second', net: 20 })
    at(db, 'orders').add({ customer: ids[1], note: 'third', net: 30 })
    at(db, 'drafts').add({ title: 'd1' })
    return ids
  })

  // The link, a required column and a table are removed on purpose: each is retired.
  const without = described([
    project('shop', { removed: ['drafts'] }),
    customers,
    table('orders', { columns: { net: number() }, removed: ['customer', 'note'], access }),
  ])
  switched(store, without)
  assert.deepEqual(rowsOf(store, without, 'orders'), [{ net: 10 }, { net: 20 }, { net: 30 }])
  assert.equal(appTables(store).find((layout) => layout.name === 'drafts')?.retired, true)
  // The link between the two tables is taken away with it, so a row it pointed at can be removed.
  writing(
    store,
    without,
    system,
  )((db) => {
    at(db, 'customers').remove(bolt)
    at(db, 'orders').add({ net: 40 })
  })

  // Held again as required, the revival is checked against the rows: two whose customer is gone, and the row that
  // was added meanwhile, which has neither.
  const { steps, findings } = planned(store, first)
  assert.deepEqual(findings, [])
  assert.deepEqual(
    findMisfits(store, steps).sort((a, b) => a.column.localeCompare(b.column)),
    [
      { table: 'orders', column: 'customer', rows: 3 },
      { table: 'orders', column: 'note', rows: 1 },
    ],
  )
  const found = factsOf(store, first).tableFindings
  assert.deepEqual(
    found.map((one) => one.code),
    ['T2001', 'T2001'],
  )
  assert.ok(found.some((one) => /\b3 rows /.test(one.message) && /`orders\.customer`/.test(one.message)))

  // Held again as optional, each is revived with its values, and a link whose row is gone is cleared.
  const again = described([
    shop,
    customers,
    orders(link('customers', { optional: true }), text({ optional: true })),
    drafts,
  ])
  switched(store, again)
  assert.deepEqual(rowsOf(store, again, 'orders'), [
    { customer: acme, note: 'first', net: 10 },
    { note: 'second', net: 20 },
    { note: 'third', net: 30 },
    { net: 40 },
  ])
  assert.deepEqual(rowsOf(store, again, 'drafts'), [{ title: 'd1' }])
  assert.equal(appTables(store).find((layout) => layout.name === 'drafts')?.retired, undefined)
  // The revived link is held by the store again.
  const write = writing(store, again, system)
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').add({ customer: bolt, net: 1 }))),
    'T2104',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'customers').remove(acme))),
    'T2102',
  )
})
