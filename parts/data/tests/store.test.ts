import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { choice, link, number, text } from '../../core/index.ts'
import type { TableLayout } from '../index.ts'
import { metaTable } from '../index.ts'
import { codeOf, made, opened, system, tableOf, workFolder } from './work.ts'

const customers = tableOf('customers', { name: text(), email: text({ optional: true }) }, { unique: [['email']] })
const orders = tableOf('orders', {
  customer: link('customers'),
  total: number(),
  status: choice(['open', 'paid']),
  note: text({ optional: true }),
})

/** Reads the columns and the key of a table as the file holds them, with a connection of the test's own. */
function stored(folder: string, table: string): { columns: string[]; key: string[] } {
  const file = new DatabaseSync(join(folder, 'data.db'), { readOnly: true })
  try {
    const rows = file.prepare(`SELECT name, pk FROM pragma_table_info('${table}') ORDER BY cid`).all()
    return {
      columns: rows.map((row) => String(row.name)),
      key: rows
        .filter((row) => Number(row.pk) > 0)
        .sort((a, b) => Number(a.pk) - Number(b.pk))
        .map((row) => String(row.name)),
    }
  } finally {
    file.close()
  }
}

test('[16-4@3] `_t_meta` is a table of the store with exactly its columns and its key, and holds the layout of each table', (t) => {
  const folder = workFolder(t)
  const store = opened(folder)
  assert.deepEqual(Object.keys(metaTable.columns), ['key', 'value'])
  assert.deepEqual(metaTable.key, ['key'])
  assert.deepEqual(stored(folder, '_t_meta'), { columns: ['key', 'value'], key: ['key'] })
  assert.deepEqual(
    store.layout().map((table) => table.name),
    ['_t_meta'],
  )

  made(store, [customers, orders])
  const layout = store.layout()
  assert.deepEqual(layout.map((table) => table.name).sort(), ['_t_meta', 'customers', 'orders'])
  assert.deepEqual(
    layout.find((table) => table.name === 'orders'),
    orders,
  )
  assert.equal(store.version().layout, 1)
  assert.match(store.version().engine, /^\d+\.\d+\.\d+$/)
  store.close()

  // The layout is kept in the file, one row for each table, so a store that opens it again answers the same.
  const again = opened(folder)
  assert.deepEqual(again.layout(), layout)
  const rows = again.read({ from: '_t_meta' }, system)
  assert.deepEqual(rows.tables, ['_t_meta'])
  const keys = (Array.isArray(rows.value) ? rows.value : []).map((row) => String(row.key))
  for (const name of ['shapeNumber', 'layout:customers', 'layout:orders'])
    assert.ok(keys.includes(name), `${name} in ${keys}`)
  again.close()
  // A table of an app has its inside number as its key, and the three columns every table has.
  assert.deepEqual(stored(folder, 'orders'), {
    columns: ['_n', 'id', 'createdAt', 'updatedAt', 'customer', 'total', 'status', 'note'],
    key: ['_n'],
  })
})

test('[16-2@3] T0013: the store refuses a raw text that is more than one statement which reads or writes rows, and a table of the engine', (t) => {
  const store = opened(workFolder(t))
  made(store, [customers, orders])
  const refused = [
    'SELECT 1; SELECT 2',
    "SELECT name FROM customers; DELETE FROM customers WHERE name = 'x'",
    'SELECT * FROM _t_meta',
    'SELECT name FROM customers WHERE name IN (SELECT value FROM _t_meta)',
    'COMMIT',
    'BEGIN',
    'ROLLBACK',
    'SAVEPOINT a',
    'PRAGMA journal_mode = DELETE',
    "ATTACH 'other.db' AS other",
    'DETACH other',
    'CREATE TABLE loose (a)',
    'CREATE TEMP TABLE loose (a)',
    'CREATE INDEX loose ON customers (name)',
    'CREATE VIEW loose AS SELECT 1',
    'CREATE TRIGGER loose AFTER INSERT ON customers BEGIN DELETE FROM _t_meta; END',
    'ALTER TABLE customers ADD COLUMN loose',
    'DROP TABLE customers',
    'VACUUM',
    'REINDEX',
    'ANALYZE',
    '',
    '   -- nothing but a comment',
  ]
  for (const sql of refused) {
    assert.equal(
      codeOf(() => store.sql?.(sql, [])),
      'T0013',
      `outside a write: ${sql}`,
    )
    assert.equal(
      codeOf(() => store.write((tx) => tx.sql(sql, []))),
      'T0013',
      `inside a write: ${sql}`,
    )
  }
  // A write of a table of the engine is refused inside a write too, and leaves nothing.
  assert.equal(
    codeOf(() => store.write((tx) => tx.sql("UPDATE _t_meta SET value = '9' WHERE key = 'shapeNumber'", []))),
    'T0013',
  )

  // What ends a statement is a semicolon outside quoted text and outside a comment, and only white space and
  // comments may follow it.
  const taken = [
    "SELECT ';' AS a",
    'SELECT 1 AS "a;b"',
    'SELECT 1 AS `a;b`',
    'SELECT 1 AS [a;b]',
    'SELECT 1 /* ; */ AS a',
    'SELECT 1 AS a -- ; and more',
    "SELECT 'it''s; fine' AS a;",
    'SELECT 1 AS a;   \n  -- a comment after the end\n /* and one more */  ',
    'SELECT 1 AS a; -- ; SELECT 2',
  ]
  for (const sql of taken) assert.equal(store.sql?.(sql, []).length, 1, sql)
  assert.deepEqual(store.sql?.('SELECT ? AS a, ? AS b', [1, 'x']), [{ a: 1, b: 'x' }])

  // A table step in a write that did not say so is refused, but for the three that a first row needs.
  const lines = tableOf('lines', { qty: number() })
  store.write(() => {
    store.applyTableChanges([
      { do: 'addTable', table: 'lines', layout: lines },
      { do: 'addIndex', table: 'lines', columns: ['qty'] },
      { do: 'addUnique', table: 'lines', columns: ['qty'] },
    ])
  })
  assert.ok(store.layout().some((table) => table.name === 'lines'))
  assert.equal(
    codeOf(() => store.write(() => store.applyTableChanges([{ do: 'dropTable', table: 'lines' }]))),
    'T0013',
  )
  assert.equal(
    codeOf(() => store.applyTableChanges([{ do: 'addTable', table: 'more', layout: tableOf('more', {}) }])),
    'T0013',
    'outside a write',
  )
  assert.ok(store.layout().some((table) => table.name === 'lines'))
})

test('[16-2@3] T0012: a raw text that writes outside a write, and a write through a store that only reads', (t) => {
  const folder = workFolder(t)
  const store = opened(folder)
  made(store, [customers])
  for (const sql of [
    "INSERT INTO customers (id, createdAt, updatedAt, name) VALUES ('a', 0, 0, 'x')",
    "UPDATE customers SET name = 'y'",
    'DELETE FROM customers',
  ])
    assert.equal(
      codeOf(() => store.sql?.(sql, [])),
      'T0012',
      sql,
    )
  // The same text inside a write is taken, and the write reports the table it stated with no ids.
  const wrote = store.write((tx) => {
    tx.sql("INSERT INTO customers (id, createdAt, updatedAt, name) VALUES ('a', 0, 0, 'x')", [], ['customers'])
  })
  assert.deepEqual(wrote.touched, [{ table: 'customers', ids: [] }])
  assert.deepEqual(store.sql?.('SELECT name FROM customers', []), [{ name: 'x' }])
  store.close()

  const reader = opened(folder, { readOnly: true })
  assert.deepEqual(reader.sql?.('SELECT name FROM customers', []), [{ name: 'x' }])
  assert.equal(
    codeOf(() => reader.write((tx) => tx.add('customers', { name: 'z' }, system))),
    'T0012',
  )
  assert.equal(
    codeOf(() => reader.sql?.("UPDATE customers SET name = 'y'", [])),
    'T0012',
  )
})

test('[16-2@3] T2101, T2103, T2104 and T2107: what the store itself refuses of a row', (t) => {
  const store = opened(workFolder(t))
  made(store, [customers, orders])
  const ada = store.write((tx) => tx.add('customers', { name: 'Ada', email: 'ada@example.com' }, system)).value
  const order = store.write((tx) => tx.add('orders', { customer: ada.id, total: 3, status: 'open' }, system)).value
  assert.equal(order.customer, ada.id)

  const twice = () => store.write((tx) => tx.add('customers', { name: 'Eve', email: 'ada@example.com' }, system))
  assert.equal(codeOf(twice), 'T2101')
  assert.throws(twice, (error: { fields?: Record<string, string> }) => 'email' in (error.fields ?? {}))

  const gone = '00000000000000000000000000'
  assert.equal(
    codeOf(() => store.write((tx) => tx.change('customers', gone, { name: 'x' }, system))),
    'T2103',
  )
  assert.equal(
    codeOf(() => store.write((tx) => tx.remove('customers', gone, system))),
    'T2103',
  )
  assert.equal(
    codeOf(() => store.write((tx) => tx.add('orders', { customer: gone, total: 1, status: 'open' }, system))),
    'T2104',
  )
  assert.equal(
    codeOf(() => store.write((tx) => tx.change('orders', String(order.id), { customer: gone }, system))),
    'T2104',
  )
  // A value that is not one of a choice, nothing for a required column, and a column the table does not have.
  for (const values of [
    { customer: ada.id, total: 1, status: 'lost' },
    { customer: ada.id, status: 'open' },
    { customer: ada.id, total: 1, status: 'open', nope: 1 },
  ])
    assert.equal(
      codeOf(() => store.write((tx) => tx.add('orders', values, system))),
      'T2107',
      JSON.stringify(values),
    )
  assert.equal(
    codeOf(() => store.write((tx) => tx.change('orders', String(order.id), { total: null }, system))),
    'T2107',
  )
  // Each refusal undid its whole write: the file holds the two rows it held.
  assert.deepEqual(
    store.sql?.('SELECT (SELECT count(*) FROM customers) AS c, (SELECT count(*) FROM orders) AS o', []),
    [{ c: 1, o: 1 }],
  )
  // A write that fails after a row was written leaves nothing of that row.
  assert.throws(() =>
    store.write((tx) => {
      tx.add('customers', { name: 'Kept?' }, system)
      throw new Error('undone')
    }),
  )
  assert.deepEqual(store.sql?.('SELECT count(*) AS c FROM customers', []), [{ c: 1 }])
})

const layouts: TableLayout[] = [customers, orders]
test('[16-4@3] the layout that the store answers is its own: changing what it handed out changes nothing', (t) => {
  const store = opened(workFolder(t))
  made(store, layouts)
  const handed = store.layout()
  handed.pop()
  assert.equal(store.layout().length, 3)
})
