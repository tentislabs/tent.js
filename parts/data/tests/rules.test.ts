import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller, User } from '../../core/index.ts'
import { link, table, text, where } from '../../core/index.ts'
import type { Noted, Row, RuleCode, Store, Wrote } from '../index.ts'
import { createDb } from '../index.ts'
import { at, definitions, described, reading, seal, seedShop, shopStore, sqlOf, user, writing } from './shop.ts'
import { codeOf, system } from './work.ts'

const description = described()
const nobody: Caller = { kind: 'nobody' }
const ids = (rows: Row[]): string[] => rows.map((row) => String(row.id))

/** Answers a store that hands every read on, and keeps the tables each read reported. */
function watched(store: Store): { store: Store; reads: string[][] } {
  const reads: string[][] = []
  const read: Store['read'] = (plan, caller) => {
    const answer = store.read(plan, caller)
    reads.push(answer.tables)
    return answer
  }
  return { store: { ...store, read }, reads }
}

test('[20-3] a row the caller may not read is absent, under each rule', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const [ada, bob, cy] = [user(s.ada, ['staff']), user(s.bob), user(s.cy, ['admin'])]
  const read = (who: Caller) => reading(store, description, who, { seal })

  // `signedIn`: nobody reads no row, and no error is raised for it.
  assert.deepEqual(at(read(nobody), 'users').all(), [])
  assert.equal(at(read(nobody), 'users').count(), 0)
  assert.equal(at(read(nobody), 'users').get(s.ada), undefined)
  assert.equal(at(read(bob), 'users').count(), 3)
  // `anyone`.
  assert.equal(at(read(nobody), 'products').count(), 1)
  // `nobody`, which is what a table has for what it does not state.
  const closed = described([...definitions, table('vault', { columns: { secret: text() } })])
  const vault = shopStore(t, closed)
  writing(vault, closed, system)((db) => at(db, 'vault').add({ secret: 'x' }))
  assert.deepEqual(at(reading(vault, closed, user(s.cy, ['admin'])), 'vault').all(), [])
  assert.equal(at(reading(vault, closed, system), 'vault').count(), 1)

  // `owner`: each sees the orders they placed, by every way of reading.
  assert.deepEqual(ids(at(read(ada), 'orders').all()), [s.first, s.second, s.far])
  assert.deepEqual(ids(at(read(bob), 'orders').all()), [s.bobs])
  assert.equal(at(read(bob), 'orders').get(s.first), undefined)
  assert.equal(at(read(ada), 'orders').get(s.first)?.net, 10)
  assert.equal(
    at(read(bob), 'orders')
      .where({ net: { above: 0 } })
      .count(),
    1,
  )
  assert.equal(at(read(bob), 'orders').newest('net').first()?.id, s.bobs)
  assert.deepEqual(at(read(cy), 'orders').all(), [])

  // `where`, through a second table: the customers of the teams the caller is a member of.
  assert.deepEqual(ids(at(read(ada), 'customers').all()), [s.acme])
  assert.deepEqual(ids(at(read(bob), 'customers').all()), [s.bolt])
  assert.deepEqual(at(read(cy), 'customers').all(), [])
  assert.deepEqual(at(read(nobody), 'customers').all(), [])
  assert.equal(at(read(ada), 'customers').get(s.bolt), undefined)

  // A linked row that the caller may not read holds its id alone, and one they may read holds no private column.
  const withCustomer = at(read(ada), 'orders').with('customer').all()
  assert.deepEqual(
    withCustomer.map((order) => order.customer),
    [at(read(ada), 'customers').get(s.acme), at(read(ada), 'customers').get(s.acme), { id: s.bolt }],
  )
  assert.equal(Reflect.get(Object(withCustomer[0].customer), 'name'), 'Acme')
  assert.equal(Reflect.get(Object(withCustomer[0].customer), 'taxNo'), 'TR-1')
  assert.ok(!('margin' in Object(withCustomer[0].customer)))
  assert.deepEqual(at(read(bob), 'lines').with('order').all()[0].order, { id: s.first })

  // A private column is handed to no code but code with full access, and is no part of a filter or a sort.
  assert.ok(
    at(read(ada), 'users')
      .all()
      .every((row) => !('salary' in row)),
  )
  const full = createDb(store, description, ada, 'read', {}, { seal, system: true })
  assert.deepEqual(
    at(Reflect.get(full, 'system'), 'users')
      .sort('-salary')
      .all()
      .map((row) => row.salary),
    [5000, 4000, undefined],
  )
  assert.ok(
    at(full, 'users')
      .all()
      .every((row) => !('salary' in row)),
    'the limited half of a db with full access',
  )
  for (const wrong of [
    () =>
      at(read(ada), 'users')
        .where({ salary: { above: 1 } })
        .all(),
    () => at(read(ada), 'users').sort('salary').all(),
    () => at(read(ada), 'users').count({ not: { salary: 5000 } }),
  ])
    assert.equal(codeOf(wrong), 'T0013')
  // A db that was made without `system` has none of what needs full access.
  for (const name of ['system', 'sql', 'n']) assert.ok(!(name in read(ada)), name)
  // For a caller that is the system, `db` itself is not limited.
  assert.equal(at(read(system), 'users').get(s.ada)?.salary, 5000)
})

test('[20-3] a row the caller may not change gives the named error', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const [ada, bob, cy] = [user(s.ada, ['staff']), user(s.bob), user(s.cy, ['admin'])]
  const noted: Noted[] = []
  const as = (who: Caller) =>
    writing(store, description, who, { seal, noted: (one) => noted.push(one), guarded: { users: ['roles'] } })
  const refused = (call: () => unknown, code: string, words?: RegExp) => {
    assert.equal(codeOf(call), code)
    if (words) assert.throws(call, words)
  }

  // A role: the error names the table, what was tried and the role.
  refused(
    () => as(bob)((db) => at(db, 'customers').add({ name: 'Cog', team: s.south })),
    'T3101',
    /customers\.add needs role 'staff'; the caller is signed in and has no such role/,
  )
  assert.deepEqual(noted.at(-1), { kind: 'refused', table: 'customers', what: 'add', rule: 'role' })
  assert.equal(as(ada)((db) => at(db, 'customers').add({ name: 'Cog', team: s.north })).name, 'Cog')
  refused(
    () => as(nobody)((db) => at(db, 'orders').add({ customer: s.acme, placedBy: s.ada, net: 1 })),
    'T3101',
    /orders\.add/,
  )

  // A row the caller may read and may not touch is T3101. One they may not read is not found for them.
  refused(
    () => as(bob)((db) => at(db, 'orders').change(s.bobs, { net: 41 })),
    'T3101',
    /orders\.change needs role 'staff'/,
  )
  refused(() => as(bob)((db) => at(db, 'orders').remove(s.bobs)), 'T3101', /orders\.remove/)
  refused(() => as(bob)((db) => at(db, 'customers').change(s.bolt, { name: 'x' })), 'T3101')
  refused(() => as(cy)((db) => at(db, 'orders').change(s.first, { net: 11 })), 'T2103')
  refused(() => as(bob)((db) => at(db, 'customers').change(s.acme, { name: 'x' })), 'T2103')
  refused(() => as(ada)((db) => at(db, 'orders').change('00000000000000000000000000', { net: 11 })), 'T2103')
  refused(() => as(cy)((db) => at(db, 'orders').remove(s.bobs)), 'T2103')
  assert.equal(as(ada)((db) => at(db, 'orders').change(s.first, { net: 11 })).net, 11)

  // `owner` on `users` is the caller's own row, and `nobody` is what a table has for what it does not state.
  assert.equal(as(bob)((db) => at(db, 'users').change(s.bob, { name: 'Robert' })).name, 'Robert')
  refused(() => as(bob)((db) => at(db, 'users').change(s.ada, { name: 'x' })), 'T3101', /users\.change/)
  refused(
    () => as(cy)((db) => at(db, 'members').change(String(at(db, 'members').first()?.id), { team: s.north })),
    'T3101',
    /nobody/,
  )
  // The owner of a new row is the caller where the row names none, and may be no one else.
  const placed = as(bob)((db) => at(db, 'orders').add({ customer: s.bolt, net: 5 }))
  assert.equal(placed.placedBy, s.bob)
  // A column that is guarded is written by no `db` without full access: a change whatever it gives, an add that gives one.
  refused(() => as(bob)((db) => at(db, 'users').change(s.bob, { roles: ['admin'] })), 'T3101', /roles/)
  refused(() => as(bob)((db) => at(db, 'users').change(s.bob, { roles: [] })), 'T3101')
  refused(() => as(cy)((db) => at(db, 'users').add({ name: 'Di', email: 'di@example.com', roles: ['admin'] })), 'T3101')
  // On `users` a row that is added without roles has none.
  assert.deepEqual(as(cy)((db) => at(db, 'users').add({ name: 'Di', email: 'di@example.com' })).roles, [])
  assert.deepEqual(
    writing(store, description, system, { guarded: { users: ['roles'] } })((db) =>
      at(db, 'users').change(s.bob, { roles: ['staff'] }),
    ).roles,
    ['staff'],
  )
  // Every refusal left the rows as they were.
  assert.equal(at(reading(store, description, system, { seal }), 'orders').get(s.bobs)?.net, 40)
})

/** The arrow of a `where` rule, as a module of the app gives it: the rows of the teams that the user is a member of. */
const myTeams = (who: User | undefined, db: object) => ({
  team: {
    in: at(db, 'members')
      .where({ user: who?.id ?? '' })
      .pick(['team']),
  },
})

test('[20-3] a where rule through a second table is one database question, written as a value and as code', (t) => {
  // The same rule as code: its arrow is handed the user and a `db` that gives plans only.
  const notes = table('notes', {
    columns: { team: link('teams'), body: text() },
    access: { read: where(myTeams) },
  })
  const withNotes = described([...definitions, notes])
  const store = shopStore(t, withNotes)
  const s = seedShop(store, withNotes)
  writing(
    store,
    withNotes,
    system,
  )((db) => {
    at(db, 'notes').add({ team: s.north, body: 'for the north' })
    at(db, 'notes').add({ team: s.south, body: 'for the south' })
  })
  const rules = { notes_access_read: myTeams }

  for (const [tableName, found] of [
    ['customers', 'Acme'],
    ['notes', 'for the north'],
  ]) {
    const seen = watched(store)
    const rows = at(reading(seen.store, withNotes, user(s.ada, ['staff']), { seal }, rules), tableName).all()
    assert.deepEqual(
      rows.map((row) => row.name ?? row.body),
      [found],
    )
    assert.equal(seen.reads.length, 1, `${tableName}: one question`)
    assert.deepEqual([...seen.reads[0]].sort(), ['members', tableName].sort())
  }
  // A rule that is code and was not handed in lets nobody in.
  assert.equal(
    codeOf(() => at(reading(store, withNotes, user(s.ada)), 'notes').all()),
    'T0009',
  )
})

test('[16-2@3] T0013: the db of a where rule that is code gives plans alone, so an arrow that calls db.sql, db.n or db.system is refused, for a read and for a write', (t) => {
  const notes = table('notes', {
    columns: { team: link('teams'), body: text() },
    access: { read: where(myTeams), add: where(myTeams) },
  })
  const withNotes = described([...definitions, notes])
  const store = shopStore(t, withNotes)
  const s = seedShop(store, withNotes)
  writing(store, withNotes, system)((db) => at(db, 'notes').add({ team: s.north, body: 'for the north' }))
  const ada = user(s.ada, ['staff'])
  const reads = (rule: RuleCode) => () =>
    at(reading(store, withNotes, ada, { seal }, { notes_access_read: rule }), 'notes').all()
  const adds = (rule: RuleCode) => () =>
    writing(
      store,
      withNotes,
      ada,
      { seal },
      { notes_access_read: myTeams, notes_access_add: rule },
    )((db) => at(db, 'notes').add({ team: s.north, body: 'one more' }))
  const wrong: [string, RuleCode][] = [
    ['sql', (_who, db) => ({ team: { in: Reflect.get(db, 'sql')('SELECT "id" FROM "teams"', []) } })],
    ['n', (_who, db) => ({ team: Reflect.get(db, 'n')('teams', s.north) })],
    ['system', (_who, db) => ({ team: { in: at(Reflect.get(db, 'system'), 'members').pick(['team']) } })],
  ]
  for (const [name, rule] of wrong) {
    assert.equal(codeOf(reads(rule)), 'T0013', name)
    assert.equal(codeOf(adds(rule)), 'T0013', name)
    assert.throws(reads(rule), new RegExp(`db\\.${name}`))
  }
  // The plans that it gives are read as ever, and nothing was added.
  assert.deepEqual(
    reads(myTeams)().map((row) => row.body),
    ['for the north'],
  )
  assert.equal(adds(myTeams)().body, 'one more')
  assert.equal(at(reading(store, withNotes, system, { seal }), 'notes').count(), 2)
})

test('[20-10] read reports exactly the tables a plan read, and write every touched id, with wrote called once for each row inside the write', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const ada = user(s.ada, ['staff'])

  // A plan with a link, a filter through a link and a rule through a second table.
  const seen = watched(store)
  const rows = at(reading(seen.store, description, ada, { seal }), 'customers')
    .where({ 'team.name': 'North' })
    .with('team')
    .all()
  assert.deepEqual(
    rows.map((row) => Reflect.get(Object(row.team), 'name')),
    ['North'],
  )
  assert.deepEqual([...new Set(seen.reads.flat())].sort(), ['customers', 'members', 'teams'])
  // A filter through a link with no `with` beside it: the linked table is read by the filter alone, in one question,
  // and is reported. Ada reads every team, so no rule of `teams` stands in the question to report it.
  const through = watched(store)
  const found = at(reading(through.store, description, ada, { seal }), 'customers')
    .where({ 'team.name': 'North' })
    .all()
  assert.deepEqual(ids(found), [s.acme])
  assert.deepEqual(
    through.reads.map((tables) => [...tables].sort()),
    [['customers', 'members', 'teams']],
  )
  // The same for a caller whom no rule limits, and for a sort through a link.
  const plain = watched(store)
  const counted = at(reading(plain.store, description, system, { seal }), 'customers')
    .where({ 'team.name': 'South' })
    .count()
  assert.equal(counted, 1)
  at(reading(plain.store, description, system, { seal }), 'customers')
    .sort('team.name')
    .all()
  assert.deepEqual(
    plain.reads.map((tables) => [...tables].sort()),
    [
      ['customers', 'teams'],
      ['customers', 'teams'],
    ],
  )
  // A plan of one table reads that table alone.
  const one = watched(store)
  at(reading(one.store, description, ada, { seal }), 'products')
    .where({ price: { below: 1 } })
    .all()
  assert.deepEqual(one.reads, [['products']])

  const wrote: (Wrote & { inside: boolean })[] = []
  let inside = false
  const answer = store.write((tx) => {
    inside = true
    const db = createDb(
      tx,
      description,
      system,
      'write',
      {},
      { seal, system: true, touches: ['products'], wrote: (w) => wrote.push({ ...w, inside }) },
    )
    const added = at(db, 'orders').add({ customer: s.acme, placedBy: s.ada, net: 1 })
    at(db, 'orders').change(s.second, { net: 21, status: 'sent' })
    // Removing an order removes its lines, and removing a product clears the lines that name it.
    at(db, 'lines').add({ order: s.far, product: s.nut, qty: 2 })
    at(db, 'orders').remove(s.first)
    at(db, 'products').remove(s.nut)
    sqlOf(db)('UPDATE "teams" SET "name" = upper("name")', [])
    return String(added.id)
  })
  inside = false
  const touched = Object.fromEntries(answer.touched.map((one) => [one.table, one.ids]))
  assert.deepEqual([...touched.orders].sort(), [answer.value, s.second, s.first].sort())
  assert.equal(
    touched.lines.length,
    2,
    'the line that was removed with its order, and the one that was added and then cleared',
  )
  assert.ok(touched.lines.includes(s.line))
  assert.deepEqual(touched.products, [s.nut])
  // A table that the definition stated for its raw writes is touched with no ids, where no row of it is known.
  assert.ok(!('teams' in touched))
  const stated = store.write((tx) => {
    const db = createDb(tx, description, system, 'write', {}, { system: true, touches: ['teams'] })
    sqlOf(db)('UPDATE "teams" SET "name" = lower("name")', [])
  })
  assert.deepEqual(stated.touched, [{ table: 'teams', ids: [] }])
  // The earlier versions that were kept are rows of a table like any other.
  assert.equal(touched._t_history.length, 2)

  assert.ok(wrote.every((one) => one.inside))
  assert.deepEqual(
    wrote.map((one) => `${one.kind} ${one.table} ${one.row.id}`),
    [
      `added orders ${answer.value}`,
      `changed orders ${s.second}`,
      `added lines ${wrote[2].row.id}`,
      `removed lines ${s.line}`,
      `removed orders ${s.first}`,
      `changed lines ${wrote[2].row.id}`,
      `removed products ${s.nut}`,
    ],
  )
  const changed = wrote[1]
  assert.equal(changed.before?.net, 20)
  assert.equal(changed.row.net, 21)
  assert.deepEqual([...(changed.columns ?? [])].sort(), ['gross', 'label', 'net', 'status'])
  assert.equal(wrote[3].before, undefined)
  assert.equal(wrote[3].row.qty, 3)
  assert.deepEqual(wrote[5].columns, ['product'])
})

test('[16-2@3] T2102, T0008, T2108 and T0012: a link in use, a db past its time, one row too many, and a write through a db that only reads', async (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)

  // `refuse`, which holds where a link says nothing: a customer with orders is not removed, and nothing is.
  const as = writing(store, description, system, { seal })
  assert.equal(
    codeOf(() => as((db) => at(db, 'customers').remove(s.acme))),
    'T2102',
  )
  assert.throws(() => as((db) => at(db, 'customers').remove(s.acme)), /orders/)
  assert.equal(at(reading(store, description, system, { seal }), 'orders').count(), 4)

  // Past its time, the next call of a `db` fails, a read and a write alike.
  let clock = 1_800_000_000_000
  const timed = reading(store, description, system, { seal, limits: { time: 1000 }, now: () => clock })
  assert.equal(at(timed, 'teams').count(), 2)
  clock += 1000
  assert.equal(at(timed, 'teams').count(), 2, 'at its limit')
  clock += 1
  assert.equal(
    codeOf(() => at(timed, 'teams').count()),
    'T0008',
  )
  assert.equal(
    codeOf(() => at(timed, 'teams').get(s.north)),
    'T0008',
  )
  assert.equal(
    codeOf(() =>
      store.write((tx) => {
        const db = createDb(tx, description, system, 'write', {}, { limits: { time: 5 }, now: () => clock })
        at(db, 'teams').add({ name: 'East' })
        clock += 6
        at(db, 'teams').add({ name: 'West' })
      }),
    ),
    'T0008',
  )
  assert.equal(at(reading(store, description, system), 'teams').count(), 2, 'the change was undone')
  // A read that passed the time is told, with the table, the time it took and its rows.
  const noted: Noted[] = []
  const slow = reading(store, description, system, {
    limits: { time: 10 },
    noted: (one) => noted.push(one),
    now: () => (clock += 7),
  })
  at(slow, 'teams').all()
  assert.deepEqual(noted, [{ kind: 'slow', table: 'teams', ms: 7, rows: 2 }])

  // One row more than the bound of a read fails it. A count is no row.
  const bound = reading(store, description, system, { seal, limits: { rows: 3 } })
  assert.equal(at(bound, 'users').all().length, 3)
  assert.equal(at(bound, 'orders').limit(3).all().length, 3)
  assert.equal(at(bound, 'orders').count(), 4)
  assert.equal(
    codeOf(() => at(bound, 'orders').all()),
    'T2108',
  )
  assert.equal(
    codeOf(() => at(bound, 'orders').limit(4).all()),
    'T2108',
  )

  // A `db` that only reads writes nothing: in a query, and in an action, whose reads are promises.
  const query = reading(store, description, system)
  for (const write of [
    () => at(query, 'teams').add({ name: 'East' }),
    () => at(query, 'teams').change(s.north, { name: 'x' }),
    () => at(query, 'teams').remove(s.north),
  ])
    assert.equal(codeOf(write), 'T0012')
  const action = createDb(store, description, system, 'async', {}, { system: true })
  const all: unknown = at(action, 'teams').all()
  assert.ok(all instanceof Promise)
  assert.equal((await all).length, 2)
  assert.equal(await at(action, 'teams').count(), 2)
  assert.equal(Reflect.get(Object(await at(action, 'teams').get(s.north)), 'name'), 'North')
  assert.equal(
    codeOf(() => at(action, 'teams').add({ name: 'East' })),
    'T0012',
  )
  await assert.rejects(async () => at(action, 'teams').where({ nope: 1 }).all())
  assert.deepEqual(await sqlOf(action)('SELECT count(*) AS "n" FROM "teams"', []), [{ n: 2 }])
})
