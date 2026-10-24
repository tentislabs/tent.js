// A program that is killed at a moment of the harness's choosing while a reader applies the changes of a writer,
// and started again: each start first holds the reader against "all of a write, its kept change with it, or none".
// Run: node applying.ts <folder>
import { join } from 'node:path'
import { applyChange, changesTable, connected, here, hereTable, keptChanges, sqliteStore } from '../../index.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const rows = 2000
const entries = { name: 'entries', columns: { batch: { kind: 'number', whole: true }, note: { kind: 'text' } }, indexes: [], unique: [], search: [] }
const own = [hereTable, changesTable]

/** Opens a machine on its folder, with the tables that are its own. */
function machine(name) {
  const store = sqliteStore()
  store.open(join(folder, name))
  if (!store.layout().some((one) => one.name === hereTable.name))
    store.write(() => store.applyTableChanges(own.map((layout) => ({ do: 'addTable', table: layout.name, layout }))))
  return store
}

const reader = machine('reader')
const writer = connected(machine('writer'), [entries, ...own], { keep: true })
if (!writer.layout().some((one) => one.name === 'entries'))
  writer.write(() => writer.applyTableChanges([{ do: 'addTable', table: 'entries', layout: entries }]), { steps: true })

// What the reader holds: the number of its last write, its rows, its kept changes, and its running fingerprint.
const number = (store) => store.read({ from: '_t_meta', one: 'get', id: 'n' }, system).value?.value ?? 0
const n = number(reader)
const kept = reader.read({ from: changesTable.name }, system).value
const held = reader.layout().some((one) => one.name === 'entries') ? reader.read({ from: 'entries', count: true }, system).value : 0
// The first write made the table, and each write after it added the rows of one batch.
const whole =
  held === Math.max(0, n - 1) * rows &&
  kept.length === n &&
  kept.every((one, i) => one.n === i + 1) &&
  (n === 0 || kept[n - 1].sum === here(reader).sum)
if (!whole) {
  console.log(`broken: the reader holds the number ${n}, ${held} rows and ${kept.length} kept changes`)
  process.exit(3)
}
console.log(`whole: the reader holds ${n} writes, each with its kept change`)

// The reader catches up from what the writer kept, and then follows six more writes.
for (const change of keptChanges(writer, n)) applyChange(reader, change)
for (let round = 0; round < 6; round++) {
  const batch = number(writer)
  writer.write((tx) => {
    for (let k = 0; k < rows; k++) tx.add('entries', { batch, note: `entry ${k} of batch ${batch}` }, system)
  })
  for (const change of keptChanges(writer, number(reader))) applyChange(reader, change)
  // The harness reads what is printed between two writes, so the kill falls inside a write or an apply.
  await new Promise((resolve) => setImmediate(resolve))
}
reader.close()
writer.close()
console.log('done')
