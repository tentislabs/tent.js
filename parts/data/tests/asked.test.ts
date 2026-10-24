import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { avg, count, link, max, min, project, sum, TentError, table, text, vector } from '../../core/index.ts'
import type { Row, Searcher, Store, TableLayout } from '../index.ts'
import { connected, createDb, historyTable, layoutOf } from '../index.ts'
import { at, described, reading, seal, seedShop, shopStore, sqlOf, user, writing } from './shop.ts'
import { codeOf, made, opened, system, workFolder } from './work.ts'

const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
const library = described([
  project('library', {}),
  table('articles', { columns: { title: text(), meaning: vector({ size: 2 }) }, access }),
  table('notes', {
    columns: { body: text(), kind: text({ optional: true }), writer: link('people') },
    access: { ...access, read: 'owner' },
    owner: 'writer',
    search: ['body'],
  }),
  table('people', { columns: { name: text() }, access }),
])
const titles = (rows: Row[]): unknown[] => rows.map((row) => row.title)

test('[20-17a] near inside a change answers no row with the distance of another: a row that the change removed is gone, and one it added is not seen before the commit', (t) => {
  const store = opened(workFolder(t))
  made(store, layoutOf(library))
  const write = writing(store, library, system)
  write((db) => {
    at(db, 'articles').add({ title: 'east', meaning: [1, 0] })
    at(db, 'articles').add({ title: 'north-east', meaning: [1, 1] })
  })
  const last = String(write((db) => at(db, 'articles').add({ title: 'north', meaning: [0, 1] })).id)
  const nearest = (db: object, limit: number) => at(db, 'articles').near('meaning', [0, 1]).limit(limit).all()
  assert.deepEqual(titles(nearest(reading(store, library, system), 1)), ['north'])

  // The change removes the last row, and adds one: the store hands the inside number of the removed row out again.
  const inside = write((db) => {
    at(db, 'articles').remove(last)
    at(db, 'articles').add({ title: 'almost east', meaning: [1, 0.1] })
    return { one: nearest(db, 1), all: nearest(db, 10) }
  })
  // The removed row is gone, and the new one is not answered with the distance that the removed one had.
  assert.deepEqual(titles(inside.one), ['north-east'])
  assert.deepEqual(titles(inside.all), ['north-east', 'east'])
  assert.ok(Math.abs(Number(inside.one[0].distance) - (1 - Math.SQRT1_2)) < 1e-6)
  // Once the change is committed, the new row has its own distance.
  const after = nearest(reading(store, library, system), 10)
  assert.deepEqual(titles(after), ['north-east', 'almost east', 'east'])
  assert.ok(Math.abs(Number(after[1].distance) - 0.9005) < 1e-3, String(after[1].distance))

  // The same holds where a filter picks the rows that are looked at.
  const filtered = write((db) => {
    const added = at(db, 'articles').add({ title: 'north again', meaning: [0, 1] })
    at(db, 'articles').remove(String(added.id))
    at(db, 'articles').add({ title: 'south', meaning: [0, -1] })
    return at(db, 'articles')
      .where({ title: { not: 'east' } })
      .near('meaning', [0, 1])
      .limit(10)
      .all()
  })
  assert.deepEqual(titles(filtered), ['north-east', 'almost east'])
})

/** A page as `db` answers it: its rows, and the cursor of the page after it where there is one. */
function pageOf(value: unknown): { rows: Row[]; next?: string } {
  assert.ok(typeof value === 'object' && value !== null && 'rows' in value && Array.isArray(value.rows))
  const rows: Row[] = value.rows
  return { rows, ...('next' in value && typeof value.next === 'string' ? { next: value.next } : {}) }
}

/** The names of what a data file holds of a search index of the store's own: its tables and its triggers. */
function indexIn(folder: string): string[] {
  const file = new DatabaseSync(join(folder, 'data.db'), { readOnly: true })
  try {
    return file
      .prepare(
        `SELECT "name" FROM sqlite_master WHERE "name" LIKE '%\\_\\_search%' ESCAPE '\\' OR "name" LIKE '%\\_\\_starts%' ESCAPE '\\'`,
      )
      .all()
      .map((row) => String(row.name))
  } finally {
    file.close()
  }
}

test('[20-2] with a Searcher connected the store keeps no index of its own and no trigger for it, and a count, a group and a page with search go to the searcher', (t) => {
  const folder = workFolder(t)
  const plain = opened(folder)
  const layout: TableLayout[] = [...layoutOf(library), historyTable]
  made(plain, layout)
  // The store keeps its own index while no searcher is connected.
  assert.ok(indexIn(folder).length > 0)
  const ada = String(plain.write((tx) => tx.add('people', { name: 'Ada' }, system)).value.id)
  const bob = String(plain.write((tx) => tx.add('people', { name: 'Bob' }, system)).value.id)
  plain.write((tx) => tx.add('notes', { body: 'apple pie', writer: ada }, system))

  // A searcher of the builder's own, which finds a text by its last letter: no index of words would.
  const texts = new Map<string, string>()
  const asked: number[] = []
  const searcher: Searcher = {
    has: () => texts.size > 0,
    wrote(_table, id, held) {
      if (held?.body === undefined) texts.delete(id)
      else texts.set(id, held.body)
    },
    find(_table, words, limit) {
      asked.push(limit)
      return [...texts]
        .filter(([, body]) => body.endsWith(words))
        .map(([id]) => id)
        .slice(0, limit)
    },
  }
  const store = connected(plain, layout, { searcher })
  assert.deepEqual(indexIn(folder), [], 'the index that the file held was taken away')
  const write = (who: string, body: string, kind?: string) =>
    store.write((tx) => tx.add('notes', { body, writer: who, ...(kind ? { kind } : {}) }, system))
  for (let n = 0; n < 150; n++) write(n % 3 ? ada : bob, `note ${n} of the batch`, n % 2 ? 'odd' : 'even')
  write(ada, 'a late pie')
  // A table that is made while the searcher is connected has none either.
  store.write(
    () =>
      store.applyTableChanges([
        { do: 'addTable', table: 'memos', layout: { ...layout[1], name: 'memos' } },
        { do: 'addSearch', table: 'notes', columns: ['body', 'kind'] },
      ]),
    { steps: true },
  )
  assert.deepEqual(indexIn(folder), [])

  // Ada wrote 100 of the 150 notes, and both pies. What the searcher finds is read under her rule.
  const db = reading(store, library, user(ada), { searcher })
  const notes = () => at(db, 'notes')
  assert.equal(notes().search('pie').count(), 2)
  assert.equal(notes().search('batch').count(), 100)
  assert.equal(notes().search('apple').count(), 0, 'the searcher finds by the last letters alone')
  assert.deepEqual(notes().search('batch').group('kind', { n: count() }).all(), [
    { kind: 'even', n: 50 },
    { kind: 'odd', n: 50 },
  ])
  // A page: the pages together hold each of her notes once, in the order of the page.
  const seen: string[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = pageOf(notes().search('batch').sort('body').limit(30).after(cursor).all())
    seen.push(...page.rows.map((row) => String(row.body)))
    cursor = page.next
    pages++
  } while (cursor !== undefined && pages < 10)
  assert.equal(pages, 4)
  assert.equal(seen.length, 100)
  assert.deepEqual(seen, [...new Set(seen)].sort())
  // It was asked for more while too few of what it named passed the rule.
  assert.ok(asked.some((limit) => limit > 64))
  assert.equal(notes().search('batch').limit(3).all().length, 3)

  // Opened again with no searcher, the store builds its own index when it is first searched, and finds by words.
  store.close()
  const again = opened(folder)
  assert.deepEqual(indexIn(folder), [])
  const words = at(reading(again, library, user(ada)), 'notes')
  assert.equal(words.search('apple').count(), 1)
  assert.equal(words.search('pie').count(), 2)
  assert.ok(indexIn(folder).length > 0)
  again.write((tx) => tx.add('notes', { body: 'apple strudel', writer: ada }, system))
  assert.equal(words.search('apple').count(), 2)
  assert.equal(words.search('batch odd').count(), 50, 'the columns that were added while the searcher was connected')
})

test('[16-2@3] T1014: a limit and a skip that are under zero or no whole number, from data', (t) => {
  const description = described()
  const store: Store = shopStore(t)
  const s = seedShop(store, description)
  const db = reading(store, description, system, { limits: { rows: 3 } })
  const orders = () => at(db, 'orders')
  // The word of a chain refuses such a number where it is written. What only `data` can see is a stored plan
  // whose `limit` or `skip` is a reference: it is worked out when the plan is carried out.
  const handed = (inputs: Record<string, unknown>) => (ref: object) =>
    'input' in ref ? inputs[String(ref.input)] : undefined
  const n = { input: 'n' }
  for (const [name, wrong] of [
    ['limit', -1],
    ['limit', 1.5],
    ['limit', Number.NaN],
    ['limit', Number.POSITIVE_INFINITY],
    ['limit', '2'],
    ['skip', -1],
    ['skip', 0.5],
    ['skip', -2.5],
    ['skip', '1'],
  ] as const) {
    const what = `${name} ${String(wrong)}`
    const plans = [
      { from: 'orders', [name]: n },
      { from: 'orders', count: true as const, [name]: n },
      { from: 'orders', sort: [{ by: 'net' }], after: undefined, limit: 2, [name]: n },
      { from: 'customers', where: { col: 'id', in: { from: 'orders', pick: ['customer'], [name]: n } } },
    ]
    for (const plan of plans) {
      const read = () => db.read(plan, handed({ n: wrong }))
      assert.equal(codeOf(read), 'T1014', what)
      assert.throws(read, new RegExp(`The \`${name}\` of a plan of \`orders\` is no whole number of 0 or more`), what)
    }
    // The same plans are read where the reference works out to a whole number of zero or more.
    assert.equal(Object(db.read(plans[0], handed({ n: 1 }))).length, name === 'limit' ? 1 : 3, what)
  }
  assert.equal(
    codeOf(() => db.read({ from: 'orders', limit: -1 })),
    'T1014',
  )
  assert.equal(
    codeOf(() => db.read({ from: 'orders', skip: 1.5 })),
    'T1014',
  )
  // A limit under zero read every row before, under a bound of rows too: it reads none now.
  assert.deepEqual(orders().limit(0).all(), [])
  assert.equal(orders().limit(2).skip(1).all().length, 2)
  assert.equal(orders().skip(0).limit(3).all()[0].id, s.first)
})

test('[20-3] [16-2@3] T1014: a pick names columns of the table itself, so a name in it that is no column of the table, a path through a link among them, is refused while running and named', (t) => {
  const description = described()
  const store: Store = shopStore(t)
  const s = seedShop(store, description)
  const full = createDb(store, description, user(s.ada, ['staff']), 'read', {}, { seal, system: true })
  for (const db of [
    reading(store, description, system, { seal }),
    Reflect.get(full, 'system'),
    reading(store, description, user(s.ada, ['staff']), { seal }),
    reading(store, description, user(s.bob), { seal }),
  ]) {
    const lines = () => at(db, 'lines')
    for (const wrong of [
      () => lines().pick(['order.note']).all(),
      () => lines().pick(['qty', 'order.net']).first(),
      () => lines().pick(['order.placedBy.name']).all(),
      () => lines().sort('qty').limit(1).after(undefined).pick(['order.note']).all(),
      () => lines().where({ qty: 99 }).pick(['order.note']).all(),
      () =>
        at(db, 'orders')
          .where({ note: { in: lines().pick(['order.note']) } })
          .all(),
      () => Reflect.get(db, 'read')({ from: 'lines', pick: ['order.note'] }),
    ]) {
      assert.equal(codeOf(wrong), 'T1014')
      assert.throws(wrong, /`order\.(note|net|placedBy\.name)`/)
    }
    for (const wrong of [() => lines().pick(['nope']).all(), () => lines().pick(['qty', '_n']).all()]) {
      assert.equal(codeOf(wrong), 'T1014')
      assert.throws(wrong, /`(nope|_n)`/)
    }
    // A column of the table itself is picked as ever: a link as the id it holds, and what every row has.
    assert.deepEqual(lines().pick(['qty', 'order']).all(), [{ qty: 3, order: s.first }])
    assert.deepEqual(Object.keys(lines().pick(['createdAt', 'id']).all()[0]).sort(), ['createdAt', 'id'])
  }
})

test('[20-3] a group with no key answers one record for the rows it reads, as a group with a key does, and a value of it through a link reads the linked table under the rule of the caller', (t) => {
  const description = described()
  const store: Store = shopStore(t)
  const s = seedShop(store, description)
  const [ada, bob] = [user(s.ada, ['staff']), user(s.bob)].map((who) => reading(store, description, who, { seal }))
  const full = Reflect.get(createDb(store, description, user(s.bob), 'read', {}, { seal, system: true }), 'system')

  assert.deepEqual(
    at(full, 'orders')
      .group([], { n: count(), all: sum('net') })
      .all(),
    [{ n: 4, all: 100 }],
  )
  // Each caller counts the orders that they placed.
  assert.deepEqual(
    at(ada, 'orders')
      .group([], { n: count(), all: sum('net') })
      .all(),
    [{ n: 3, all: 60 }],
  )
  assert.deepEqual(
    at(bob, 'orders')
      .group([], { n: count(), all: sum('net') })
      .all(),
    [{ n: 1, all: 40 }],
  )
  // No row, no record: as a group with a key answers it.
  assert.deepEqual(at(ada, 'orders').where({ net: 99 }).group([], { n: count() }).all(), [])
  assert.deepEqual(at(ada, 'orders').where({ net: 99 }).group('status', { n: count() }).all(), [])

  // The one line is of an order that Ada placed. Bob reads the line, and nothing of its order.
  const through = { n: count(), net: sum('order.net'), most: max('order.net') }
  assert.deepEqual(at(full, 'lines').group([], through).all(), [{ n: 1, net: 10, most: 10 }])
  assert.deepEqual(at(ada, 'lines').group([], through).all(), [{ n: 1, net: 10, most: 10 }])
  assert.deepEqual(at(bob, 'lines').group([], through).all(), [{ n: 1 }])
  assert.deepEqual(at(bob, 'lines').group('qty', through).all(), [{ qty: 3, n: 1 }])
  // A value that is worked out of a private column is left out for a caller who is limited, with no key as with one.
  assert.deepEqual(
    at(ada, 'orders')
      .group([], { n: count(), top: max('placedBy.salary') })
      .all(),
    [{ n: 3 }],
  )
  assert.deepEqual(
    at(full, 'orders')
      .group([], { n: count(), top: max('placedBy.salary') })
      .all(),
    [{ n: 4, top: 5000 }],
  )
})

test('[16-2@3] T0009: a failure of SQLite itself while the store reads a plan reaches the caller as an error of ours, with that failure as its cause', (t) => {
  const store: Store = shopStore(t)
  // The store is handed a plan as it is: one that names what the table does not have is turned into a text that SQLite refuses.
  const wrong = [
    { from: 'lines', pick: ['nope'] },
    { from: 'lines', pick: ['order.note'] },
  ]
  const thrown = (read: () => unknown): unknown => {
    try {
      read()
    } catch (error) {
      return error
    }
    return undefined
  }
  for (const plan of wrong) {
    const outside = thrown(() => store.read(plan, system))
    assert.ok(outside instanceof TentError, JSON.stringify(plan))
    assert.equal(outside.code, 'T0009')
    assert.match(String(Object(outside.cause).message), /no such column/)
    const begun = store.begin?.()
    assert.ok(begun)
    const inside = thrown(() => begun.tx.read(plan, system))
    begun.undo()
    assert.ok(inside instanceof TentError && inside.code === 'T0009', JSON.stringify(plan))
    assert.equal(
      codeOf(() => store.write((tx) => tx.read(plan, system))),
      'T0009',
    )
  }
  // The store reads on after each.
  assert.deepEqual(store.read({ from: 'lines', count: true }, system).value, 0)
})

test('[20-3] [16-2@3] T1014: the sum, the average, the smallest and the largest of a link column are refused while running and name the column, since a link is no measure and no record of a group holds a number of the inside', (t) => {
  const description = described()
  const store: Store = shopStore(t)
  const s = seedShop(store, description)
  const full = Reflect.get(createDb(store, description, user(s.bob), 'read', {}, { seal, system: true }), 'system')
  for (const db of [full, reading(store, description, user(s.ada, ['staff']), { seal })]) {
    for (const counted of [sum, avg, min, max]) {
      for (const wrong of [
        () =>
          at(db, 'orders')
            .group([], { m: counted('customer') })
            .all(),
        () =>
          at(db, 'orders')
            .group('status', { n: count(), m: counted('placedBy') })
            .all(),
        () =>
          at(db, 'lines')
            .group('qty', { m: counted('order') })
            .all(),
        () =>
          at(db, 'lines')
            .group([], { m: counted('order.customer') })
            .all(),
        () =>
          at(db, 'lines')
            .group([], { m: counted('order.customer.team') })
            .count(),
      ]) {
        assert.equal(codeOf(wrong), 'T1014')
        assert.throws(wrong, /`(customer|placedBy|order|order\.customer|order\.customer\.team)`/)
      }
    }
    // A measure of a column that is none is worked out as ever, through a link too.
    assert.equal(
      at(db, 'lines')
        .group([], { m: max('order.net') })
        .all()[0].m,
      10,
    )
  }
  // A group by a link answers the text id of the linked row, and a count: no number of the inside of the store.
  const byLink = at(full, 'orders').group('customer', { n: count() }).all()
  assert.deepEqual(
    byLink.map((record) => [record.customer, record.n]).sort(),
    [
      [s.acme, 2],
      [s.bolt, 2],
    ].sort(),
  )
  for (const record of at(full, 'lines').group(['order', 'product'], { n: count() }).all())
    assert.deepEqual(record, { order: s.first, product: s.nut, n: 1 })
})

test('[20-2] [16-2@3] a whole number past what the runtime holds exactly, which SQLite answers, is answered as the nearest number, and nothing is thrown: a very large sum of a plan, a row, and a raw text', (t) => {
  const description = described()
  const store: Store = shopStore(t)
  const s = seedShop(store, description)
  const most = Number.MAX_SAFE_INTEGER
  writing(
    store,
    description,
    system,
  )((db) => {
    for (const must of ['a', 'b', 'c']) at(db, 'things').add({ must, whole: most })
  })
  const whole = createDb(store, description, user(s.ada), 'read', {}, { seal, system: true })
  const things = () => at(whole, 'things')
  const sql = sqlOf(whole)
  const nearest = Number(BigInt(most) * 3n)
  // A sum that passes it, with no key and with one, and the largest beside it.
  assert.deepEqual(
    things()
      .group([], { all: sum('whole'), top: max('whole'), n: count() })
      .all(),
    [{ all: nearest, top: most, n: 3 }],
  )
  assert.deepEqual(
    things()
      .group('must', { all: sum('whole') })
      .all().length,
    3,
  )
  // A raw text: a number that SQLite makes, a sum, and a number that is written out.
  assert.deepEqual(sql('SELECT sum("whole") AS "s", count(*) AS "n" FROM "things"'), [{ s: nearest, n: 3 }])
  assert.deepEqual(sql('SELECT 9007199254740993 AS "n", 7 AS "small", \'text\' AS "t"'), [
    { n: Number(9007199254740993n), small: 7, t: 'text' },
  ])
  for (let at = 0; at < 20; at++) assert.equal(typeof Object(sql('SELECT random() AS "r"')[0]).r, 'number')
  // A row that holds such a number is read by a plan and by a write.
  store.write((tx) => {
    tx.sql('UPDATE "things" SET "whole" = 9007199254740993 WHERE "must" = ?', ['a'])
    assert.equal(Object(tx.sqlRead('SELECT "whole" FROM "things" WHERE "must" = ?', ['a'])[0]).whole, 2 ** 53)
    assert.deepEqual(tx.sql('UPDATE "things" SET "count" = 1 WHERE "must" = ? RETURNING "whole"', ['a']), [
      { whole: 2 ** 53 },
    ])
  })
  assert.equal(things().where({ must: 'a' }).first()?.whole, 2 ** 53)
  assert.equal(
    things()
      .where({ whole: { above: most } })
      .count(),
    1,
  )
  assert.equal(things().sort('whole').all().length, 3)
  // A number that the runtime holds is answered as it is, and as a number.
  assert.deepEqual(sql('SELECT count(*) AS "n" FROM "things"'), [{ n: 3 }])
  assert.deepEqual(things().where({ must: 'b' }).pick(['whole']).all(), [{ whole: most }])
})
