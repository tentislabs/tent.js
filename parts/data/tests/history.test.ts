import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { boolean, project, table, text, where } from '../../core/index.ts'
import { historyTable } from '../index.ts'
import { at, described, reading, seal, seedShop, shopStore, user, writing } from './shop.ts'
import { started, switched } from './switch.ts'
import { codeOf, opened, system, workFolder } from './work.ts'

const description = described()

test('[16-4@3] `_t_history` exists with exactly its columns and its key, and holds each earlier version of a row with who changed it and when', (t) => {
  assert.deepEqual(Object.keys(historyTable.columns), ['id', 'tableName', 'rowId', 'at', 'by', 'value'])
  assert.deepEqual(historyTable.key, ['id'])
  const store = shopStore(t)
  const s = seedShop(store, description)
  // A raw text reads nothing that tells of a table of the engine, so the store is asked for the layout it holds.
  assert.deepEqual(Object.keys(store.layout().find((one) => one.name === '_t_history')?.columns ?? {}), [
    'id',
    'tableName',
    'rowId',
    'at',
    'by',
    'value',
  ])
  assert.deepEqual(store.read({ from: '_t_history' }, system).value, [], 'an added row has no earlier version')

  let clock = Date.parse('2026-10-13T10:00:00Z')
  const as = (who: Parameters<typeof writing>[2]) => writing(store, description, who, { seal, now: () => clock })
  const ada = user(s.ada, ['staff'])
  as(ada)((db) => at(db, 'customers').change(s.acme, { name: 'Acme Ltd', vip: true }))
  clock += 60_000
  as(system)((db) => at(db, 'customers').change(s.acme, { margin: 0.5 }))
  clock += 60_000
  as(user(s.cy, ['admin', 'staff']))((db) =>
    at(db, 'customers').remove(String(at(db, 'customers').add({ name: 'Brief', team: s.north }).id)),
  )

  const kept = store.read({ from: '_t_history', sort: [{ by: 'at' }] }, system).value
  assert.ok(Array.isArray(kept))
  assert.deepEqual(
    kept.map((row) => [row.tableName, row.rowId === s.acme ? 'acme' : 'brief', row.at, row.by, Object(row.value).name]),
    [
      ['customers', 'acme', new Date('2026-10-13T10:00:00Z'), `user:${s.ada}`, 'Acme'],
      ['customers', 'acme', new Date('2026-10-13T10:01:00Z'), 'system', 'Acme Ltd'],
      ['customers', 'brief', new Date('2026-10-13T10:02:00Z'), `user:${s.cy}`, 'Brief'],
    ],
  )
  // The id of a kept version is made as the id of a row is, and the value is the row as app code sees it.
  for (const row of kept) assert.match(String(row.id), /^[0-9a-hjkmnp-tv-z]{26}$/)
  assert.deepEqual(Object.keys(Object(kept[0].value)).sort(), [
    'createdAt',
    'id',
    'margin',
    'name',
    'taxNo',
    'team',
    'updatedAt',
    'vip',
  ])
  assert.equal(Object(kept[0].value).team, s.north)
  assert.equal(Object(kept[0].value).vip, false)
  // A table that does not keep its history keeps none.
  as(system)((db) => at(db, 'teams').change(s.north, { name: 'Far North' }))
  assert.equal(Object(store.read({ from: '_t_history', count: true }, system)).value, 3)

  // `history(id)` reads them, the oldest first, each with its moment, who changed it and the row as it was.
  const history = at(reading(store, description, ada, { seal }), 'customers').history(s.acme)
  assert.deepEqual(
    history.map((one) => [one.at, one.by, one.value.name, one.value.taxNo, 'margin' in one.value]),
    [
      [new Date('2026-10-13T10:00:00Z'), `user:${s.ada}`, 'Acme', 'TR-1', false],
      [new Date('2026-10-13T10:01:00Z'), 'system', 'Acme Ltd', 'TR-1', false],
    ],
  )
  assert.ok(history[0].value.createdAt instanceof Date)
  // A private column is in the value only through full access.
  const full = at(reading(store, description, system, { seal }), 'customers').history(s.acme)
  assert.deepEqual(
    full.map((one) => one.value.margin),
    [0.3, 0.3],
  )
  // It is opened by the `read` rule of today, tested against the row as it is now.
  assert.deepEqual(at(reading(store, description, user(s.bob), { seal }), 'customers').history(s.acme), [])
  assert.deepEqual(at(reading(store, description, { kind: 'nobody' }, { seal }), 'customers').history(s.acme), [])
  // For a removed row it is tested against its last kept version: a signed-in caller reads what a table kept of a
  // removed row that `signedIn` lets them read, and nobody does not.
  as(system)((db) => {
    const added = at(db, 'orders').add({ customer: s.acme, placedBy: s.bob, net: 5 })
    at(db, 'orders').remove(String(added.id))
    at(db, 'orders').change(s.bobs, { net: 41 })
    at(db, 'orders').remove(s.bobs)
  })
  const bob = reading(store, description, user(s.bob), { seal })
  assert.deepEqual(
    at(bob, 'orders')
      .history(s.bobs)
      .map((one) => one.value.net),
    [40, 41],
  )
  assert.deepEqual(
    at(reading(store, description, ada, { seal }), 'orders').history(s.bobs),
    [],
    'the orders of another',
  )
  assert.deepEqual(at(bob, 'orders').history('00000000000000000000000000'), [])
})

test('[20-4] [16-4@3] history reads the versions kept under the former names of a table, hands each column under its present name, and opens a sealed value by the names it was kept under', (t) => {
  const shop = project('shop', {})
  const signedIn = { add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
  const first = table('notes', {
    columns: { title: text(), body: text({ sealed: true }), open: boolean() },
    access: { read: where({ open: true }), ...signedIn },
    keepHistory: true,
  })
  const { store, description: v1 } = started(t, [shop, first], { seal })
  store.write(() => store.applyTableChanges([{ do: 'addTable', table: historyTable.name, layout: historyTable }]))
  let clock = Date.parse('2026-10-13T10:00:00Z')
  const as = (description: typeof v1) => writing(store, description, system, { seal, now: () => clock++ })
  const [note, shown, hidden] = as(v1)((db) =>
    [true, true, false].map((open) => String(at(db, 'notes').add({ title: 't', body: 'b0', open }).id)),
  )
  as(v1)((db) => {
    at(db, 'notes').change(note, { body: 'b1' })
    at(db, 'notes').remove(shown)
    at(db, 'notes').remove(hidden)
  })

  // The column goes on under a second name.
  const v2 = described([
    shop,
    table('notes', {
      columns: { title: text(), words: text({ sealed: true, was: ['body'] }), open: boolean() },
      access: { read: where({ open: true }), ...signedIn },
      keepHistory: true,
    }),
  ])
  switched(store, v2, { seal })
  as(v2)((db) => at(db, 'notes').change(note, { words: 'b2' }))

  // The table goes on under a second name, the sealed column under a third, and the column of the rule under a second.
  const columns = {
    title: text(),
    text: text({ sealed: true, was: ['body', 'words'] }),
    shown: boolean({ was: ['open'] }),
  }
  const access = { read: where({ shown: true }), ...signedIn }
  const v3 = described([shop, table('memos', { columns, was: ['notes'], access, keepHistory: true })])
  switched(store, v3, { seal })
  as(v3)((db) => at(db, 'memos').change(note, { text: 'b3' }))

  // The table goes on under a third name.
  const v4 = described([shop, table('papers', { columns, was: ['notes', 'memos'], access, keepHistory: true })])
  const kept = () => store.read({ from: '_t_history', sort: [{ by: 'at' }, { by: 'id' }] }, system).value
  const before = kept()
  switched(store, v4, { seal })
  // A rename writes nothing of the kept versions anew: each stands under the names it was kept under.
  assert.deepEqual(kept(), before)
  as(v4)((db) => at(db, 'papers').change(note, { text: 'b4', title: 'last' }))
  const versions = kept()
  assert.ok(Array.isArray(versions))
  assert.deepEqual(
    versions.map((row) => [row.tableName, Object.keys(Object(row.value)).sort().join()]),
    [
      ['notes', 'body,createdAt,id,open,title,updatedAt'],
      ['notes', 'body,createdAt,id,open,title,updatedAt'],
      ['notes', 'body,createdAt,id,open,title,updatedAt'],
      ['notes', 'createdAt,id,open,title,updatedAt,words'],
      ['memos', 'createdAt,id,shown,text,title,updatedAt'],
      ['papers', 'createdAt,id,shown,text,title,updatedAt'],
    ],
  )
  assert.equal(Object(versions[0].value).body, seal.close('b0', `notes.body.${note}`))
  assert.equal(Object(versions[3].value).words, seal.close('b1', `notes.words.${note}`))
  assert.equal(Object(versions[4].value).text, seal.close('b2', `memos.text.${note}`))

  // Every version of the row is read, the oldest first, under the names of today.
  const ada = at(reading(store, v4, user('01h00000000000000000000001'), { seal }), 'papers')
  const history = ada.history(note)
  assert.deepEqual(
    history.map((one) => [one.value.text, one.value.shown, one.value.title]),
    [
      ['b0', true, 't'],
      ['b1', true, 't'],
      ['b2', true, 't'],
      ['b3', true, 't'],
    ],
  )
  for (const one of history)
    assert.deepEqual(Object.keys(one.value).sort(), ['createdAt', 'id', 'shown', 'text', 'title', 'updatedAt'])
  assert.ok(history[0].value.createdAt instanceof Date)
  // A row that was removed under the first names is held against the rule of today by its last kept version, read
  // under the names of today.
  assert.deepEqual(
    ada.history(shown).map((one) => [one.value.text, one.value.shown]),
    [['b0', true]],
  )
  assert.deepEqual(ada.history(hidden), [])
  assert.deepEqual(
    at(reading(store, v4, system, { seal }), 'papers')
      .history(hidden)
      .map((one) => [one.value.text, one.value.shown]),
    [['b0', false]],
  )
})

test('[20-4] where sealed is added to a column or taken from it, every kept version of a row is sealed or opened with the rows, those kept under a former name of the table among them: history answers the value as before, and the file holds the plain value in no kept version', (t) => {
  const shop = project('shop', {})
  const access = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
  const folder = workFolder(t)
  const store = opened(folder)
  const v1 = described([
    shop,
    table('notes', { columns: { title: text(), body: text({ optional: true }) }, access, keepHistory: true }),
  ])
  switched(store, v1)
  store.write(() => store.applyTableChanges([{ do: 'addTable', table: historyTable.name, layout: historyTable }]))
  let clock = Date.parse('2026-10-13T10:00:00Z')
  const as = (description: typeof v1) => writing(store, description, system, { seal, now: () => clock++ })
  const [note, gone, bare] = as(v1)((db) =>
    ['plain zero', 'plain gone', undefined].map((body) => String(at(db, 'notes').add({ title: 't', body }).id)),
  )
  as(v1)((db) => {
    at(db, 'notes').change(note, { body: 'plain one' })
    at(db, 'notes').remove(gone)
    at(db, 'notes').change(bare, { title: 'no body' })
  })
  // The table and the column go on under second names, and the row is changed once more.
  const memos = (sealed: boolean) =>
    described([
      shop,
      table('memos', {
        columns: { title: text(), words: text({ optional: true, was: ['body'], ...(sealed ? { sealed } : {}) }) },
        was: ['notes'],
        access,
        keepHistory: true,
      }),
    ])
  switched(store, memos(false))
  as(memos(false))((db) => at(db, 'memos').change(note, { words: 'plain two' }))

  /** What the file itself holds of the kept versions, read with the runtime's own SQLite. */
  const inFile = (): { tableName: string; rowId: string; value: Record<string, unknown> }[] => {
    const db = new DatabaseSync(join(folder, 'data.db'))
    try {
      return db
        .prepare('SELECT "tableName", "rowId", "value" FROM "_t_history" ORDER BY "at", "id"')
        .all()
        .map((row) => ({
          tableName: String(row.tableName),
          rowId: String(row.rowId),
          value: JSON.parse(String(row.value)),
        }))
    } finally {
      db.close()
    }
  }
  const told = (description: typeof v1, o: { seal?: typeof seal } = { seal }) => {
    const db = at(reading(store, description, user('01h00000000000000000000001'), o), 'memos')
    return [note, gone, bare].map((id) => db.history(id).map((one) => [one.value.title, one.value.words]))
  }
  const plain = [
    [
      ['t', 'plain zero'],
      ['t', 'plain one'],
    ],
    [['t', 'plain gone']],
    [['t', undefined]],
  ]
  assert.deepEqual(told(memos(false)), plain)
  assert.deepEqual(
    inFile().map((one) => [one.tableName, one.value.body ?? one.value.words]),
    [
      ['notes', 'plain zero'],
      ['notes', 'plain gone'],
      ['notes', undefined],
      ['memos', 'plain one'],
    ],
  )

  // `sealed` is added. It needs the key at hand, for the kept versions as for the rows.
  assert.equal(
    codeOf(() => switched(store, memos(true))),
    'T0019',
  )
  assert.deepEqual(told(memos(false)), plain)
  switched(store, memos(true), { seal })
  assert.deepEqual(told(memos(true)), plain)
  const sealedIn = inFile()
  assert.equal(sealedIn.length, 4)
  assert.equal(JSON.stringify(sealedIn).includes('plain'), false)
  // Each is sealed under the names it was kept under, by which `history` opens it.
  assert.deepEqual(
    sealedIn.map((one) => one.value),
    [
      { ...sealedIn[0].value, body: seal.close('plain zero', `notes.body.${note}`) },
      { ...sealedIn[1].value, body: seal.close('plain gone', `notes.body.${gone}`) },
      sealedIn[2].value,
      { ...sealedIn[3].value, words: seal.close('plain one', `memos.words.${note}`) },
    ],
  )
  assert.equal('body' in sealedIn[2].value || 'words' in sealedIn[2].value, false)
  // The row itself is sealed too, and a version that is kept from now on is sealed as it is kept.
  as(memos(true))((db) => at(db, 'memos').change(note, { words: 'plain three' }))
  assert.equal(JSON.stringify(inFile()).includes('plain'), false)
  assert.deepEqual(told(memos(true))[0], [...plain[0], ['t', 'plain two']])

  // `sealed` is taken from the column: every kept version is opened with the rows, and is read with no key.
  switched(store, memos(false), { seal })
  assert.deepEqual(
    inFile().map((one) => [one.tableName, one.value.body ?? one.value.words]),
    [
      ['notes', 'plain zero'],
      ['notes', 'plain gone'],
      ['notes', undefined],
      ['memos', 'plain one'],
      ['memos', 'plain two'],
    ],
  )
  assert.deepEqual(told(memos(false), {}), [[...plain[0], ['t', 'plain two']], plain[1], plain[2]])
})
