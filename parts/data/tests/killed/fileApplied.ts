// A program that is killed after a second set of files kept a change of a tenant's file and before it made the
// write of that file, and started again: the second start applies each kept change that lies above the number of
// its file, from its record, and holds every file against the first set.
// Run: node fileApplied.ts <folder>
import { join } from 'node:path'
import { applyChange, changesTable, connected, hereTable, keptChanges, openFiles, sqliteStore } from '../../index.ts'
import { killedAt } from '../../../../rig/kill.ts'

const folder = process.argv[2]
const system = { kind: 'system' }
const teams = { name: 'teams', columns: { name: { kind: 'text' } }, indexes: [], unique: [], search: [] }
const team = { kind: 'link', table: 'teams', onRemove: 'remove' }
const orders = { name: 'orders', columns: { team, total: { kind: 'number' } }, indexes: [], unique: [], search: [], tenant: 'team' }
const tasks = { name: 'tasks', columns: { team, title: { kind: 'text' } }, indexes: [], unique: [], search: [], tenant: 'team' }
const layout = [teams, orders, tasks, hereTable, changesTable]

/** Opens one set of files on its folder, with the tables of the shared file. */
function set(name) {
  const files = openFiles(join(folder, name), layout, { store: sqliteStore })
  if (!files.shared.layout().some((one) => one.name === 'teams'))
    files.write(
      (w) => {
        w.tx()
        files.shared.applyTableChanges(
          [teams, hereTable, changesTable].map((one) => ({ do: 'addTable', table: one.name, layout: one })),
        )
      },
      { steps: true },
    )
  return files
}

const read = (store, plan) => store.read(plan, system).value
const changes = []
const second = set('second')
const first = connected(set('first'), layout, { keep: true, copy: (change) => changes.push(change) })

if (!read(second.shared, { from: changesTable.name, count: true })) {
  // The first start: the second set applies every change but the last, which it keeps and does not apply.
  const id = first.write((w) => w.tx().add('teams', { name: 'North' }, system).id).value
  const file = { table: 'teams', id }
  first.write((w) => w.tx(file).add('orders', { team: id, total: 1 }, system))
  first.write((w) => {
    w.tx(file).add('orders', { team: id, total: 2 }, system)
    w.tx(file).add('tasks', { team: id, title: 'made with its first row' }, system)
  })
  for (const change of changes.slice(0, -1)) applyChange(second, change)
  applyChange(second, changes.at(-1), { only: 'kept' })
  killedAt('kept')
  console.log('broken: the program was not killed')
  process.exit(3)
}

// The second start: a kept change above the number of its file is applied from its record.
let applied = 0
for (const change of keptChanges(second.shared, 0)) {
  if (!change.file) continue
  const store = second.of(change.file, { make: true })
  const held = read(store, { from: '_t_meta', one: 'get', id: 'n' })?.value ?? 0
  if (change.n <= held) continue
  applyChange(store, change, { only: 'file' })
  applied++
}

/** What a set holds of each file: its rows, the number of its last write and its running fingerprint. */
function held(files) {
  return [...files.walk()].map((file) => {
    const store = files.of(file)
    const rows = (table) => (store.layout().some((one) => one.name === table) ? read(store, { from: table }) : 'no table')
    return {
      file,
      orders: rows('orders'),
      tasks: rows('tasks'),
      n: read(store, { from: '_t_meta', one: 'get', id: 'n' })?.value,
      here: read(store, { from: '_t_here' }),
    }
  })
}
const [mine, theirs] = [JSON.stringify(held(first)), JSON.stringify(held(second))]
for (const files of [first, second]) {
  for (const one of files.open()) files.close(one)
  files.shared.close()
}
if (applied !== 1 || mine !== theirs || !mine.includes('made with its first row')) {
  console.log(`broken: ${applied} kept changes were applied, and the files differ: ${mine} and ${theirs}`)
  process.exit(3)
}
console.log(`whole: ${applied} kept changes were applied to their files, and each file is as the first holds it`)
