// A program that is killed between the commit of a tenant's file and the kept change of that write, and started
// again: the second start opens the file, and holds that it was given a kept change with `fetch`.
// Run: node fileKept.ts <folder>
import { changesTable, connected, hereTable, openFiles, sqliteStore } from '../../index.ts'
import { killedAt } from '../../../../rig/kill.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const teams = { name: 'teams', columns: { name: { kind: 'text' } }, indexes: [], unique: [], search: [] }
const orders = {
  name: 'orders',
  columns: { team: { kind: 'link', table: 'teams', onRemove: 'remove' }, note: { kind: 'text' } },
  indexes: [],
  unique: [],
  search: ['note'],
  tenant: 'team',
}
const layout = [teams, orders, hereTable, changesTable]

// A search of the program's own is told each row once its write is committed, and before the kept change of that
// write is written: there the program says so, and waits for its end.
const searcher = {
  has: () => true,
  wrote(_table, _id, texts) {
    if (texts?.note !== 'the last') return
    killedAt('committed')
  },
  find: () => [],
}

const handed = []
const plain = openFiles(folder, layout, { store: sqliteStore })
if (!plain.shared.layout().some((one) => one.name === 'teams'))
  plain.write(
    (w) => {
      w.tx()
      plain.shared.applyTableChanges(
        [teams, hereTable, changesTable].map((one) => ({ do: 'addTable', table: one.name, layout: one })),
      )
    },
    { steps: true },
  )
const files = connected(plain, layout, { keep: true, searcher, copy: (change) => handed.push(change) })
const read = (store, plan) => store.read(plan, system).value
const [team] = read(files.shared, { from: 'teams' })

if (!team) {
  // The first start: a tenant, a write of its file that is kept, and one that is cut off after its commit.
  const id = files.write((w) => w.tx().add('teams', { name: 'North' }, system).id).value
  const file = { table: 'teams', id }
  files.write((w) => w.tx(file).add('orders', { team: id, note: 'the first' }, system))
  files.write((w) => w.tx(file).add('orders', { team: id, note: 'the last' }, system))
  console.log('broken: the program was not killed')
  process.exit(3)
}

// The second start: the file holds a write that no kept change names, until the file is opened.
const file = { table: 'teams', id: team.id }
const kept = () => read(files.shared, { from: changesTable.name, sort: [{ by: 'n' }] })
const before = kept().map((row) => row.n)
const store = files.of(file)
const n = read(store, { from: '_t_meta', one: 'get', id: 'n' }).value
const [sum] = read(store, { from: '_t_here' }).filter((row) => row.key === 'sum')
const after = kept()
const last = after.at(-1)
const whole =
  read(store, { from: 'orders', count: true }) === 2 &&
  !before.includes(n) &&
  after.length === before.length + 1 &&
  last.n === n &&
  last.sum === sum.value &&
  last.record.length === 0 &&
  last.change.fetch === true &&
  last.change.file.id === team.id &&
  last.change.file.table === 'teams' &&
  handed.length === 1 &&
  handed[0].n === n &&
  handed[0].fetch === true
for (const one of files.open()) files.close(one)
files.shared.close()
if (!whole) {
  console.log(`broken: the file holds the write ${n}, and the kept changes hold ${JSON.stringify(after.map((row) => [row.n, row.change.fetch]))}`)
  process.exit(3)
}
console.log(`whole: the file holds the write ${n}, and its kept change holds fetch and no record`)
