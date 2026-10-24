import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller, User } from '../../core/index.ts'
import { anyone, count, given, link, max, number, role, sum, table, text, where } from '../../core/index.ts'
import { describe } from '../../core/internal.ts'
import type { Row } from '../index.ts'
import { createDb } from '../index.ts'
import { appOf, filesOf, person, readingFiles, seedDesk, writingFiles } from './apart.ts'
import { at, definitions, described, reading, seal, seedShop, shopStore, user, writing } from './shop.ts'
import { codeOf, system } from './work.ts'

const description = described()
const ids = (rows: Row[]): string[] => rows.map((row) => String(row.id))

/** The records of a group, in an order that does not lean on the store. */
const records = (rows: Row[]): string[] => rows.map((row) => JSON.stringify(row)).sort()

test('[20-3] of a linked row that the caller may not read nothing is told: by no filter, no sort and no group through the link, and a pick reads through none', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const [ada, bob] = [user(s.ada, ['staff']), user(s.bob)]
  const read = (who: Caller) => reading(store, description, who, { seal })
  const asSystem = writing(store, description, system, { seal })
  const orders = () => at(read(ada), 'orders')

  // Ada placed two orders for Acme, whom she reads, and one for Bolt, whom she may not read.
  // A filter: the row of Bolt fits none, whatever it asks, so no value of Bolt is found by trying.
  assert.deepEqual(ids(orders().where({ 'customer.name': 'Bolt' }).all()), [])
  assert.deepEqual(ids(orders().where({ 'customer.name': 'Acme' }).all()), [s.first, s.second])
  for (const asked of [
    { startsWith: 'B' },
    { contains: 'ol' },
    { in: ['Bolt', 'Acme'] },
    { above: 'Acme' },
    { atLeast: 'Bolt' },
    { not: 'Acme' },
    { empty: true },
    { empty: false },
  ])
    assert.ok(
      !ids(orders().where({ 'customer.name': asked }).all()).includes(s.far),
      `a filter through the link with ${JSON.stringify(asked)}`,
    )
  assert.equal(orders().count({ 'customer.name': { startsWith: 'B' } }), 0)
  assert.equal(orders().where({ 'customer.vip': false }).count(), 2)
  assert.equal(orders().where({ 'customer.team.name': 'South' }).count(), 0)
  assert.equal(orders().where({ 'customer.team.name': 'North' }).count(), 2)
  // What is not so of a row that fits no filter is so, whatever the linked row holds: it tells nothing either.
  assert.deepEqual(
    ids(
      orders()
        .where({ not: { 'customer.name': 'Bolt' } })
        .all(),
    ),
    [s.first, s.second, s.far],
  )
  assert.deepEqual(
    ids(
      orders()
        .where({ not: { 'customer.name': 'Nobody' } })
        .all(),
    ),
    [s.first, s.second, s.far],
  )

  // A sort: the row sorts as a row with no value, wherever the name of Bolt would stand.
  const sorted = () => [ids(orders().sort('customer.name').all()), ids(orders().sort('-customer.name').all())]
  assert.deepEqual(sorted(), [
    [s.far, s.first, s.second],
    [s.first, s.second, s.far],
  ])
  asSystem((db) => at(db, 'customers').change(s.bolt, { name: 'Aaa' }))
  assert.deepEqual(sorted(), [
    [s.far, s.first, s.second],
    [s.first, s.second, s.far],
  ])
  asSystem((db) => at(db, 'customers').change(s.bolt, { name: 'Bolt' }))

  // A group: the row gives its group no key.
  assert.deepEqual(
    records(orders().group('customer.name', { n: count() }).all()),
    records([{ n: 1 }, { 'customer.name': 'Acme', n: 2 }]),
  )
  assert.deepEqual(
    records(orders().group('customer.team.name', { n: count() }).all()),
    records([{ n: 1 }, { 'customer.team.name': 'North', n: 2 }]),
  )
  // Bob may not read the order of the one line, so its note is no key and no value of his groups.
  const lines = () => at(read(bob), 'lines')
  assert.deepEqual(lines().group('order.note', { n: count() }).all(), [{ n: 1 }])
  assert.deepEqual(
    lines()
      .group('qty', { most: max('order.net'), all: sum('order.net') })
      .all(),
    [{ qty: 3 }],
  )
  assert.equal(
    lines()
      .where({ 'order.note': { startsWith: 'the' } })
      .count(),
    0,
  )
  assert.equal(lines().where({ 'order.customer.name': 'Acme' }).count(), 0)
  assert.deepEqual(ids(lines().sort('order.net').all()), [s.line])
  assert.deepEqual(at(read(ada), 'lines').group('order.note', { n: count() }).all(), [
    { 'order.note': 'the first order', n: 1 },
  ])
  // Two links on the way: Ada reads the order of the second line, and not its customer.
  const second = String(asSystem((db) => at(db, 'lines').add({ order: s.far, qty: 1 })).id)
  assert.deepEqual(ids(at(read(ada), 'lines').where({ 'order.customer.name': 'Acme' }).all()), [s.line])
  assert.deepEqual(ids(at(read(ada), 'lines').where({ 'order.customer.name': 'Bolt' }).all()), [])
  assert.deepEqual(
    records(at(read(ada), 'lines').group('order.customer.name', { n: count() }).all()),
    records([{ n: 1 }, { 'order.customer.name': 'Acme', n: 1 }]),
  )
  assert.deepEqual(ids(at(read(ada), 'lines').sort('order.customer.name').all()), [second, s.line])

  // A pick names columns of the table itself: in a plan inside `in` too, it reads through no link.
  assert.equal(
    codeOf(() =>
      at(read(ada), 'teams')
        .where({ name: { in: at(read(ada), 'orders').pick(['customer.name']) } })
        .all(),
    ),
    'T1014',
  )

  // Code with full access is told everything, as before.
  const full = createDb(store, description, ada, 'read', {}, { seal, system: true })
  const all = at(Reflect.get(full, 'system'), 'orders')
  assert.deepEqual(ids(all.where({ 'customer.name': 'Bolt' }).all()), [s.far, s.bobs])
  assert.deepEqual(
    records(all.group('customer.name', { n: count() }).all()),
    records([
      { 'customer.name': 'Acme', n: 2 },
      { 'customer.name': 'Bolt', n: 2 },
    ]),
  )
  assert.deepEqual(ids(all.sort('customer.name').all()), [s.first, s.second, s.far, s.bobs])
})

test('[20-3] [50-2] a filter through a link into the shared file reads the shared row under the rule of the caller', (t) => {
  const desk = appOf()
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  const asSystem = writingFiles(files, desk)
  const [hers, his] = asSystem((db) => [
    String(at(db, 'orders').of(s.north).add({ total: 1, placedBy: s.ada }).id),
    String(at(db, 'orders').of(s.north).add({ total: 2, placedBy: s.bob }).id),
  ])
  // Ada is a member of North and reads both orders. Of `users` she reads her own row alone.
  const orders = () => at(readingFiles(files, desk, person(s.ada)), 'orders').of(s.north)
  assert.deepEqual(ids(orders().all()), [hers, his])
  assert.deepEqual(ids(orders().where({ 'placedBy.name': 'Ada' }).all()), [hers])
  assert.deepEqual(ids(orders().where({ 'placedBy.name': 'Bob' }).all()), [])
  assert.equal(orders().count({ 'placedBy.name': { startsWith: 'B' } }), 0)
  assert.deepEqual(
    ids(
      orders()
        .where({ 'placedBy.name': { not: 'Ada' } })
        .all(),
    ),
    [],
  )
  // The lines of an order are read through a link inside the file, under the rule of the orders.
  const line = asSystem((db) => String(at(db, 'lines').of(s.north).add({ order: his, qty: 2 }).id))
  const lines = (who: string) => at(readingFiles(files, desk, person(who)), 'lines').of(s.north)
  assert.deepEqual(ids(lines(s.ada).where({ 'order.total': 2 }).all()), [line])
  assert.deepEqual(ids(lines(s.ada).where({ 'order.placedBy.name': 'Bob' }).all()), [])
  assert.deepEqual(ids(readingFilesAll(files, desk, s.north).where({ 'order.placedBy.name': 'Bob' }).all()), [line])
})

/** The lines of one team as the system reads them. */
const readingFilesAll = (files: Parameters<typeof readingFiles>[0], desk: ReturnType<typeof appOf>, team: string) =>
  at(readingFiles(files, desk), 'lines').of(team)

test('[20-3] a private column is told to a limited caller by no way: a group by it through a link is refused and a value of one leaves it out, not by a plan inside in, and not by a search', (t) => {
  const notes = table('notes', {
    columns: { title: text(), secret: text({ private: true, optional: true }) },
    access: { read: 'signedIn' },
    search: ['title', 'secret'],
  })
  // The table is refused where it is described. What follows holds for a description that is run all the same.
  const { description: withNotes, findings } = describe({
    definitions: [...definitions, notes].map((value) => ({ value })),
  })
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.message}`),
    ['T1014 notes: `search` names the private column `secret`.'],
  )
  const store = shopStore(t, withNotes)
  const s = seedShop(store, withNotes)
  writing(store, withNotes, system)((db) => at(db, 'notes').add({ title: 'the horse', secret: 'zebra' }))
  const ada = user(s.ada, ['staff'])
  const db = reading(store, withNotes, ada, { seal })
  const full = Reflect.get(createDb(store, withNotes, ada, 'read', {}, { seal, system: true }), 'system')

  // A group through a link: one by the private column is refused, and a value worked out from it is left out.
  assert.equal(
    codeOf(() => at(db, 'orders').group('placedBy.salary', { n: count() }).all()),
    'T0013',
  )
  assert.equal(
    codeOf(() => at(db, 'members').group('user.salary', { n: count() }).all()),
    'T0013',
  )
  assert.deepEqual(
    records(
      at(db, 'members')
        .group('team', { top: max('user.salary'), n: count() })
        .all(),
    ),
    records([
      { team: s.north, n: 1 },
      { team: s.south, n: 1 },
    ]),
  )
  assert.equal(
    codeOf(() => at(db, 'lines').group('order.cost', { n: count() }).all()),
    'T0013',
  )
  assert.deepEqual(at(full, 'orders').group('placedBy.salary', { n: count() }).all(), [
    { 'placedBy.salary': 4000, n: 1 },
    { 'placedBy.salary': 5000, n: 3 },
  ])

  // A plan inside `in` that picks a private column is held as a filter on it is.
  for (const wrong of [
    () =>
      at(db, 'orders')
        .where({ net: { in: at(db, 'users').pick(['salary']) } })
        .all(),
    () =>
      at(db, 'orders')
        .where({ net: { in: at(db, 'orders').pick(['placedBy.salary']) } })
        .count(),
    () =>
      at(db, 'users')
        .where({ id: { in: at(db, 'users').where({ salary: 5000 }) } })
        .all(),
  ])
    assert.equal(codeOf(wrong), 'T0013')
  assert.deepEqual(
    at(full, 'users')
      .where({ id: { in: at(full, 'users').where({ salary: 5000 }) } })
      .all()
      .map((row) => row.name),
    ['Ada'],
  )

  // A search of a table that names a private column in `search` is matched over the other columns for a limited caller.
  assert.deepEqual(at(db, 'notes').search('zebra').all(), [])
  assert.equal(at(db, 'notes').search('horse').count(), 1)
  assert.deepEqual(
    at(full, 'notes')
      .search('zebra')
      .all()
      .map((row) => row.title),
    ['the horse'],
  )
  // A search for no text is no part of its plan.
  assert.equal(at(db, 'notes').search(' ').count(), 1)
})

test('[20-3] [12-4] given in the filter of a rule that is code is T1014 while running, and the rule shows no row', (t) => {
  const byTeam = (who: User | undefined) => ({ team: given(Reflect.get(Object(who), 'team')) })
  const inside = (who: User | undefined, db: object) => ({
    team: {
      in: at(db, 'members')
        .where({ user: given(who?.id) })
        .pick(['team']),
    },
  })
  const notes = table('notes', {
    columns: { team: link('teams'), body: text() },
    access: { read: where(byTeam), add: where(byTeam), change: where(inside), remove: where(byTeam) },
  })
  const withNotes = described([...definitions, notes])
  const store = shopStore(t, withNotes)
  const s = seedShop(store, withNotes)
  const note = String(
    writing(store, withNotes, system)((db) => at(db, 'notes').add({ team: s.north, body: 'for the north' })).id,
  )
  const rules = {
    notes_access_read: byTeam,
    notes_access_add: byTeam,
    notes_access_change: inside,
    notes_access_remove: byTeam,
  }
  // A caller with no team would be shown every row by a rule whose one entry is left out.
  for (const who of [user(s.ada), { kind: 'nobody' } as const]) {
    const db = reading(store, withNotes, who, {}, rules)
    for (const call of [
      () => at(db, 'notes').all(),
      () => at(db, 'notes').count(),
      () => at(db, 'notes').get(note),
      () => at(db, 'notes').history(note),
    ])
      assert.equal(codeOf(call), 'T1014')
    const as = writing(store, withNotes, who, {}, rules)
    assert.equal(
      codeOf(() => as((one) => at(one, 'notes').add({ team: s.north, body: 'x' }))),
      'T1014',
    )
    assert.equal(
      codeOf(() => as((one) => at(one, 'notes').change(note, { body: 'x' }))),
      'T1014',
    )
    assert.equal(
      codeOf(() => as((one) => at(one, 'notes').remove(note))),
      'T1014',
    )
  }
  assert.throws(() => at(reading(store, withNotes, user(s.ada), {}, rules), 'notes').all(), /given/)
  assert.equal(at(reading(store, withNotes, system, {}, rules), 'notes').get(note)?.body, 'for the north')
})

test('[20-3] the history of a removed row is opened by the read rule tested against its last kept version, a plan in the rule among it', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const [ada, bob] = [user(s.ada, ['staff']), user(s.bob)]
  const asSystem = writing(store, description, system, { seal })
  asSystem((db) => at(db, 'customers').change(s.bolt, { name: 'Bolt and sons' }))
  const before = at(reading(store, description, bob, { seal }), 'customers').history(s.bolt)
  assert.deepEqual(
    before.map((entry) => entry.value.name),
    ['Bolt'],
  )
  asSystem((db) => {
    at(db, 'orders').remove(s.far)
    at(db, 'orders').remove(s.bobs)
    at(db, 'customers').remove(s.bolt)
  })
  // Bob is a member of the team of the removed customer: the rule holds a plan, which is answered first.
  const after = at(reading(store, description, bob, { seal }), 'customers').history(s.bolt)
  assert.deepEqual(
    after.map((entry) => entry.value.name),
    ['Bolt', 'Bolt and sons'],
  )
  assert.ok(after.every((entry) => !('margin' in entry.value)))
  // Ada is none, and nobody is signed in to nothing.
  assert.deepEqual(at(reading(store, description, ada, { seal }), 'customers').history(s.bolt), [])
  assert.deepEqual(at(reading(store, description, { kind: 'nobody' }, { seal }), 'customers').history(s.bolt), [])
  // The order that Bob placed was removed too: its rule is `owner`, which its last version is held to.
  assert.equal(at(reading(store, description, bob, { seal }), 'orders').history(s.bobs).length, 1)
  assert.deepEqual(at(reading(store, description, ada, { seal }), 'orders').history(s.bobs), [])
})

test('[20-3] of a linked table whose rule lets the caller read no row at all nothing is told: a role the caller lacks, a caller who is signed out, and a table that states no read rule', (t) => {
  const vaults = table('vaults', {
    columns: { name: text(), weight: number() },
    access: { read: role('keeper'), add: role('keeper') },
  })
  // A table that states no `read` rule is read by nobody.
  const sheds = table('sheds', { columns: { name: text(), weight: number() }, access: { add: role('keeper') } })
  const keys = table('keys', {
    columns: { label: text(), vault: link('vaults'), shed: link('sheds') },
    access: { read: anyone('the labels of the keys are public') },
  })
  const withKeys = described([...definitions, vaults, sheds, keys])
  const store = shopStore(t, withKeys)
  const s = seedShop(store, withKeys)
  // The keys in the order they were added: the weights of what they open fall, so a sort by them turns the order round.
  const added = writing(
    store,
    withKeys,
    system,
  )((db) =>
    [
      ['first', 30],
      ['second', 20],
      ['third', 10],
    ].map(([label, weight]) => {
      const vault = at(db, 'vaults').add({ name: `vault ${label}`, weight }).id
      const shed = at(db, 'sheds').add({ name: `shed ${label}`, weight }).id
      return String(at(db, 'keys').add({ label, vault, shed }).id)
    }),
  )
  const turned = [...added].reverse()
  const limited: [string, Caller, string[]][] = [
    ['signed in, with no such role', user(s.ada, ['staff']), ['vault', 'shed']],
    ['signed out', { kind: 'nobody' }, ['vault', 'shed']],
    // A keeper reads the vaults, and the sheds as little as anyone.
    ['a keeper', user(s.bob, ['keeper']), ['shed']],
  ]
  for (const [who, as, links] of limited) {
    const db = () => at(reading(store, withKeys, as, { seal }), 'keys')
    assert.deepEqual(ids(db().all()), added, who)
    for (const through of links) {
      const what = `${who}, through ${through}`
      // A filter fits no row, whatever it asks, and turned round it fits every row.
      for (const asked of [
        `${through} first`,
        { startsWith: through },
        { contains: 'e' },
        { not: 'x' },
        { empty: false },
        { empty: true },
      ])
        assert.deepEqual(
          ids(
            db()
              .where({ [`${through}.name`]: asked })
              .all(),
          ),
          [],
          what,
        )
      assert.equal(db().count({ [`${through}.weight`]: { above: 0 } }), 0, what)
      assert.deepEqual(
        ids(
          db()
            .where({ not: { [`${through}.name`]: `${through} first` } })
            .all(),
        ),
        added,
        what,
      )
      assert.deepEqual(
        ids(
          db()
            .where({ [through]: { in: at(reading(store, withKeys, as, { seal }), `${through}s`).pick(['id']) } })
            .all(),
        ),
        [],
        what,
      )
      // A sort leaves the rows in the order they were added, both ways.
      assert.deepEqual(ids(db().sort(`${through}.weight`).all()), added, what)
      assert.deepEqual(ids(db().sort(`-${through}.weight`).all()), added, what)
      // A group has no key, and a value of it holds nothing of the linked rows.
      assert.deepEqual(db().group(`${through}.name`, { n: count() }).all(), [{ n: 3 }], what)
      const worked = { n: count(), all: sum(`${through}.weight`), most: max(`${through}.weight`) }
      assert.deepEqual(db().group([], worked).all(), [{ n: 3 }], what)
      assert.deepEqual(
        records(db().group('label', worked).all()),
        records(['first', 'second', 'third'].map((label) => ({ label, n: 1 }))),
        what,
      )
      // `with` holds the id alone.
      for (const row of db().with(through).all()) assert.deepEqual(Object.keys(Object(row[through])), ['id'], what)
    }
  }
  // Who may read the vaults is told of them, by each of the same ways.
  const keeper = () => at(reading(store, withKeys, user(s.bob, ['keeper']), { seal }), 'keys')
  assert.deepEqual(ids(keeper().where({ 'vault.name': 'vault first' }).all()), [added[0]])
  assert.deepEqual(ids(keeper().sort('vault.weight').all()), turned)
  assert.deepEqual(
    keeper()
      .group([], { all: sum('vault.weight'), most: max('vault.weight') })
      .all(),
    [{ all: 60, most: 30 }],
  )
  assert.equal(keeper().group('vault.name', { n: count() }).all().length, 3)
})
