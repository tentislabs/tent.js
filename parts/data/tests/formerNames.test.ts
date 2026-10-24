import assert from 'node:assert/strict'
import { test } from 'node:test'
import { link, table, text } from '../../core/index.ts'
import type { Row } from '../index.ts'
import { historyTable, removeUser } from '../index.ts'
import { at, definitions, described, seal, seedShop, shopStore, writing } from './shop.ts'
import { system } from './work.ts'

// A table that went on under a new name: its earlier versions were kept under the name it had before.
const letters = table('letters', {
  columns: { body: text(), author: link('users', { optional: true }) },
  owner: 'author',
  access: { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' },
  keepHistory: true,
  was: 'mails',
})
const description = described([...definitions, letters])

test('[20-7] the removal of a person removes the kept earlier versions of their rows that were kept under a former name of the table', (t) => {
  const store = shopStore(t, description)
  const s = seedShop(store, description)
  const write = writing(store, description, system, { seal })
  const mine = String(write((db) => at(db, 'letters').add({ body: 'now', author: s.bob })).id)
  const other = String(write((db) => at(db, 'letters').add({ body: 'hers', author: s.cy })).id)
  const kept = (id: string, tableName: string) =>
    store.write((tx) =>
      tx.add(
        historyTable.name,
        {
          id: `${id.slice(0, 25)}${tableName === 'mails' ? '0' : '1'}`,
          tableName,
          rowId: id,
          at: new Date(0),
          by: 'system',
          value: { id, body: 'before' },
        },
        system,
      ),
    )
  kept(mine, 'mails')
  kept(mine, 'letters')
  kept(other, 'mails')
  const versions = (): Row[] => {
    const rows = store.read({ from: historyTable.name, where: { col: 'rowId', in: [mine, other] } }, system).value
    return Array.isArray(rows) ? rows : []
  }
  assert.equal(versions().length, 3)

  store.write((tx) => removeUser(tx, description, s.bob))
  assert.deepEqual(
    versions().map((row) => row.rowId),
    [other],
    'the versions of the removed row are gone under both names, and those of another row stay',
  )
})
