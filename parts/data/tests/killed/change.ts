// A program that is killed in the middle of a change and started again: each start first holds the file against
// "all of the change or none", and then makes the change once more.
// Run: node change.ts <data folder>
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { killedAt } from '../../../../rig/kill.ts'
import { sqliteStore } from '../../index.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const size = 10000
const table = (name, columns) => ({ name, columns, indexes: [], unique: [], search: [] })
const whole = { kind: 'number', whole: true }

const store = sqliteStore()
store.open(folder)

if (!store.layout().some((one) => one.name === 'totals')) {
  // The tables and the first row are one write too: a kill inside it leaves no table.
  store.write((tx) => {
    store.applyTableChanges([
      { do: 'addTable', table: 'entries', layout: table('entries', { batch: whole, k: whole, note: { kind: 'text' } }) },
      { do: 'addTable', table: 'totals', layout: table('totals', { batch: whole, rows: whole }) },
    ])
    tx.add('totals', { batch: 0, rows: 0 }, system)
  })
}

// One change removes every entry of the batch before it with a raw text, adds the entries of its own batch one by
// one, and writes the number of its batch and of its rows into the one row of `totals`.
const [totals] = store.read({ from: 'totals' }, system).value
const [held] = store.sql('SELECT count(*) AS n, min(batch) AS low, max(batch) AS high FROM entries', [])
const fits =
  totals.batch === 0
    ? held.n === 0 && totals.rows === 0
    : held.n === size && totals.rows === size && held.low === totals.batch && held.high === totals.batch
if (!fits) {
  console.log(`broken: totals ${JSON.stringify(totals)}, entries ${JSON.stringify(held)}`)
  process.exit(3)
}
// What the start before this one began, and whether its change is there: all of it, or none.
const begun = join(folder, 'begun.txt')
const last = existsSync(begun) ? Number(readFileSync(begun, 'utf8').trim().split('\n').at(-1)) : 0
console.log(`whole at batch ${totals.batch}: ${last > totals.batch ? 'none' : 'all'} of the change before`)

const batch = totals.batch + 1
appendFileSync(begun, `${batch}\n`)
store.write((tx) => {
  tx.sql('DELETE FROM entries', [], ['entries'])
  for (let k = 0; k < size; k++) {
    tx.add('entries', { batch, k, note: `entry ${k} of batch ${batch}` }, system)
    // The start that is killed stands still here, a quarter of the rows added: the kill arrives within the change.
    if (k === size / 4) killedAt('mid')
  }
  tx.change('totals', totals.id, { batch, rows: size }, system)
})
store.close()
console.log(`done batch ${batch}`)
