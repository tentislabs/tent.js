// A program that is killed right after two writes with `toDisk` were answered, and started again: the start after
// the kill says what the data holds, and ends by itself.
// Run: node toDisk.ts <data folder>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { here, hereTable, setHere, sqliteStore } from '../../index.ts'
import { killedAt } from '../../../../rig/kill.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const entries = { name: 'entries', columns: { k: { kind: 'number', whole: true } }, indexes: [], unique: [], search: [] }
// Whose turn it is: the start that writes and is killed, or the start after it, which reads.
const turn = join(folder, 'turn.txt')

const store = sqliteStore()
store.open(folder)
if (!store.layout().some((one) => one.name === 'entries'))
  store.write(() =>
    store.applyTableChanges([
      { do: 'addTable', table: 'entries', layout: entries },
      { do: 'addTable', table: hereTable.name, layout: hereTable },
    ]),
  )
const held = () => Number(store.sql('SELECT count(*) AS "n" FROM "entries"', [])[0].n)

if (existsSync(turn) && readFileSync(turn, 'utf8') === 'read') {
  console.log(`holds: ${held()} writes, the role is ${here(store).role}`)
  setHere(store, { role: 'writer' })
  writeFileSync(turn, 'write')
  store.close()
} else {
  const before = held()
  store.write((tx) => tx.add('entries', { k: before + 1 }, system), { toDisk: true })
  const open = store.begin({ toDisk: true })
  open.tx.add('entries', { k: before + 2 }, system)
  setHere(open.tx, { role: 'reader' }, { toDisk: true })
  open.commit()
  writeFileSync(turn, 'read')
  // Both writes were answered: the kill is to arrive now.
  killedAt('answered')
}
