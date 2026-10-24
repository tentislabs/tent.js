import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Row, Store } from '../index.ts'
import { exportUser, historyTable, removeUser } from '../index.ts'
import { link, table, text } from '../../core/index.ts'
import { appOf, filesOf, seedDesk, writingFiles } from './apart.ts'
import { at, definitions, described, reading, seal, seedShop, shopStore, user, writing } from './shop.ts'
import { codeOf, system } from './work.ts'

const description = described()

// A table whose rows hold a sealed value, an owner, and a link to a person that is cleared when the person goes.
const papers = table('papers', {
  columns: {
    body: text({ sealed: true }),
    author: link('users', { optional: true }),
    reader: link('users', { optional: true, onRemove: 'clear' }),
  },
  owner: 'author',
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
  keepHistory: true,
})
const withPapers = described([...definitions, papers])

const rowsOf = (store: Store, name: string): Row[] => Object(store.read({ from: name }, system).value)
const idsOf = (rows: Row[]): string[] => rows.map((row) => String(row.id))

test('[20-7] the export of a person contains every row they own and nothing else', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  const ada = exportUser(store, description, s.ada)
  assert.equal(ada.id, s.ada)
  // Their row of `users`, with what only full access reads.
  assert.deepEqual(
    { ...ada.user, createdAt: 0, updatedAt: 0 },
    { id: s.ada, createdAt: 0, updatedAt: 0, name: 'Ada', email: 'ada@example.com', roles: ['staff'], salary: 5000 },
  )
  // Every row of every table whose owner is that person: the three orders she placed, and no order of Bob.
  assert.deepEqual(Object.keys(ada.rows), ['orders'])
  assert.deepEqual(idsOf(ada.rows.orders), [s.first, s.second, s.far])
  assert.deepEqual(ada.rows.orders[0].note, 'the first order')
  assert.equal(ada.rows.orders[0].cost, 7)
  const bob = exportUser(store, description, s.bob)
  assert.deepEqual(idsOf(bob.rows.orders), [s.bobs])
  // A person who owns nothing, and an id that names nobody.
  assert.deepEqual(exportUser(store, description, s.cy).rows, { orders: [] })
  assert.deepEqual(exportUser(store, description, '0'.repeat(26)), { id: '0'.repeat(26), rows: { orders: [] } })
  // It is one value that is written as JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(ada)).rows.orders.length, 3)
})

test('[20-7] the removal of a person leaves no row that links to them, except where onRemove is refuse, which is reported, and their kept earlier versions are gone', (t) => {
  const store = shopStore(t)
  const s = seedShop(store, description)
  // Earlier versions are kept: Bob changed his own order and, as staff, a customer and an order of Ada.
  const asBob = writing(store, description, user(s.bob, ['staff']), { seal })
  asBob((db) => at(db, 'orders').change(s.bobs, { note: 'changed by Bob' }))
  asBob((db) => at(db, 'customers').change(s.bolt, { name: 'Bolt and sons' }))
  asBob((db) => at(db, 'orders').change(s.first, { note: 'changed by Bob too' }))
  // A row that links to Ada with a link that refuses: a thing of hers, in a table that states no owner.
  const thing = writing(
    store,
    description,
    system,
  )((db) => String(at(db, 'things').add({ must: 'x', owner: s.ada }).id))
  const history = () => rowsOf(store, historyTable.name).map((row) => `${row.tableName} ${row.rowId} by ${row.by}`)
  assert.deepEqual(history(), [
    `orders ${s.bobs} by user:${s.bob}`,
    `customers ${s.bolt} by user:${s.bob}`,
    `orders ${s.first} by user:${s.bob}`,
  ])

  // Bob: his row, his order and his membership go. The rows that were added for him as the system stay nowhere.
  const bob = store.write((tx) => removeUser(tx, description, s.bob)).value
  assert.deepEqual(bob.refused, [])
  assert.deepEqual(bob.removed, { orders: 1, members: 1, users: 1 })
  assert.equal(store.read({ from: 'users', one: 'get', id: s.bob }, system).value, undefined)
  assert.deepEqual(idsOf(rowsOf(store, 'orders')), [s.first, s.second, s.far])
  assert.equal(rowsOf(store, 'members').length, 1)
  // The kept earlier version of his removed row is gone, and where an earlier version of another row named him
  // as who changed it, it says `removed`.
  assert.deepEqual(history(), [`customers ${s.bolt} by removed`, `orders ${s.first} by removed`])
  // The team he was a member of, and the customer he changed, are no rows of his: they stay.
  assert.equal(rowsOf(store, 'teams').length, 2)
  assert.equal(rowsOf(store, 'customers').length, 2)

  // Ada: her orders go, with the lines that link to them and their kept versions, and her membership. A thing
  // links to her and refuses: it stays, her row of `users` stays with it, and both are reported.
  const ada = store.write((tx) => removeUser(tx, description, s.ada)).value
  assert.deepEqual(ada.refused, [{ table: 'things', column: 'owner', rows: 1, of: 'users' }])
  assert.deepEqual(ada.removed, { orders: 3, lines: 1, members: 1 })
  assert.deepEqual(rowsOf(store, 'orders'), [])
  assert.deepEqual(rowsOf(store, 'lines'), [])
  assert.deepEqual(rowsOf(store, 'members'), [])
  assert.deepEqual(idsOf(rowsOf(store, 'users')), [s.ada, s.cy])
  assert.deepEqual(idsOf(rowsOf(store, 'things')), [thing])
  assert.deepEqual(history(), [`customers ${s.bolt} by removed`])
  // The product that a removed line linked to stays, and so does every row of another person.
  assert.equal(rowsOf(store, 'products').length, 1)
  // No row is left that links to a row which is gone.
  assert.equal(at(reading(store, description, system, { seal }), 'customers').count(), 2)

  // Once the thing is gone, her row goes too.
  writing(store, description, system)((db) => at(db, 'things').remove(thing))
  const again = store.write((tx) => removeUser(tx, description, s.ada)).value
  assert.deepEqual(again, { removed: { users: 1 }, refused: [] })
  assert.deepEqual(idsOf(rowsOf(store, 'users')), [s.cy])
  // A person who is not there: nothing is removed, and nothing fails.
  assert.deepEqual(store.write((tx) => removeUser(tx, description, s.ada)).value, { removed: {}, refused: [] })
  assert.equal(
    codeOf(() => store.write((tx) => removeUser(tx, description, s.cy))),
    undefined,
  )
})

test('[20-7] the removal of a person clears a link on a row that holds a sealed value, with no key at hand', (t) => {
  const store = shopStore(t, withPapers)
  const s = seedShop(store, withPapers)
  const paper = writing(store, withPapers, system, { seal })((db) =>
    String(at(db, 'papers').add({ body: 'for Bob alone', author: s.ada, reader: s.bob }).id),
  )
  const stored = () => rowsOf(store, 'papers')[0]
  const sealed = stored().body
  assert.equal(sealed, seal.close('for Bob alone', `papers.body.${paper}`))

  // `removeUser` is handed no key: the row is cleared and never opened.
  const bob = store.write((tx) => removeUser(tx, withPapers, s.bob)).value
  assert.deepEqual(bob, { removed: { orders: 1, members: 1, users: 1 }, refused: [] })
  assert.equal(stored().reader, undefined)
  assert.equal(stored().author, s.ada)
  // The sealed value stands as it stood, and whoever holds the key still opens it.
  assert.equal(stored().body, sealed)
  assert.equal(at(reading(store, withPapers, system, { seal }), 'papers').get(paper)?.body, 'for Bob alone')
  // The earlier version of the cleared row is kept, with its value sealed.
  const kept = rowsOf(store, historyTable.name).filter((row) => row.tableName === 'papers')
  assert.deepEqual(
    kept.map((row) => row.rowId),
    [paper],
  )
  assert.ok(!JSON.stringify(kept).includes('for Bob alone'))
})

test('[20-7] the export of a person opens their sealed values with a seal, and leaves them sealed without one', async (t) => {
  const store = shopStore(t, withPapers)
  const s = seedShop(store, withPapers)
  const asAda = writing(store, withPapers, user(s.ada), { seal })
  const paper = asAda((db) => String(at(db, 'papers').add({ body: 'her own words' }).id))
  // Without a seal the value stands sealed, as it is stored.
  const closed = exportUser(store, withPapers, s.ada)
  assert.deepEqual(
    closed.rows.papers.map((row) => row.body),
    [seal.close('her own words', `papers.body.${paper}`)],
  )
  // With it the value is opened: it is their own data.
  const open = exportUser(store, withPapers, s.ada, { seal })
  assert.deepEqual(
    open.rows.papers.map((row) => [row.id, row.body, row.author]),
    [[paper, 'her own words', s.ada]],
  )
  assert.deepEqual(idsOf(open.rows.orders), idsOf(closed.rows.orders))
  assert.equal(open.user?.salary, 5000)
  // The store holds what it held.
  assert.equal(rowsOf(store, 'papers')[0].body, seal.close('her own words', `papers.body.${paper}`))

  // Over the files of tenants the same holds in every file.
  const desk = appOf({ sealedText: true })
  const files = filesOf(t, desk)
  const d = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const north = write((db) => String(at(db, 'notes').of(d.north).add({ author: d.ada, text: 'north' }).id))
  write((db) => at(db, 'notes').of(d.south).add({ author: d.ada, text: 'south' }))
  for (const file of files.open()) files.close(file)
  const sealedNotes = (await exportUser(files, desk, d.ada)).rows.notes
  assert.ok(sealedNotes.map((row) => row.text).includes(seal.close('north', `notes.text.${north}`)))
  const opened = await exportUser(files, desk, d.ada, { seal })
  assert.deepEqual(opened.rows.notes.map((row) => row.text).sort(), ['north', 'south'])
})
