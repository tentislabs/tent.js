import assert from 'node:assert/strict'
import test from 'node:test'
import { modeled, rowsIn } from './modeling.ts'

/** The columns of a table of a data file, each with its place in the key, as SQLite tells them. */
const columnsOf = (folder: string, table: string): string[] =>
  rowsIn(folder, 'data.db', `SELECT name, pk FROM pragma_table_info('${table}') ORDER BY cid`).map(
    (row) => `${row.name}${Number(row.pk) ? ` key ${row.pk}` : ''}`,
  )

/** The columns of each index of a table, by the order of their names. */
const indexesOf = (folder: string, table: string): string[] =>
  rowsIn(folder, 'data.db', `SELECT name, "unique" FROM pragma_index_list('${table}')`)
    .filter((index) => !String(index.name).startsWith('sqlite_autoindex'))
    .map((index) => {
      const columns = rowsIn(folder, 'data.db', `SELECT name FROM pragma_index_info('${index.name}') ORDER BY seqno`)
      return `${Number(index.unique) ? 'unique ' : ''}${columns.map((one) => one.name).join(' ')}`
    })
    .sort()

test('[16-4@9a] `_t_counts` and `_t_counting` exist in the data of an app with exactly their columns, their keys and their indexes', async (t) => {
  const { dataFolder } = await modeled(t)
  assert.deepEqual(columnsOf(dataFolder, '_t_counts'), [
    'id',
    'day key 1',
    'name key 2',
    'answeredBy key 3',
    'caller key 4',
    'user',
    'unit key 5',
    'amount',
    'createdAt',
    'updatedAt',
  ])
  assert.deepEqual(indexesOf(dataFolder, '_t_counts'), ['caller day', 'unique id', 'user day'])
  assert.deepEqual(columnsOf(dataFolder, '_t_counting'), ['key key 1', 'value'])
})
