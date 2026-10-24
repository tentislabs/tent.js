import assert from 'node:assert/strict'
import test from 'node:test'
import type { Db } from '../../core/index.ts'
import { anyone, link, project, table, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { Change, FileName, TableStep } from '../../data/index.ts'
import {
  applySteps,
  changesTable,
  connected,
  createDb,
  here,
  hereTable,
  historyTable,
  keepChanges,
  keptChanges,
  layoutOf,
  metaTable,
  openFiles,
  sqliteStore,
} from '../../data/index.ts'
import type { Failed } from '../files/directory.ts'
import { directoryRowIn, setRow, directoryTable as directory } from '../files/directory.ts'
import { raisingOf } from '../files/raising.ts'
import { failAfterNumber } from '../files/threads.ts'
import { system, workFolder } from './apps.ts'

/** An app that keeps the orders of each team in a file of that team: with `note`, its next version. */
function appOf(note: boolean): Description {
  const open = anyone('a test reads and writes it')
  const { description, findings } = describe({
    definitions: [
      project('desk', {}),
      table('teams', { columns: { name: text() }, access: { read: open, add: open } }),
      table('orders', {
        columns: {
          team: link('teams', { onRemove: 'remove' }),
          title: text(),
          ...(note ? { note: text({ optional: true }) } : {}),
        },
        tenant: 'team',
        access: { read: open, add: open },
      }),
    ].map((value) => ({ value })),
  })
  assert.deepEqual(findings, [])
  return description
}

/** The members of a table of a `db` that this test calls: the types of the tables of a project are made by the build. */
interface DbTable {
  of(tenant: string): DbTable
  add(values: object): { id: string }
}
const at = (db: Db, name: string): DbTable => Reflect.get(db, name)

test('[50-6] a write of a file thread that took its number and then failed leaves its file as it was, and a kept change at that number that holds `fetch`, so that no number is left out and a reader fetches the file', async (t) => {
  const [v1, v2] = [appOf(false), appOf(true)]
  const layout = [...layoutOf(v1), historyTable, hereTable, changesTable, directory]
  const copied: Change[] = []
  const failed: Failed[] = []
  // What the test opened is closed before its folder is removed: the runner ends a test in the order it was told.
  const closing: (() => unknown)[] = []
  t.after(async () => {
    failAfterNumber(0)
    for (const close of closing.reverse()) await close()
  })
  const plain = openFiles(workFolder(t), layout, { store: sqliteStore })
  closing.push(() => {
    for (const file of plain.open()) plain.close(file)
    plain.shared.close()
  })
  const made: TableStep[] = layout
    .filter((one) => one.tenant === undefined)
    .map((one) => ({ do: 'addTable', table: one.name, layout: one }))
  plain.shared.write((tx) => applySteps(tx, plain.shared, made), { steps: true })
  const files = connected(plain, layout, { copy: (change) => void copied.push(change) })
  // The changes of the app are kept from its first write on.
  keepChanges(files)
  const write = <T>(work: (db: Db) => T): T =>
    files.write((w) => work(createDb(w, v1, system, 'write', {}, { system: true }))).value
  const team = write((db) => at(db, 'teams').add({ name: 'North' }).id)
  write((db) => at(db, 'orders').of(team).add({ title: 'a lamp' }))
  const north: FileName = { table: 'teams', id: team }
  const raising = raisingOf({
    files,
    make: sqliteStore,
    threads: true,
    atOnce: 1,
    now: () => Date.now(),
    layout: () => layoutOf(v2),
    isBehind: () => true,
    isOpen: (file) => files.open().some((one) => one.id === file.id),
    peek: () => undefined,
    sharedWrite: (work) => void files.shared.write((tx) => work(tx)),
    keeping: () => here(files.shared).kept === true,
    epoch: () => `1.${here(files.shared).id}`,
    line: (_level, _message, data) => void failed.push({ message: String(Reflect.get(data, 'message')) }),
    closed: () => false,
    open: () => undefined,
  })
  closing.push(() => raising.close())
  files.shared.write((tx) => setRow(tx, north, {}))
  const metaOf = (key: string): unknown =>
    Reflect.get(Object(files.of(north)?.read({ from: metaTable.name, one: 'get', id: key }, system).value), 'value')
  const columns = (): string[] =>
    Object.keys(
      Object(
        files
          .of(north)
          ?.layout()
          .find((one) => one.name === 'orders')?.columns,
      ),
    )
  const numbers = (): number[] => [...keptChanges(files.shared, 0)].map((change) => change.n)

  // The number of the app is that of its newest kept change: asking the files for a number would take one.
  const before = { n: numbers().at(-1) ?? 0, held: metaOf('n'), sent: copied.length }
  files.close(north)
  // The thread is handed the number of its write, and its write then fails, as on a disk that fills at that moment.
  failAfterNumber(1)
  await assert.rejects(raising.bringUp(north), /took its number/)
  // The file is as it was: the write of the thread was undone.
  assert.equal(columns().includes('note'), false)
  assert.equal(metaOf('n'), before.held)
  // The number was taken: a change is kept at it that holds no record, and has the readers fetch the file.
  const kept = [...keptChanges(files.shared, 0)].at(-1)
  assert.ok(kept)
  assert.deepEqual(
    [kept.n, kept.file, kept.fetch, kept.record.length, kept.layout],
    [before.n + 1, north, true, 0, undefined],
  )
  assert.deepEqual(
    copied.slice(before.sent).map((change) => [change.n, change.fetch]),
    [[before.n + 1, true]],
  )
  // The row of the file says that it could not be brought up, and why.
  assert.match(String(directoryRowIn(files.shared, north)?.failed?.message), /took its number/)
  assert.equal(failed.length, 1)
  // The next write of the thread takes the next number: no number is left out among the kept changes.
  files.close(north)
  await raising.bringUp(north)
  assert.equal(columns().includes('note'), true)
  assert.equal(metaOf('n'), before.n + 2)
  const all = numbers()
  assert.deepEqual(
    all,
    all.map((_, i) => all[0] + i),
  )
  assert.equal(all.at(-1), before.n + 2)
  assert.equal(directoryRowIn(files.shared, north)?.failed, undefined)
})
