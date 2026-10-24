import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count, number, project, sum, table, text } from '../../core/index.ts'
import type { Row } from '../index.ts'
import { createDb, handedAnswer } from '../index.ts'
import { at, described, nOf, reading, seal, seedShop, shopStore, sqlOf, user, writing } from './shop.ts'
import { codeOf, system } from './work.ts'

const description = described()

test('[20-14] [night] handedAnswer passes what db handed out, without the private columns, and refuses everything else', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  writing(store, description, system, { seal })((db) => at(db, 'customers').change(s.acme, { margin: 0.4 }))
  const db = createDb(store, description, user(s.ada, ['staff']), 'read', {}, { seal, system: true })
  const full = Reflect.get(db, 'system')

  assert.equal(handedAnswer(undefined), undefined)
  assert.equal(handedAnswer(7), 7)
  // Rows that were read with full access hold their private columns. What leaves holds none.
  const users: Row[] = at(full, 'users').all()
  assert.deepEqual(
    users.map((row) => row.salary),
    [5000, 4000, undefined],
  )
  const left = handedAnswer(users)
  assert.ok(Array.isArray(left) && left.length === 3)
  assert.deepEqual(
    left.map((row: Row) => Object.keys(row).sort()),
    Array(3).fill(['createdAt', 'email', 'id', 'name', 'roles', 'updatedAt']),
  )
  assert.deepEqual(handedAnswer(users[0]), left[0])
  // A list that code picked from handed rows passes, and so does what was answered once already.
  const picked = users.filter((row) => row.name !== 'Bob')
  assert.deepEqual(handedAnswer(picked), [left[0], left[2]])
  assert.deepEqual(handedAnswer(left), left)
  assert.deepEqual(handedAnswer([left[1]]), [left[1]])
  assert.deepEqual(handedAnswer([]), [])
  // A row with its linked row inside loses the private columns of both.
  const order = at(full, 'orders').where({ id: s.first }).with('placedBy').first()
  assert.equal(order?.cost, 7)
  assert.equal(Reflect.get(Object(order?.placedBy), 'salary'), 5000)
  const answered = Object(handedAnswer(order))
  assert.ok(!('cost' in answered) && !('salary' in answered.placedBy))
  assert.equal(answered.placedBy.name, 'Ada')
  assert.equal(answered.net, 10)
  // A page, with its rows.
  const page: unknown = at(full, 'users').sort('name').limit(2).after(undefined).all()
  const pageLeft = Object(handedAnswer(page))
  assert.deepEqual(pageLeft.rows, [left[0], left[1]])
  assert.equal(typeof pageLeft.next, 'string')

  // A group by a private column answers one record for each of its values, with its count and without the value.
  const bySalary = at(full, 'users').group('salary', { n: count() }).all()
  assert.equal(bySalary.length, 3)
  assert.ok(bySalary.some((one) => one.salary === 5000))
  assert.deepEqual(handedAnswer(bySalary), [{ n: 1 }, { n: 1 }, { n: 1 }])
  // A sum of one loses that field, and keeps the others.
  const totals = at(full, 'users')
    .group('name', { total: sum('salary'), n: count() })
    .all()
  assert.ok(totals.some((one) => one.total === 5000))
  assert.deepEqual(
    Object(handedAnswer(totals)).map((one: Row) => Object.keys(one).sort()),
    Array(3).fill(['n', 'name']),
  )
  // A `db` that is limited leaves the same fields out by itself.
  assert.deepEqual(at(db, 'users').group('salary', { n: count() }).all(), [{ n: 1 }, { n: 1 }, { n: 1 }])
  assert.ok(
    at(db, 'users')
      .group('name', { total: sum('salary'), n: count() })
      .all()
      .every((one) => !('total' in one)),
  )
  // A private column in the value of a history entry.
  const history = at(full, 'customers').history(s.acme)
  assert.equal(history[0].value.margin, 0.3)
  const historyLeft = Object(handedAnswer(history))
  assert.ok(!('margin' in historyLeft[0].value))
  assert.equal(historyLeft[0].value.name, 'Acme')

  // Anything else is refused: a copy of a row, a record that code built, a row inside one, a list with an empty
  // place, a text, and a row that raw SQL answered.
  const raw = sqlOf(db)('SELECT "name" FROM "users"', [])
  for (const wrong of [
    { ...users[0] },
    { users },
    { user: users[0] },
    [users[0], undefined],
    [users[0], { ...users[1] }],
    Array.from({ length: 2 }),
    [[users[0]]],
    'a text',
    true,
    raw,
    raw[0],
    new Date(),
  ])
    assert.equal(
      codeOf(() => handedAnswer(wrong)),
      'T0009',
      JSON.stringify(wrong),
    )
})

test('[20-14] [night] a handed row, a list inside it and a record of a group cannot be changed in place', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  writing(store, description, system, { seal })((db) => at(db, 'customers').change(s.acme, { vip: true }))
  const db = reading(store, description, system, { seal })
  const rows = at(db, 'users').all()
  /** Sets a member of what a read handed out. */
  const set = (target: unknown, name: string, value: unknown) => {
    Object(target)[name] = value
  }
  const changes: (() => unknown)[] = [
    () => rows.sort(),
    () => rows.push({}),
    () => set(rows[0], 'name', 'x'),
    () => set(rows[0], 'extra', 1),
    () => Object(rows[0].roles).push('admin'),
    () => set(at(db, 'orders').with('customer').first()?.customer, 'name', 'x'),
    () => set(at(db, 'users').get(s.ada), 'name', 'x'),
    () => set(at(db, 'users').first(), 'name', 'x'),
    () => set(at(db, 'users').group('name', { n: count() }).all()[0], 'n', 5),
    () => at(db, 'users').group('name', { n: count() }).all().pop(),
    () => set(at(db, 'customers').history(s.acme)[0].value, 'name', 'x'),
    () => set(at(db, 'customers').history(s.acme)[0], 'by', 'x'),
    () => at(db, 'customers').history(s.acme).pop(),
    () => Object(at(db, 'users').limit(1).after(undefined).all()).rows.pop(),
    () => set(at(db, 'users').limit(1).after(undefined).all(), 'next', 'x'),
  ]
  for (const [i, change] of changes.entries()) assert.throws(change, TypeError, `change ${i}`)
  // A copy is the way to another shape, and the handed list is as it was.
  assert.deepEqual(
    [...rows].sort((a, b) => String(b.name).localeCompare(String(a.name))).map((row) => row.name),
    ['Cy', 'Bob', 'Ada'],
  )
  assert.deepEqual(
    rows.map((row) => row.name),
    ['Ada', 'Bob', 'Cy'],
  )
  // A list and an object inside a column are frozen with their row.
  writing(
    store,
    description,
    system,
  )((write) =>
    at(write, 'things').add({ must: 'x', shape: { label: 'a', deep: { n: 1 } }, loose: { list: [1, { two: 2 }] } }),
  )
  const thing = Object(at(db, 'things').first())
  assert.throws(() => set(thing.shape.deep, 'n', 2), TypeError)
  assert.throws(() => set(thing.loose.list[1], 'two', 3), TypeError)
  assert.throws(() => thing.loose.list.push(3), TypeError)
})

const wide = table('wide', {
  columns: Object.fromEntries([
    ...Array.from({ length: 6 }, (_, i) => [`text${i}`, text()]),
    ...Array.from({ length: 6 }, (_, i) => [`number${i}`, number()]),
  ]),
})
const measured = described([project('measured', {}), wide])

test('[20-14] [night] reading 10,000 rows with freezing is within a tenth of reading them without', (t) => {
  const store = shopStore(t, measured)
  writing(
    store,
    measured,
    system,
  )((db) => {
    for (let i = 0; i < 10_000; i++)
      at(db, 'wide').add(
        Object.fromEntries(
          Array.from({ length: 12 }, (_, k) =>
            k < 6 ? [`text${k}`, `row ${i} column ${k}`] : [`number${k - 6}`, i * k],
          ),
        ),
      )
  })
  const frozen = reading(store, measured, system)
  const middle = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
  // One run reads the 10,000 rows four times, so that a pause of the runtime in one read does not decide the run.
  const time = (read: () => Row[]) => {
    const start = performance.now()
    let rows = 0
    for (let again = 0; again < 4; again++) rows += read().length
    const took = performance.now() - start
    assert.equal(rows, 40_000)
    return took
  }
  // A query freezes what it is handed, and a change does not: the same read through each, taken as the rig takes a
  // measure, five runs each way and the middle ones compared.
  const withFreezing: number[] = []
  const without: number[] = []
  store.write((tx) => {
    const plain = createDb(tx, measured, system, 'write', {})
    for (let warm = 0; warm < 3; warm++) {
      time(() => at(frozen, 'wide').all())
      time(() => at(plain, 'wide').all())
    }
    for (let run = 0; run < 5; run++) {
      // Which of the two is read first changes from run to run, so that neither always follows the other.
      if (run % 2) without.push(time(() => at(plain, 'wide').all()))
      withFreezing.push(time(() => at(frozen, 'wide').all()))
      if (run % 2 === 0) without.push(time(() => at(plain, 'wide').all()))
    }
    assert.ok(Object.isFrozen(at(frozen, 'wide').first()) && !Object.isFrozen(at(plain, 'wide').first()))
  })
  const [slow, fast] = [middle(withFreezing), middle(without)]
  const said = `with freezing ${slow.toFixed(2)} ms, without ${fast.toFixed(2)} ms: ${((slow / fast - 1) * 100).toFixed(1)} of a hundred more`
  t.diagnostic(said)
  assert.ok(slow <= fast * 1.1, said)
})

test('[20-14] [night] raw SQL through db: who has it, what ends a statement, and what is refused', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const ada = user(s.ada, ['staff'])
  // A `db` that was made without `system` has no `sql`.
  assert.ok(!('sql' in reading(store, description, ada)))
  assert.ok(!('sql' in writing(store, description, ada)((db) => db)))
  const db = createDb(store, description, ada, 'read', {}, { system: true })
  const sql = (text: string, values: unknown[] = []): unknown[] => sqlOf(db)(text, values)

  // It sees the tables as they are stored, the inside number and number links with them, and passes no rule.
  const [order] = sql('SELECT "_n", "id", "customer", "placedBy" FROM "orders" WHERE "id" = ?', [s.bobs])
  assert.equal(Object(order).id, s.bobs)
  assert.equal(typeof Object(order).customer, 'number')
  assert.equal(nOf(db)('orders', s.bobs), Object(order)._n)
  assert.equal(nOf(db)('customers', s.bolt), Object(order).customer)
  assert.equal(
    codeOf(() => nOf(db)('customers', '00000000000000000000000000')),
    'T2103',
  )

  // A semicolon inside quoted text or inside a comment ends nothing, and a comment after the closing one is taken.
  for (const text of [
    'SELECT \';\' AS "a"',
    'SELECT 1 AS "a;b"',
    'SELECT 1 /* ; */ AS "a"',
    'SELECT 1 AS "a" -- ; more',
    'SELECT 1 AS "a";  -- a comment after the end\n/* and one more */',
  ])
    assert.equal(sql(text).length, 1, text)
  // A code query that answers a raw row with no `output` is refused.
  assert.equal(
    codeOf(() => handedAnswer(sql('SELECT "id", "name" FROM "users"'))),
    'T0009',
  )
  assert.equal(
    codeOf(() => handedAnswer(sql('SELECT "id", "name" FROM "users"')[0])),
    'T0009',
  )

  for (const text of [
    'SELECT * FROM "_t_meta"',
    'SELECT * FROM "_t_history"',
    'SELECT 1; SELECT 2',
    'COMMIT',
    'PRAGMA journal_mode = DELETE',
    "ATTACH 'other.db' AS other",
    'CREATE TRIGGER "loose" AFTER INSERT ON "users" BEGIN DELETE FROM "orders"; END',
  ]) {
    assert.equal(
      codeOf(() => sql(text)),
      'T0013',
      text,
    )
    // Inside a change too.
    assert.equal(
      codeOf(() =>
        store.write((tx) => sqlOf(createDb(tx, description, system, 'write', {}, { system: true }))(text, [])),
      ),
      'T0013',
      text,
    )
  }
  // A text that writes outside a write.
  assert.equal(
    codeOf(() => sql('UPDATE "teams" SET "name" = \'x\'')),
    'T0012',
  )
  assert.equal(
    codeOf(() => sql('DELETE FROM "lines"')),
    'T0012',
  )
  assert.deepEqual(sql('SELECT count(*) AS "n" FROM "lines"'), [{ n: 1 }])
  // Inside a change it writes.
  store.write((tx) =>
    sqlOf(createDb(tx, description, system, 'write', {}, { system: true }))('UPDATE "teams" SET "name" = ?', ['x']),
  )
  assert.deepEqual(sql('SELECT DISTINCT "name" FROM "teams"'), [{ name: 'x' }])
})
