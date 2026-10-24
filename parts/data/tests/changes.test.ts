import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  boolean,
  calc,
  choice,
  col,
  date,
  day,
  link,
  model,
  number,
  project,
  round,
  table,
  text,
  vector,
} from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { measure } from '../../../rig/budgets.ts'
import type { Row, Store } from '../index.ts'
import { applySteps, cleanSteps, factsOf, findMisfits } from '../index.ts'
import { at, described, reading, seal, writing } from './shop.ts'
import { appTables, foundIn, placeOf, planned, started, switched } from './switch.ts'
import { codeOf, system } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const shop = project('shop', {})

/** The rows of a table as the system reads them, without what every row has beside its columns. */
function rowsOf(store: Store, description: Description, name: string): Row[] {
  return at(reading(store, description, system, { seal }), name)
    .all()
    .map(({ id: _, createdAt: __, updatedAt: ___, ...row }) => row)
}

/** What a raw text reads of a store. */
const raw = (store: Store, sql: string): Row[] => (store.sql?.(sql, []) ?? []).map((row) => ({ ...Object(row) }))

test('[20-4] the safe kinds of table change apply by themselves, a new choice value and a wider limit with no rebuild', (t) => {
  const first = table('notes', {
    columns: { title: text({ max: 10 }), kind: choice(['a', 'b']), n: number({ max: 10, optional: true }) },
    access,
  })
  const { store, description } = started(t, [shop, first])
  writing(
    store,
    description,
    system,
  )((db) => {
    at(db, 'notes').add({ title: 'one', kind: 'a', n: 1 })
    at(db, 'notes').add({ title: 'two', kind: 'b' })
  })
  const place = placeOf(store, 'notes')

  // A new table, a new optional column, columns with a default, a vector column, a new index, a new search
  // column, a new choice value and wider limits.
  const notes = (search: object) =>
    table('notes', {
      columns: {
        title: text({ max: 100 }),
        kind: choice(['a', 'b', 'c']),
        n: number({ max: 1000, optional: true }),
        more: text({ optional: true }),
        state: text({ default: 'new' }),
        flag: boolean({ default: false }),
        meaning: vector({ size: 3 }),
      },
      access,
      indexes: [['kind', 'title']],
      ...search,
    })
  const tags = table('tags', { columns: { name: text(), note: link('notes') }, access })
  const next = described([shop, notes({ search: ['title'] }), tags])
  const steps = switched(store, next)
  assert.ok(!steps.some((step) => step.do === 'rebuild'))
  assert.equal(placeOf(store, 'notes'), place, 'no table was built anew')
  // The rows that were there hold the default of each new column that has one.
  assert.deepEqual(rowsOf(store, next, 'notes'), [
    { title: 'one', kind: 'a', n: 1, state: 'new', flag: false },
    { title: 'two', kind: 'b', state: 'new', flag: false },
  ])
  const write = writing(store, next, system)
  const added = write((db) => at(db, 'notes').add({ title: 'a title of more than ten', kind: 'c', n: 500 }))
  assert.equal(write((db) => at(db, 'tags').add({ name: 'x', note: added.id })).note, added.id)
  assert.deepEqual(
    write((db) => at(db, 'notes').search('two').all()).map((row) => row.title),
    ['two'],
  )
  assert.equal(raw(store, 'SELECT count(*) AS "n" FROM "notes__meaning"')[0].n, 0)

  // Another way of searching: the index is built again, and finds a part of a word.
  const pieces = described([shop, notes({ search: { columns: ['title'], by: 'pieces' } }), tags])
  assert.deepEqual(
    switched(store, pieces).map((step) => step.do),
    ['addSearch'],
  )
  const find = (typed: string) =>
    writing(store, pieces, system)((db) => at(db, 'notes').search(typed).all()).map((row) => row.title)
  assert.deepEqual(find('itl'), ['a title of more than ten'])
  assert.deepEqual(find('tw'), ['two'])
  assert.equal(placeOf(store, 'notes'), place)
})

test('[20-4] a rename and a removal apply only with the statement, and what is removed is retired until it is cleaned', (t) => {
  const drafts = table('drafts', { columns: { title: text() }, access })
  const notes = table('notes', { columns: { title: text(), body: text(), old: text() }, access })
  const { store, description } = started(t, [shop, notes, drafts])
  writing(
    store,
    description,
    system,
  )((db) => {
    at(db, 'notes').add({ title: 't', body: 'b', old: 'kept' })
    at(db, 'drafts').add({ title: 'd' })
  })

  // A table under a new name with no `was`, a column under a new name with no `was`, a column that is gone and a
  // table that is gone are each found, and nothing is switched.
  const unstated: [object[], string[], string[]?][] = [
    [[shop, table('memos', { columns: { title: text(), body: text(), old: text() }, access }), drafts], ['T2004']],
    // A new column that every row must hold a value in is also held against the rows, which have none in it.
    [
      [shop, table('notes', { columns: { title: text(), words: text(), old: text() }, access }), drafts],
      ['T2004'],
      ['T2004', 'T2001'],
    ],
    [[shop, table('notes', { columns: { title: text(), body: text() }, access }), drafts], ['T2002']],
    [[shop, notes], ['T2003']],
  ]
  for (const [definitions, codes, withRows = codes] of unstated) {
    const next = described(definitions)
    assert.deepEqual(foundIn(store, next), codes)
    assert.deepEqual(
      factsOf(store, next).tableFindings.map((one) => one.code),
      withRows,
    )
    assert.ok(factsOf(store, next).tableFindings.every((one) => one.level === 'error' && one.fix))
  }
  assert.deepEqual(factsOf(store, description).tableFindings, [])

  // With the statement each is applied: the table and the column go on under their new names, and what was
  // removed is retired.
  const memos = table('memos', {
    columns: { title: text(), words: text({ was: ['body'] }) },
    was: ['notes'],
    removed: ['old'],
    access,
  })
  const stated = described([project('shop', { removed: ['drafts'] }), memos])
  switched(store, stated)
  assert.deepEqual(rowsOf(store, stated, 'memos'), [{ title: 't', words: 'b' }])
  const held = Object.fromEntries(appTables(store).map((layout) => [layout.name, layout]))
  assert.deepEqual(Object.keys(held).sort(), ['drafts', 'memos'])
  assert.deepEqual(held.memos.unused, ['old'])
  assert.equal(held.drafts.retired, true)
  // A removed column that was required is made optional, so a new row fits.
  writing(store, stated, system)((db) => at(db, 'memos').add({ title: 'new', words: 'w' }))
  // Nothing was dropped: the retired column and the retired table hold their values.
  assert.deepEqual(raw(store, 'SELECT "old" FROM "memos" ORDER BY "_n"'), [{ old: 'kept' }, { old: null }])
  assert.deepEqual(raw(store, 'SELECT "title" FROM "drafts"'), [{ title: 'd' }])

  // The clean drops what was retired, and nothing else.
  const clean = cleanSteps(appTables(store))
  assert.deepEqual(clean.map((step) => `${step.do} ${step.table} ${step.column ?? ''}`.trim()).sort(), [
    'dropColumn memos old',
    'dropTable drafts',
  ])
  store.write((tx) => applySteps(tx, store, clean), { steps: true })
  assert.deepEqual(
    appTables(store).map((layout) => [layout.name, Object.keys(layout.columns), layout.unused ?? []]),
    [['memos', ['title', 'words'], []]],
  )
  assert.equal(
    codeOf(() => raw(store, 'SELECT "title" FROM "drafts"')),
    'T0009',
  )
  assert.equal(
    codeOf(() => raw(store, 'SELECT "old" FROM "memos"')),
    'T0009',
  )
  assert.equal(rowsOf(store, stated, 'memos').length, 2)
  assert.deepEqual(cleanSteps(appTables(store)), [])
})

test('[20-4] a checked change is refused when one row does not fit, and names the count', (t) => {
  const people = (columns: Record<string, object> = {}, more: object = {}) =>
    described([
      shop,
      table('people', {
        columns: {
          name: text(),
          nick: text({ optional: true }),
          code: text(),
          age: number({ max: 200 }),
          kind: choice(['a', 'b', 'c']),
          ...columns,
        },
        access,
        ...more,
      }),
    ])
  const first = people()
  const { store } = started(t, [shop])
  switched(store, first)
  const ids = writing(
    store,
    first,
    system,
  )((db) =>
    [
      { name: 'Ada', nick: 'a', code: 'x', age: 30, kind: 'a' },
      { name: 'Bob', code: 'x', age: 150, kind: 'c' },
      { name: 'Cy', code: 'y', age: 40, kind: 'b' },
    ].map((row) => String(at(db, 'people').add(row).id)),
  )

  // Optional to required, a new unique, a narrower limit and a removed choice value.
  const checked: [Record<string, object>, object, string, number][] = [
    [{ nick: text() }, {}, 'nick', 2],
    [{}, { unique: [['code']] }, 'code', 1],
    [{ age: number({ max: 100 }) }, {}, 'age', 1],
    [{ kind: choice(['a', 'b']) }, {}, 'kind', 1],
  ]
  for (const [columns, more, column, rows] of checked) {
    const next = people(columns, more)
    const { steps, findings } = planned(store, next)
    assert.deepEqual(findings, [])
    assert.deepEqual(findMisfits(store, steps), [{ table: 'people', column, rows }])
    const [found, ...others] = factsOf(store, next).tableFindings
    assert.deepEqual(others, [])
    assert.equal(found.code, 'T2001')
    assert.match(found.message, new RegExp(`\\b${rows} rows? `))
    assert.match(found.message, new RegExp(`\`people\\.${column}\``))
    assert.match(String(found.fix), /new column/)
  }

  // Once every row fits, the four are applied.
  writing(
    store,
    first,
    system,
  )((db) => {
    at(db, 'people').change(ids[1], { nick: 'b', code: 'z', age: 90, kind: 'b' })
    at(db, 'people').change(ids[2], { nick: 'c' })
  })
  const all = people({ nick: text(), age: number({ max: 100 }), kind: choice(['a', 'b']) }, { unique: [['code']] })
  switched(store, all)
  const write = writing(store, all, system)
  const row = { name: 'Di', nick: 'd', code: 'w', age: 20, kind: 'a' }
  assert.equal(
    codeOf(() => write((db) => at(db, 'people').add({ ...row, code: 'x' }))),
    'T2101',
  )
  // The store itself holds the row to what the column now is.
  const stored = (values: Row) => codeOf(() => store.write((tx) => tx.add('people', values, system)))
  assert.equal(stored({ ...row, nick: undefined }), 'T2107')
  assert.equal(stored({ ...row, kind: 'c' }), 'T2107')
  assert.equal(stored(row), undefined)

  // Any other change of type is never applied by itself.
  const never: [object, object][] = [
    [date(), day()],
    [day(), date()],
    [number(), boolean()],
    [text(), date()],
    [boolean(), text()],
    [link('things'), text()],
  ]
  for (const [from, to] of never) {
    const before = described([shop, table('things', { columns: { v: Object(from) }, access })])
    const other = started(t, [shop]).store
    switched(other, before)
    const after = described([shop, table('things', { columns: { v: Object(to) }, access })])
    assert.deepEqual(foundIn(other, after), ['T2001'], JSON.stringify([from, to]))
    assert.match(planned(other, after).findings[0].message, /`things\.v`/)
  }
})

test('[20-4] a vector column whose model changed is refused with the count of its vectors, is emptied with old drop and kept with old keep', (t) => {
  const app = (o: { named?: string; as?: string; size?: number; old?: 'drop' | 'keep'; bare?: true } = {}) => {
    const embedder = model(o.as ?? 'embedder', { provider: 'openai', name: o.named ?? 'small', abilities: ['embed'] })
    const type = { size: o.size ?? 3, ...(o.bare ? {} : { model: embedder }), ...(o.old ? { old: o.old } : {}) }
    return described([shop, embedder, table('articles', { columns: { title: text(), meaning: vector(type) }, access })])
  }
  const first = app()
  const { store } = started(t, [shop])
  switched(store, first)
  writing(store, first, system)((db) => ['a', 'b', 'none'].map((title) => at(db, 'articles').add({ title })))
  // Raw SQL sees a vector table as it is stored: four bytes for each number, lowest byte first.
  const bytes = new Uint8Array(new Float32Array([1, 2, 3]).buffer)
  store.write((tx) =>
    tx.sql(
      'INSERT INTO "articles__meaning" ("_n", "v") SELECT "_n", ? FROM "articles" WHERE "title" <> ?',
      [bytes, 'none'],
      ['articles'],
    ),
  )
  const vectors = () => raw(store, 'SELECT count(*) AS "n" FROM "articles__meaning"')[0].n
  const column = () => Object(appTables(store)[0].columns.meaning)
  assert.equal(vectors(), 2)
  assert.equal(column().made, 'openai/small')

  // A model definition that is only renamed changes nothing.
  assert.deepEqual(planned(store, app({ as: 'other' })), { steps: [], findings: [] })

  // The model's own name changed, and the column does not say what becomes of its vectors.
  const [found, ...others] = factsOf(store, app({ named: 'large' })).tableFindings
  assert.deepEqual(others, [])
  assert.equal(found.code, 'T2001')
  assert.match(found.message, /\b2 rows /)
  assert.match(found.message, /openai\/small/)
  assert.match(found.message, /openai\/large/)
  assert.match(String(found.fix), /old/)
  // A change of the size is never applied by itself.
  assert.deepEqual(foundIn(store, app({ size: 4 })), ['T2001'])
  assert.deepEqual(foundIn(store, app({ size: 4, old: 'drop' })), ['T2001'])

  // `old: 'keep'`: every vector stays, and only the model is recorded.
  assert.deepEqual(
    switched(store, app({ named: 'large', old: 'keep' })).map((step) => step.do),
    ['relax'],
  )
  assert.equal(vectors(), 2)
  assert.equal(column().made, 'openai/large')
  // `old: 'drop'`: the column is emptied, to a new size too.
  assert.deepEqual(
    switched(store, app({ named: 'huge', size: 4, old: 'drop' })).map((step) => step.do),
    ['empty'],
  )
  assert.equal(vectors(), 0)
  assert.equal(column().made, 'openai/huge')
  assert.equal(column().size, 4)
  assert.equal(rowsOf(store, first, 'articles').length, 3)
  // A model that is no longer stated, and one that is stated for the first time, is recorded the same way.
  assert.deepEqual(
    switched(store, app({ size: 4, bare: true })).map((step) => step.do),
    ['relax'],
  )
  assert.equal(column().made, undefined)
  switched(store, app({ size: 4 }))
  assert.equal(column().made, 'openai/small')
})

test('[20-4] a rebuild of a table of a million rows is measured and written down, with how long writes waited', async (t) => {
  const { store, description } = started(t, [
    shop,
    table('rows', { columns: { n: number(), label: text({ optional: true }) }, access }),
  ])
  store.write((tx) =>
    tx.sql(
      'INSERT INTO "rows" ("id", "createdAt", "updatedAt", "n", "label") ' +
        'WITH RECURSIVE "c" ("x") AS (SELECT 1 UNION ALL SELECT "x" + 1 FROM "c" WHERE "x" < 1000000) ' +
        `SELECT printf('%026d', "x"), 0, 0, "x", 'row ' || "x" FROM "c"`,
      [],
      ['rows'],
    ),
  )
  // A write that comes while a table is built anew waits for the whole write that holds the rebuild.
  const waits: number[] = []
  const rebuilt = await measure(
    'data.rebuild.million',
    () => {
      const begun = performance.now()
      let took = 0
      store.write(
        () => {
          const before = performance.now()
          store.applyTableChanges([{ do: 'rebuild', table: 'rows' }])
          took = performance.now() - before
        },
        { steps: true },
      )
      waits.push(performance.now() - begun)
      return took
    },
    { unit: 'ms' },
  )
  const waited = await measure('data.rebuild.waited', () => waits.shift(), { unit: 'ms' })
  assert.ok(rebuilt > 0 && waited >= rebuilt, `${rebuilt} ms to build anew, ${waited} ms waited`)
  const rows = at(reading(store, description, system), 'rows')
  assert.equal(rows.count(), 1_000_000)
  assert.deepEqual(
    rows
      .where({ n: 777_777 })
      .all()
      .map((row) => row.label),
    ['row 777777'],
  )
})

test('[20-4] adding sealed to a column that holds rows, and adding a column with from, rebuild the table and leave every row readable', (t) => {
  const customers = (sealed: boolean, gross: boolean) =>
    described([
      shop,
      table('customers', {
        columns: {
          name: text(),
          taxNo: text({ optional: true, ...(sealed ? { sealed: true } : {}) }),
          credit: number({ optional: true, ...(sealed ? { sealed: true } : {}) }),
          net: number(),
          ...(gross ? { gross: number({ from: round(calc('*', col('net'), 1.2), 2) }) } : {}),
        },
        access,
      }),
    ])
  const first = customers(false, false)
  const { store } = started(t, [shop])
  switched(store, first)
  writing(
    store,
    first,
    system,
  )((db) => {
    at(db, 'customers').add({ name: 'Acme', taxNo: 'TR-1', credit: 41.5, net: 10.004 })
    at(db, 'customers').add({ name: 'Bolt', net: 20 })
    at(db, 'customers').add({ name: 'Core', taxNo: '', credit: 0, net: 0 })
  })
  const before = at(reading(store, first, system), 'customers').all()
  const place = placeOf(store, 'customers')
  const expected = before.map((row) => ({ ...row, gross: Math.round(Number(row.net) * 1.2 * 100) / 100 }))

  // With no key at hand the switch is refused, and leaves the file as it was.
  const next = customers(true, true)
  const { steps } = planned(store, next)
  assert.equal(
    codeOf(() => store.write((tx) => applySteps(tx, store, steps), { steps: true })),
    'T0019',
  )
  assert.equal(placeOf(store, 'customers'), place)
  assert.deepEqual(at(reading(store, first, system), 'customers').all(), before)

  switched(store, next, { seal })
  assert.notEqual(placeOf(store, 'customers'), place, 'the table was built anew')
  assert.ok(steps.some((step) => step.do === 'rebuild'))
  assert.deepEqual(at(reading(store, next, system, { seal }), 'customers').all(), expected)
  // The file holds the sealed text, bound to its row, and nothing where the column held nothing.
  const kept = raw(store, 'SELECT "id", "taxNo", "credit" FROM "customers" ORDER BY "_n"')
  assert.equal(kept[0].taxNo, seal.close('TR-1', `customers.taxNo.${kept[0].id}`))
  assert.equal(kept[0].credit, seal.close(41.5, `customers.credit.${kept[0].id}`))
  assert.deepEqual([kept[1].taxNo, kept[1].credit], [null, null])
  assert.equal(kept[2].taxNo, seal.close('', `customers.taxNo.${kept[2].id}`))
  assert.equal(kept[2].credit, seal.close(0, `customers.credit.${kept[2].id}`))

  // Taken from the column again, every row is opened, and is read with no key.
  const open = customers(false, true)
  switched(store, open, { seal })
  assert.deepEqual(at(reading(store, open, system), 'customers').all(), expected)
  assert.deepEqual(raw(store, 'SELECT "taxNo", "credit" FROM "customers" ORDER BY "_n"'), [
    { taxNo: 'TR-1', credit: 41.5 },
    { taxNo: null, credit: null },
    { taxNo: '', credit: 0 },
  ])
})

test('[20-4] a rebuild of a table that other tables link to leaves every link whole, and one that would leave a link without its row is undone with T2104', (t) => {
  const { store, description } = started(t, [
    shop,
    table('customers', { columns: { name: text() }, access }),
    table('orders', { columns: { customer: link('customers'), net: number() }, access }),
  ])
  const write = writing(store, description, system)
  const [acme, bolt] = write((db) => ['Acme', 'Bolt'].map((name) => String(at(db, 'customers').add({ name }).id)))
  write((db) => [acme, bolt, bolt].map((customer, net) => at(db, 'orders').add({ customer, net })))
  const linked = () =>
    at(reading(store, description, system), 'orders')
      .with('customer')
      .all()
  const before = linked()
  const place = placeOf(store, 'customers')

  store.write(() => store.applyTableChanges([{ do: 'rebuild', table: 'customers' }]), { steps: true })
  const rebuilt = placeOf(store, 'customers')
  assert.notEqual(rebuilt, place)
  assert.deepEqual(linked(), before)
  assert.deepEqual(
    before.map((row) => Object(row.customer).name),
    ['Acme', 'Bolt', 'Bolt'],
  )
  // The store holds the links again once the write has ended.
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').add({ customer: '0'.repeat(26), net: 1 }))),
    'T2104',
  )
  assert.equal(
    codeOf(() => store.write((tx) => tx.remove('customers', acme, system))),
    'T2102',
  )

  // A write that builds the table anew and takes a row away that others link to is undone, whole.
  const undone = codeOf(() =>
    store.write(
      (tx) => {
        store.applyTableChanges([{ do: 'rebuild', table: 'customers' }])
        tx.remove('customers', acme, system)
      },
      { steps: true },
    ),
  )
  assert.equal(undone, 'T2104')
  assert.equal(placeOf(store, 'customers'), rebuilt)
  assert.deepEqual(linked(), before)
  assert.equal(at(reading(store, description, system), 'customers').count(), 2)
})
