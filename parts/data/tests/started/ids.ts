// A program that opens a data folder with its clock set, adds one row to each table it is named, prints their ids
// and ends. Started twice by a test it is a restart: each start has a maker of ids that knows nothing of the last.
// Run: node ids.ts <data folder> <the clock in milliseconds> <a table> ...
import { sqliteStore } from '../../index.ts'

const [folder, clock, ...tables] = process.argv.slice(2)
// The clock stands where the test set it, before anything reads it.
Date.now = () => Number(clock)
const system = { kind: 'system' } as const
const tableOf = (name: string) => ({
  name,
  columns: { total: { kind: 'number' } },
  indexes: [],
  unique: [],
  search: [],
})

const store = sqliteStore()
store.open(folder)
if (!store.layout().some((one) => one.name === 'orders'))
  store.write(() =>
    store.applyTableChanges(
      ['orders', 'lines'].map((name) => ({ do: 'addTable', table: name, layout: tableOf(name) })),
    ),
  )
const ids = store.write((tx) => tables.map((table, total) => tx.add(table, { total }, system).id)).value
store.close()
console.log(JSON.stringify(ids.map(String)))
