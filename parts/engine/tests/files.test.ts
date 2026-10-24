import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Db, Type } from '../../core/index.ts'
import { anyone, link, project, table, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { describe } from '../../core/internal.ts'
import type { Change, FileName, SinkChange, Store, TableStep } from '../../data/index.ts'
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
import { setRow, directoryTable as directory } from '../files/directory.ts'
import { boundGiven } from '../files/handles.ts'
import { raisingOf } from '../files/raising.ts'
import type { Running } from './apps.ts'
import { bundled, engineOf, logRows, portOf, running, system, workFolder } from './apps.ts'

/** An app that keeps the orders of each team in a file of that team: with `more`, its next version. */
function appOf(more: Record<string, Type> = {}): Description {
  const open = anyone('a test reads and writes it')
  const { description, findings } = describe({
    definitions: [
      project('desk', {}),
      table('teams', { columns: { name: text() }, access: { read: open, add: open } }),
      table('orders', {
        columns: { team: link('teams', { onRemove: 'remove' }), title: text(), ...more },
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

test('[50-6] a file that a thread brought up while the changes of the app began to be kept is given a kept change that holds `fetch`, which the readers and the sink are handed once', async (t) => {
  const [v1, v2] = [appOf(), appOf({ note: text({ optional: true }) })]
  const layout = [...layoutOf(v1), historyTable, hereTable, changesTable, directory]
  const copied: Change[] = []
  const sunk: SinkChange[] = []
  // What the test opened is closed before its folder is removed: the runner ends a test in the order it was told.
  const closing: (() => unknown)[] = []
  t.after(async () => {
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
  const files = connected(plain, layout, {
    copy: (change) => void copied.push(change),
    sink: { start: (n) => n, wrote: (change) => void sunk.push(change) },
  })
  const write = <T>(work: (db: Db) => T): T =>
    files.write((w) => work(createDb(w, v1, system, 'write', {}, { system: true }))).value
  const teams = ['North', 'South'].map((name) => write((db) => at(db, 'teams').add({ name }).id))
  for (const team of teams) write((db) => at(db, 'orders').of(team).add({ title: 'a lamp' }))
  const [north, south]: FileName[] = teams.map((id) => ({ table: 'teams', id }))
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
    line: () => undefined,
    closed: () => false,
    open: () => undefined,
  })
  closing.push(() => raising.close())
  // The directory lists both files, as the engine lists a file when it is made.
  files.shared.write((tx) => {
    for (const file of [north, south]) setRow(tx, file, {})
  })
  const metaOf = (file: FileName, key: string): unknown =>
    Reflect.get(Object(files.of(file)?.read({ from: metaTable.name, one: 'get', id: key }, system).value), 'value')
  const columnsOf = (file: FileName): string[] =>
    Object.keys(
      Object(
        files
          .of(file)
          ?.layout()
          .find((one) => one.name === 'orders')?.columns,
      ),
    )

  // The file of North is handed to its thread while the changes are not kept, and they begin to be kept at once.
  const up = raising.bringUp(north)
  keepChanges(files)
  await up
  const [kept, ...others] = [...keptChanges(files.shared, 0)]
  assert.deepEqual(others, [])
  // The write of the thread holds no record: the change that is kept at its number has the readers fetch the file.
  assert.deepEqual([kept.file, kept.fetch, kept.record.length], [north, true, 0])
  assert.equal(kept.n, metaOf(north, 'n'))
  assert.equal(columnsOf(north).includes('note'), true)
  // No number is left out: the place of this machine is that change, and the next write takes the next number.
  assert.deepEqual(
    copied.map((one) => [one.n, one.fetch, one.file]),
    [[kept.n, true, north]],
  )
  // The sink was handed what the thread answered, once.
  await new Promise((done) => setTimeout(done, 20))
  assert.deepEqual(
    sunk.filter((one) => one.n >= kept.n).map((one) => [one.n, one.file, one.layout?.map((step) => step.do)]),
    [[kept.n, north, ['addColumn']]],
  )

  // A file that is handed over once the changes are kept answers a change with its record, which is kept as it is.
  await raising.bringUp(south)
  const [, second, ...more] = [...keptChanges(files.shared, 0)]
  assert.deepEqual(more, [])
  assert.deepEqual([second.n, second.file, second.fetch], [kept.n + 1, south, undefined])
  assert.ok(second.record.length > 0)
  assert.deepEqual(
    copied.map((one) => one.n),
    [kept.n, kept.n + 1],
  )
})

/** One file of a tenant as `tent data files` lists it, as far as these tests read it. */
interface Listed {
  id: string
  open: boolean
  behind: boolean
  layout: string
}

/** `tent data files`, asked of a running app with no network. */
async function listed(one: Running): Promise<Listed[]> {
  const { token } = JSON.parse(readFileSync(join(one.dataFolder, 'engine.json'), 'utf8'))
  const request = new Request(`${one.origin}/_t/admin/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ args: { what: 'files' } }),
  })
  const body = Object(await (await one.app.request(request)).json())
  assert.equal(body.ok, true, JSON.stringify(body))
  return body.value.files
}

const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))
const as = { as: system }

/** Adds a team with one order, and answers the id of the team. */
async function teamOf(one: Running, name: string): Promise<string> {
  const team = idOf(await one.app.call('addTeam', { name }, as))
  await one.app.call('addOrder', { team, title: `the order of ${name}` }, as)
  return team
}

/** The titles of the orders of a team, as the app answers them. */
async function titlesOf(one: Running, team: string): Promise<string[]> {
  const rows: Record<string, unknown>[] = Object(await one.app.call('listOrders', { team }, as))
  return rows.map((row) => String(row.title))
}

/**
 * Answers what makes the stores of the apps of one program, on a system that gives the data files of tenants
 * so many file handles at the most, three for each open file: past that it refuses the opening of one more. Each
 * store is the one that ships. Also answers how many files stood open at the most.
 */
function boundedStores(files: number): { store: () => Store; most(): number } {
  let open = 0
  let most = 0
  return {
    most: () => most,
    store() {
      const store = sqliteStore()
      const [opens, closes] = [store.open.bind(store), store.close.bind(store)]
      let counted = false
      store.open = (where, how) => {
        const tenants = where.endsWith('.db')
        if (tenants && open >= files)
          throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE', errno: -24 })
        opens(where, how)
        counted = tenants
        if (counted) most = Math.max(most, ++open)
      }
      store.close = () => {
        closes()
        if (counted) open--
        counted = false
      }
      return store
    },
  }
}

const openOf = async (one: Running): Promise<string[]> =>
  (await listed(one))
    .filter((file) => file.open)
    .map((file) => file.id)
    .sort()

test('[50-6] where the system refuses a file handle, the file that was used longest ago is closed and the opening is tried again, among all the apps of the program', async (t) => {
  // The project lets 50 files stand open, and the system gives handles for three.
  const system3 = boundedStores(3)
  const engine = { makers: { store: system3.store } }
  const first = await running(t, { teams: true, engine })
  const teams: string[] = []
  for (let i = 0; i < 6; i++) {
    teams.push(await teamOf(first, `team ${i}`))
    // The three files that were used last stand open: the opening of each further one closed the oldest.
    assert.deepEqual(await openOf(first), teams.slice(-3).sort(), `after the write of team ${i}`)
  }
  assert.equal(system3.most(), 3)
  // Every write is there, and a file that was closed for another is read again.
  for (const [i, team] of teams.entries()) assert.deepEqual(await titlesOf(first, team), [`the order of team ${i}`])
  assert.equal(system3.most(), 3)
  const said = logRows(first.dataFolder, 'lines').filter((row) => String(row.message).includes('refused a file handle'))
  assert.equal(said.length, 1)

  // The bound is the program's: a second app of the program that opens a file closes the oldest file of the first.
  const second = await running(t, { teams: true, engine })
  assert.deepEqual(await openOf(first), teams.slice(-3).sort())
  const other = await teamOf(second, 'another app')
  assert.deepEqual(await openOf(first), teams.slice(-2).sort())
  assert.deepEqual(await titlesOf(second, other), ['the order of another app'])
  assert.equal(system3.most(), 3)
})

test('[50-6] an app whose store a maker of the program made brings its files up with no thread, and holds them as any app does', async (t) => {
  const work = workFolder(t)
  const engine = { makers: { store: () => sqliteStore() } }
  const first = await running(t, { teams: true, engine })
  const teams = [await teamOf(first, 'North'), await teamOf(first, 'South'), await teamOf(first, 'East')]
  const before = await listed(first)
  await first.engine.close()
  // The next version gives `orders` a column more: every file is behind, and is brought up where the app runs.
  const next = await bundled(
    t,
    {
      teams: true,
      change(description) {
        const { columns } = Object(description.tables.orders)
        columns.note = { ...columns.code }
      },
    },
    work,
  )
  const later = engineOf(t, engine)
  const app = await later.open(next.folder, { dataFolder: first.dataFolder, mode: 'test' })
  const again: Running = {
    ...first,
    engine: later,
    app,
    bundle: next,
    origin: `http://localhost:${portOf(first.dataFolder)}`,
  }
  for (let i = 0; i < 400 && (await listed(again)).some((file) => file.behind); i++)
    await new Promise((done) => setTimeout(done, 5))
  const after = await listed(again)
  assert.deepEqual(
    after.map((file) => file.behind),
    [false, false, false],
  )
  assert.notEqual(after[0].layout, before[0].layout)
  for (const [i, team] of teams.entries())
    assert.deepEqual(await titlesOf(again, team), [`the order of ${['North', 'South', 'East'][i]}`])
  await later.close()
  const file = new DatabaseSync(join(first.dataFolder, 'tenants', 'teams', teams[0].slice(-2), `${teams[0]}.db`))
  const columns = file.prepare("SELECT name FROM pragma_table_info('orders')").all()
  file.close()
  assert.equal(
    columns.some((row) => row.name === 'note'),
    true,
  )
})

test('[50-6] an app that opens holds three file handles for each of openFiles against the bound of its program, whatever that bound is, and says in its log where they pass it', async (t) => {
  t.after(() => boundGiven('ask'))
  const limited =
    (openFiles: number) =>
    (description: Description): void =>
      void Object.assign(description.project, { limits: { openFiles } })
  /** What the log of an app that was opened with that limit says of the bound. */
  const said = async (openFiles: number): Promise<Record<string, unknown>[]> => {
    const { dataFolder } = await running(t, { teams: true, change: limited(openFiles) })
    return logRows(dataFolder, 'lines')
      .filter((row) => String(row.message).includes('more than the system gives this program'))
      .map((row) => Object(JSON.parse(String(row.data))))
  }
  // The bound is the program's, and it is read once: the test hands the engine a bound, as a system gives one.
  boundGiven(30)
  const over = await said(11)
  assert.equal(over.length, 1)
  assert.deepEqual([over[0].openFiles, over[0].handles], [11, 30])
  // Three handles for each of ten files are what the system gives: nothing is said.
  assert.deepEqual(await said(10), [])
  // A system that states no bound holds the app to none.
  boundGiven(undefined)
  assert.deepEqual(await said(1_000_000_000), [])
})
