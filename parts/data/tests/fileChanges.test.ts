import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { Change, Files, Store, TableStep } from '../index.ts'
import {
  applyChange,
  applySteps,
  bringUp,
  checkAndHold,
  connected,
  dropHolds,
  factsOf,
  findMisfits,
  here,
  layoutOf,
  planTableChanges,
  setCheck,
  setRunningVersion,
  sqliteStore,
} from '../index.ts'
import {
  tenantSteps,
  appOf,
  filesOf,
  heldIn,
  metaOf,
  readingFiles,
  sameFiles,
  seedDesk,
  storedIn,
  sumOf,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at, seal } from './shop.ts'
import { codeOf } from './work.ts'

const v1 = appOf()
const v2 = appOf({ ref: true })
const v3 = appOf({ ref: true, renamed: true })
const v4 = appOf({ ref: true, renamed: true, dropped: true })
// The version that is checked against the rows: `note` must hold a value, and no two orders share a `code`.
const checked = appOf({ noteRequired: true, codeUnique: true })

/** The columns that a store holds of a table and still uses, in the order of their names. */
const columnsOf = (store: Store | undefined, table: string): string[] => {
  const layout = store?.layout().find((one) => one.name === table)
  return Object.keys(layout?.columns ?? {})
    .filter((name) => !layout?.unused?.includes(name))
    .sort()
}

/** The holds that a file keeps, as `<version> <step> <table> <column>`. */
const holdsOf = (store: Store | undefined): string[] =>
  (Array.isArray(store && metaOf(store, 'holds')) ? Object(store && metaOf(store, 'holds')) : []).map(
    (hold: { version: string; step: TableStep }) =>
      `${hold.version} ${hold.step.do} ${hold.step.table} ${hold.step.column ?? hold.step.columns?.join()}`,
  )

test('[50-5] a new optional column reaches a file when it is brought up, a table that the file did not hold is made in the new layout, and a file three layouts behind is brought up from where it stands', (t) => {
  const files = filesOf(t, v1)
  const s = seedDesk(files, v1)
  const old = writingFiles(files, v1)
  const [north, south, east] = [teamFile(s.north), teamFile(s.south), teamFile(s.east)]
  const first = old((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'kept', code: 'A' }))
  old((db) => at(db, 'orders').of(s.south).add({ total: 20, note: 'far', code: 'B' }))
  old((db) => at(db, 'orders').of(s.east).add({ total: 30, note: 'east', code: 'C' }))
  old((db) => at(db, 'notes').of(s.south).add({ author: s.ada, text: 'a note' }))
  const stoodAt = metaOf(Object(files.of(north)), 'fingerprint')
  assert.equal(metaOf(Object(files.of(south)), 'fingerprint'), stoodAt)
  assert.equal(columnsOf(files.of(north), 'orders').includes('ref'), false)

  // The switch: the running layout is told, and each file is brought up in one write of its own.
  files.layout(layoutOf(v2))
  assert.equal(bringUp(Object(files.of(north)), layoutOf(v2)), undefined)
  assert.equal(columnsOf(files.of(north), 'orders').includes('ref'), true)
  assert.notEqual(metaOf(Object(files.of(north)), 'fingerprint'), stoodAt)
  // A file that is not brought up yet stands where it stood.
  assert.equal(metaOf(Object(files.of(south)), 'fingerprint'), stoodAt)
  assert.equal(columnsOf(files.of(south), 'orders').includes('ref'), false)
  const now = writingFiles(files, v2)
  const db = readingFiles(files, v2)
  assert.equal(at(db, 'orders').of(s.north).get(String(first.id))?.note, 'kept')
  assert.equal(now((db) => at(db, 'orders').of(s.north).change(String(first.id), { ref: 'R-1' })).ref, 'R-1')
  // A table that the file did not hold yet is made in the new layout with its first row, and needs no change.
  assert.equal(now((db) => at(db, 'tasks').of(s.north).add({ title: 'one', ref: 'R-2' })).ref, 'R-2')
  assert.deepEqual(columnsOf(files.of(north), 'tasks'), ['ref', 'team', 'title'])
  bringUp(Object(files.of(east)), layoutOf(v2))
  // A second bringing up changes nothing of the tables.
  const held = heldIn(files.of(north))
  bringUp(Object(files.of(north)), layoutOf(v2))
  assert.deepEqual({ ...heldIn(files.of(north)), _t_meta: 0 }, { ...held, _t_meta: 0 })

  // The file of South is three layouts behind: a new column, a column under a new name, and a removed column.
  files.layout(layoutOf(v4))
  bringUp(Object(files.of(south)), layoutOf(v4))
  assert.deepEqual(columnsOf(files.of(south), 'orders'), [
    'meaning',
    'placedBy',
    'ref',
    'remark',
    'status',
    'team',
    'total',
  ])
  const newest = readingFiles(files, v4)
  const [row] = at(newest, 'orders').of(s.south).all()
  assert.deepEqual([row.total, row.remark, row.code, row.ref], [20, 'far', undefined, undefined])
  assert.deepEqual(at(newest, 'orders').of(s.south).search('far').all().length, 1)
  assert.equal(at(newest, 'notes').of(s.south).count(), 1)
  // And the file of North, which is brought up at each switch, ends at the same layout.
  bringUp(Object(files.of(north)), layoutOf(v3))
  bringUp(Object(files.of(north)), layoutOf(v4))
  assert.equal(metaOf(Object(files.of(north)), 'fingerprint'), metaOf(Object(files.of(south)), 'fingerprint'))
  assert.deepEqual(columnsOf(files.of(north), 'orders'), columnsOf(files.of(south), 'orders'))
  // Going back retires what the older layout does not know, with no statement, so nothing is dropped.
  const ordersOf = (file: typeof east) =>
    files
      .of(file)
      ?.layout()
      .find((one) => one.name === 'orders')
  assert.equal(ordersOf(east)?.unused, undefined)
  bringUp(Object(files.of(east)), layoutOf(v1), { back: true })
  assert.deepEqual(ordersOf(east)?.unused, ['ref'])
  assert.equal(Object.hasOwn(Object(ordersOf(east)?.columns), 'ref'), true)
  assert.deepEqual(
    storedIn(files.of(east), 'orders').map((one) => [one.note, one.code]),
    [['east', 'C']],
  )
  // With `clean` the file also drops what it holds retired.
  bringUp(Object(files.of(east)), layoutOf(v1), { back: true, clean: true })
  assert.equal(Object.hasOwn(Object(ordersOf(east)?.columns), 'ref'), false)
  assert.deepEqual(
    storedIn(files.of(east), 'orders').map((one) => [one.note, one.code]),
    [['east', 'C']],
  )
})

test('[50-5] [16-2@3] checkAndHold names the misfits of a file, and with none leaves a hold, after which a write that would break it is refused, by the old version too', (t) => {
  const files = filesOf(t, v1)
  const s = seedDesk(files, v1)
  const old = writingFiles(files, v1)
  const [north, south, east, west] = [s.north, s.south, s.east, s.west].map(teamFile)
  const bare = old((db) => at(db, 'orders').of(s.north).add({ total: 10, code: 'A' }))
  old((db) => at(db, 'orders').of(s.north).add({ total: 11, code: 'A' }))
  old((db) => at(db, 'orders').of(s.north).add({ total: 12, note: 'fits' }))
  const fits = old((db) => at(db, 'orders').of(s.south).add({ total: 20, note: 'fits', code: 'A' }))
  old((db) => at(db, 'tasks').of(s.west).add({ title: 'holds no order' }))
  const steps = tenantSteps(v1, checked)
  assert.deepEqual(
    steps.map((step) => `${step.do} ${step.table} ${step.column ?? step.columns?.join()}`),
    ['require orders note', 'addUnique orders code'],
  )

  // First the shared file names the check that stands, with its steps and its version.
  files.write((w) => setRunningVersion(w.tx(), 'v1'))
  files.write((w) => setCheck(w.tx(), { version: 'v2', steps }))
  // The two keys that the engine writes are written by the functions of the entry, under the names they have.
  assert.equal(metaOf(files.shared, 'version'), 'v1')
  assert.deepEqual(metaOf(files.shared, 'check'), { version: 'v2', steps })

  // One file that does not fit: its misfits are named with their count, and nothing is held.
  const refused = checkAndHold(Object(files.of(north)), steps, 'v2')
  assert.deepEqual(refused.misfits, [
    { table: 'orders', column: 'note', rows: 2 },
    { table: 'orders', column: 'code', rows: 1 },
  ])
  assert.equal(refused.change, undefined)
  assert.deepEqual(holdsOf(files.of(north)), [])
  assert.equal(old((db) => at(db, 'orders').of(s.north).add({ total: 13, code: 'A' })).code, 'A')

  // A file that fits is held: a hold for each checked step, and for `addUnique` its index at once.
  const passed = checkAndHold(Object(files.of(south)), steps, 'v2')
  assert.deepEqual(passed.misfits, [])
  assert.deepEqual(holdsOf(files.of(south)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.deepEqual(
    files
      .of(south)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [['code']],
  )
  // A file that holds none of the checked tables is written nothing.
  assert.deepEqual(checkAndHold(Object(files.of(west)), steps, 'v2'), { misfits: [] })
  assert.deepEqual(holdsOf(files.of(west)), [])

  // While the hold counts, every write of that file is held to the step, by the old version too.
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.south).add({ total: 21 }))),
    'T2107',
  )
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.south).change(String(fits.id), { note: null }))),
    'T2107',
  )
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.south).add({ total: 21, note: 'x', code: 'A' }))),
    'T2101',
  )
  assert.equal(old((db) => at(db, 'orders').of(s.south).add({ total: 21, note: 'x', code: 'B' })).code, 'B')
  assert.equal(old((db) => at(db, 'orders').of(s.south).change(String(fits.id), { note: 'still' })).note, 'still')
  // The file that was not held takes such a write still.
  assert.equal(old((db) => at(db, 'orders').of(s.north).change(String(bare.id), { note: null })).note, undefined)

  // A file that is made while the shared file names the check takes the hold in the write that makes it.
  assert.equal(files.has(east), false)
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.east).add({ total: 30 }))),
    'T2107',
  )
  old((db) => at(db, 'orders').of(s.east).add({ total: 30, note: 'first', code: 'A' }))
  assert.deepEqual(holdsOf(files.of(east)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.east).add({ total: 31, note: 'second', code: 'A' }))),
    'T2101',
  )
  // And so does a table that is made in a file that stood.
  old((db) => at(db, 'orders').of(s.west).add({ total: 40, note: 'first', code: 'A' }))
  assert.deepEqual(holdsOf(files.of(west)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.west).add({ total: 41, note: 'second', code: 'A' }))),
    'T2101',
  )
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.west).add({ total: 41, code: 'B' }))),
    'T2107',
  )

  // The check is refused and taken away: `dropHolds` takes the holds of a file away, its index with them.
  files.write((w) => setCheck(w.tx(), undefined))
  assert.equal(metaOf(files.shared, 'check'), undefined)
  assert.equal(dropHolds(Object(files.of(south)), 'v2'), undefined)
  assert.deepEqual(holdsOf(files.of(south)), [])
  assert.deepEqual(
    files
      .of(south)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [],
  )
  assert.equal(old((db) => at(db, 'orders').of(s.south).add({ total: 22, code: 'A' })).note, undefined)
  // A file that holds none drops none, and is written nothing.
  assert.equal(dropHolds(Object(files.of(north)), 'v2'), undefined)

  // A hold of a version that is neither the standing check nor the running one counts for nothing, and is
  // dropped when its file is opened, before anything else.
  assert.deepEqual(holdsOf(files.of(east)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.equal(old((db) => at(db, 'orders').of(s.east).add({ total: 32 })).note, undefined)
  files.close(east)
  assert.deepEqual(holdsOf(files.of(east)), [])
  assert.deepEqual(
    files
      .of(east)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [],
  )
  assert.equal(old((db) => at(db, 'orders').of(s.east).add({ total: 33, code: 'A' })).code, 'A')

  // A hold of the running version counts, and stays when its file is opened: the switch was taken, and the
  // file is not brought up yet.
  files.write((w) => setRunningVersion(w.tx(), 'v2'))
  files.close(west)
  assert.deepEqual(holdsOf(files.of(west)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.equal(
    codeOf(() => old((db) => at(db, 'orders').of(s.west).add({ total: 42, code: 'C' }))),
    'T2107',
  )
  // Bringing the file up takes its holds away: its layout holds it to the same from then on.
  files.layout(layoutOf(checked))
  bringUp(Object(files.of(west)), layoutOf(checked))
  assert.deepEqual(holdsOf(files.of(west)), [])
  const now = writingFiles(files, checked)
  assert.equal(
    codeOf(() => now((db) => at(db, 'orders').of(s.west).add({ total: 42, code: 'C' }))),
    'T2107',
  )
  assert.equal(
    codeOf(() => now((db) => at(db, 'orders').of(s.west).add({ total: 42, note: 'x', code: 'A' }))),
    'T2101',
  )

  // A file with a misfit that was made round its hold cannot be brought up: the error names the tenant and the count.
  let failed: unknown
  try {
    bringUp(Object(files.of(north)), layoutOf(checked))
  } catch (error) {
    failed = error
  }
  assert.equal(Object(failed).code, 'T2001')
  assert.match(String(Object(failed).message), new RegExp(s.north))
  assert.match(String(Object(failed).message), /3 rows/)
  assert.equal(columnsOf(files.of(north), 'orders').includes('note'), true)
  assert.deepEqual(
    files
      .of(north)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [],
  )
})

test('[50-5] findMisfits and factsOf visit every file that holds a table they ask of, and name the file of each misfit', async (t) => {
  const files = filesOf(t, v1)
  const s = seedDesk(files, v1)
  const old = writingFiles(files, v1)
  old((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  old((db) => at(db, 'orders').of(s.north).add({ total: 11 }))
  old((db) => at(db, 'orders').of(s.south).add({ total: 20, note: 'fits' }))
  old((db) => at(db, 'orders').of(s.east).add({ total: 30 }))
  old((db) => at(db, 'tasks').of(s.west).add({ title: 'holds no order' }))
  for (const file of files.open()) files.close(file)
  const steps = tenantSteps(v1, appOf({ noteRequired: true }))
  const found = await findMisfits(files, steps)
  assert.deepEqual(
    found.sort((a, b) => (String(a.file?.id) < String(b.file?.id) ? -1 : 1)),
    [
      { table: 'orders', column: 'note', rows: 2, file: teamFile(s.north) },
      { table: 'orders', column: 'note', rows: 1, file: teamFile(s.east) },
    ].sort((a, b) => (a.file.id < b.file.id ? -1 : 1)),
  )
  // The files were read alone: none of them is left open, and none is written.
  assert.deepEqual(files.open(), [])
  const facts = await factsOf(files, appOf({ noteRequired: true }))
  assert.deepEqual(
    facts.tableFindings.map((one) => one.code),
    ['T2001', 'T2001'],
  )
  // A finding names the tenant and the count.
  const words = facts.tableFindings.map((one) => one.message).join('\n')
  assert.match(words, new RegExp(`2 rows.*${s.north}|${s.north}.*2 rows`))
  assert.match(words, new RegExp(`1 row.*${s.east}|${s.east}.*1 row`))
  assert.deepEqual((await factsOf(files, v2)).tableFindings, [])
})

/** Two sets of files of one app, the second handed each change of the first by `applyChange`, with a tenant whose file both hold. */
function twoSets(t: TestContext, description: Description) {
  const second = filesOf(t, description)
  const changes: Change[] = []
  const first: Files = connected(filesOf(t, description), layoutOf(description), {
    keep: true,
    copy: (change) => {
      changes.push(change)
      applyChange(second, change)
    },
  })
  const s = seedDesk(first, description)
  const write = writingFiles(first, description)
  write((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'kept', code: 'A' }))
  write((db) => at(db, 'notes').of(s.north).add({ author: s.ada, text: 'a note of Ada' }))
  write((db) => at(db, 'notes').of(s.north).add({ author: s.bob, text: 'a note of Bob' }))
  sameFiles(first, second, 'before')
  return { first, second, changes, s }
}

/** A store of its own on the file of one tenant, as a file thread opens it, which counts what it is asked of its copy. */
function threadStore(t: TestContext, files: Files, id: string) {
  files.close(teamFile(id))
  const store = sqliteStore()
  store.open(files.path(teamFile(id)))
  let closed = false
  t.after(() => closed || store.close())
  const asked = { keep: 0, record: 0 }
  const counted: Store = {
    ...store,
    copy: {
      keep() {
        asked.keep++
        store.copy?.keep()
      },
      record() {
        asked.record++
        return Object(store.copy).record()
      },
      apply: (record, rows) => store.copy?.apply(record, rows),
    },
  }
  return {
    store: counted,
    asked,
    close() {
      store.close()
      closed = true
    },
  }
}

test('[50-5] with thread and keep, each of the three writes the number it is handed and the epoch into the file, asks the store for its record once, and answers a change that leaves a second file as the first', (t) => {
  const { first, second, s } = twoSets(t, v1)
  const north = teamFile(s.north)
  const machine = here(first.shared).id
  const numbers = [101, 102, 103]
  const asked: number[] = []
  const thread = (n: number) => ({
    number: () => {
      asked.push(n)
      return n
    },
    keep: true,
    epoch: `3.${machine}`,
  })
  const steps = tenantSteps(v1, checked)
  first.write((w) => setCheck(w.tx(), { version: 'v2', steps }))
  const run = (n: number, work: (store: Store) => Change | undefined): Change => {
    const on = threadStore(t, first, s.north)
    const change = work(on.store)
    assert.ok(change)
    // The number was asked once, as the last act of the write, and the record once after it.
    assert.deepEqual(asked.splice(0), [n])
    assert.deepEqual(on.asked, { keep: 1, record: 1 })
    assert.equal(metaOf(on.store, 'n'), n)
    assert.equal(metaOf(on.store, 'epoch'), 3)
    assert.equal(metaOf(on.store, 'writer'), machine)
    assert.equal(sumOf(on.store), change.sum)
    assert.deepEqual([change.n, change.epoch, change.file], [n, `3.${machine}`, north])
    assert.ok(change.record.length > 0)
    on.close()
    // The main thread keeps the change, which hands it on: the second set makes the same write of that file.
    applyChange(first, change, { only: 'kept' })
    sameFiles(first, second, `after the write ${n}`)
    return change
  }

  const held = run(numbers[0], (store) => checkAndHold(store, steps, 'v2', { thread: thread(numbers[0]) }).change)
  assert.deepEqual(
    held.layout?.steps.map((step) => `${step.do} ${step.table}`),
    ['addUnique orders'],
  )
  assert.deepEqual(holdsOf(second.of(north)), ['v2 require orders note', 'v2 addUnique orders code'])
  assert.deepEqual(
    second
      .of(north)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [['code']],
  )

  const dropped = run(numbers[1], (store) => dropHolds(store, 'v2', { thread: thread(numbers[1]) }))
  assert.deepEqual(
    dropped.layout?.steps.map((step) => `${step.do} ${step.table}`),
    ['dropIndex orders'],
  )
  assert.deepEqual(holdsOf(second.of(north)), [])
  assert.deepEqual(
    second
      .of(north)
      ?.layout()
      .find((one) => one.name === 'orders')?.unique,
    [],
  )

  // A column gains `sealed`: with a `Seal` handed in every row is sealed, and the second file holds the same
  // bytes with no key.
  const sealed = appOf({ sealedText: true })
  const up = run(numbers[2], (store) => bringUp(store, layoutOf(sealed), { seal, thread: thread(numbers[2]) }))
  assert.ok(up.layout?.steps.length)
  const textsOf = (files: Files) => storedIn(files.of(north), 'notes').map((row) => String(row.text))
  assert.equal(textsOf(first).length, 2)
  for (const text of textsOf(first)) assert.match(text, /^sealed:notes\.text\./)
  assert.deepEqual(textsOf(second), textsOf(first))
  assert.deepEqual(
    at(readingFiles(second, sealed), 'notes')
      .of(s.north)
      .all()
      .map((row) => row.text),
    ['a note of Ada', 'a note of Bob'],
  )
  // Each kept change stands in the shared file with its file, at the number it was handed.
  const kept = storedIn(first.shared, '_t_changes').filter((row) => numbers.includes(Number(row.n)))
  assert.deepEqual(
    kept.map((row) => [row.n, Object(row.change).file]),
    numbers.map((n) => [n, north]),
  )
  // The next write of the main thread takes the number after them.
  writingFiles(first, sealed)((db) => at(db, 'teams').change(s.north, { name: 'North again' }))
  assert.equal(metaOf(first.shared, 'n'), 104)
  sameFiles(first, second, 'after a write of the main thread')
})

test('[50-5] with keep false each of the three tells the store nothing, asks for no record, and answers a change with its file, its number and an empty record', (t) => {
  // The numbers of the writes are counted, and the changes are not kept.
  const files = connected(filesOf(t, v1), layoutOf(v1), {})
  const s = seedDesk(files, v1)
  writingFiles(files, v1)((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'kept', code: 'A' }))
  const north = teamFile(s.north)
  const machine = here(files.shared).id
  const steps = tenantSteps(v1, checked)
  files.write((w) => setCheck(w.tx(), { version: 'v2', steps }))
  const thread = (n: number) => ({ number: () => n, keep: false, epoch: `1.${machine}` })
  const run = (n: number, work: (store: Store) => Change | undefined): Change => {
    const on = threadStore(t, files, s.north)
    const before = sumOf(on.store)
    const change = work(on.store)
    assert.ok(change)
    assert.deepEqual(on.asked, { keep: 0, record: 0 })
    assert.deepEqual([change.n, change.file, change.record.length], [n, north, 0])
    assert.equal(metaOf(on.store, 'n'), n)
    // The running fingerprint of the file stays what it was: no record was made.
    assert.equal(sumOf(on.store), before)
    on.close()
    return change
  }
  const held = run(51, (store) => checkAndHold(store, steps, 'v2', { thread: thread(51) }).change)
  assert.deepEqual(
    held.layout?.steps.map((step) => `${step.do} ${step.table}`),
    ['addUnique orders'],
  )
  assert.deepEqual(holdsOf(files.of(north)), ['v2 require orders note', 'v2 addUnique orders code'])
  run(52, (store) => dropHolds(store, 'v2', { thread: thread(52) }))
  assert.deepEqual(holdsOf(files.of(north)), [])
  const up = run(53, (store) => bringUp(store, layoutOf(v2), { thread: thread(53) }))
  assert.deepEqual(
    up.layout?.steps.map((step) => `${step.do} ${step.table} ${step.column}`),
    ['addColumn orders ref'],
  )
  assert.equal(
    up.layout?.to.some((one) => one.name === 'orders' && Object.hasOwn(one.columns, 'ref')),
    true,
  )
  // Where the changes are not kept, the main thread keeps none: the shared file holds no kept change.
  applyChange(files, up, { only: 'kept' })
  assert.deepEqual(storedIn(files.shared, '_t_changes'), [])
  // A write of the main thread goes on above the numbers that were handed out.
  writingFiles(files, v2)((db) => at(db, 'orders').of(s.north).add({ total: 11, ref: 'R' }))
  assert.equal(metaOf(Object(files.of(north)), 'n'), 54)
})

test('[50-5] a stated rename of the table of the tenants moves no file and changes no id: the file is found under the new name, and takes it when it is brought up', async (t) => {
  const groups = appOf({ groups: true })
  const files = filesOf(t, v1)
  const s = seedDesk(files, v1)
  const order = writingFiles(files, v1)((db) => at(db, 'orders').of(s.north).add({ total: 10, placedBy: s.ada }))
  const path = files.path(teamFile(s.north))
  assert.equal(metaOf(Object(files.of(teamFile(s.north))), 'table'), 'teams')

  // The rename is stated, so nothing is found: not in the shared file, whose `members` link to the table, and not
  // in the file of a tenant, which names the table in each link that runs out of it.
  assert.deepEqual((await factsOf(files, groups)).tableFindings, [])
  const { steps, findings } = planTableChanges(
    files.shared.layout().filter((one) => !one.name.startsWith('_t_')),
    layoutOf(groups).filter((one) => one.tenant === undefined),
  )
  assert.deepEqual(findings, [])
  assert.deepEqual(steps, [{ do: 'renameTable', table: 'groups', from: 'teams' }])

  // The switch: the shared file renames the table, in the one write in which the running layout is told.
  files.write(
    (w) => {
      applySteps(w.tx(), files.shared, steps)
      files.layout(layoutOf(groups))
    },
    { steps: true },
  )
  const north = { table: 'groups', id: s.north }
  assert.equal(files.path(north), path)
  assert.equal(files.has(north), true)
  assert.deepEqual([...files.walk()], [north])
  assert.equal(files.of(teamFile(s.north)), undefined)
  // The shared file keeps the folder of the table, so it is found after the files are opened again.
  assert.deepEqual(metaOf(files.shared, 'tenantFolders'), { groups: 'teams' })

  // The file names the table by the name it had, as its own table and in each link, until it is brought up.
  bringUp(Object(files.of(north)), layoutOf(groups))
  assert.equal(metaOf(Object(files.of(north)), 'table'), 'groups')
  const team = files
    .of(north)
    ?.layout()
    .find((one) => one.name === 'orders')?.columns.team
  assert.equal(team?.kind === 'link' && team.table, 'groups')
  const db = readingFiles(files, groups)
  assert.deepEqual(
    at(db, 'orders')
      .of(s.north)
      .all()
      .map((row) => [row.id, row.team, row.placedBy]),
    [[order.id, s.north, s.ada]],
  )
  // A new tenant of the table has its file in the same folder.
  writingFiles(files, groups)((db) => at(db, 'orders').of(s.south).add({ total: 20 }))
  assert.equal(files.path({ table: 'groups', id: s.south }).includes('teams'), true)
  assert.equal(metaOf(Object(files.of({ table: 'groups', id: s.south })), 'table'), 'groups')
})
