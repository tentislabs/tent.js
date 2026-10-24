import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Change, FileName, Files } from '../index.ts'
import { applyChange, connected, createDb, layoutOf, NotReady, setHere } from '../index.ts'
import {
  appOf,
  appTablesOf,
  filesOf,
  folderOf,
  readingFiles,
  sameFiles,
  seedDesk,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at } from './shop.ts'
import { codeOf, system } from './work.ts'

const desk = appOf()

type Sql = (text: string, values?: unknown[], o?: { of?: string }) => unknown[]

/** The raw SQL of a `db` with full access that reads the files at once. */
const sqlOf = (files: Files): Sql => Reflect.get(Object(readingFiles(files, desk, system, { system: true })), 'sql')

// The tables that the file of a team may hold.
const tenanted = ['lines', 'notes', 'orders', 'payments', 'tasks']

test('[50-2] raw SQL with of sees every table of the layout of a file: for a tenant with no file in an empty file in memory, and in a file that lacks a table once the missing tables were made in a write of its own', (t) => {
  const folder = folderOf(t)
  const second = filesOf(t, desk)
  const changes: Change[] = []
  const files = connected(filesOf(t, desk, {}, folder), layoutOf(desk), {
    keep: true,
    copy(change) {
      changes.push(change)
      applyChange(second, change)
    },
  })
  const s = seedDesk(files, desk)
  const sql = sqlOf(files)
  const write = writingFiles(files, desk)
  const seeded = changes.length

  // A tenant with no file: every table of the layout is there and holds no row, and nothing is made on the disk.
  for (const name of tenanted) assert.deepEqual(sql(`select count(*) c from ${name}`, [], { of: s.east }), [{ c: 0 }])
  assert.deepEqual(sql('select o.total from orders o join lines l on l."order" = o._n', [], { of: s.east }), [])
  assert.equal(files.has(teamFile(s.east)), false)
  assert.equal(existsSync(join(folder, 'tenants')), false)
  assert.deepEqual(files.open(), [])
  assert.equal(changes.length, seeded)
  // It is a file of that tenant as any other: a text that writes outside a change is refused, and a table of the
  // shared file is not in it.
  assert.equal(
    codeOf(() => sql('delete from orders', [], { of: s.east })),
    'T0012',
  )
  assert.equal(
    codeOf(() => sql('select count(*) c from teams', [], { of: s.east })),
    'T0009',
  )
  // A tenant whose row is not in the shared file still names no tenant.
  for (const tenant of ['0'.repeat(26), '../x', ''])
    assert.equal(
      codeOf(() => sql('select count(*) c from orders', [], { of: tenant })),
      'T2104',
    )

  // A file that lacks a table: the missing tables are made first, in a write of its own, which is one change of
  // that file with its steps, so a second set of files holds them too.
  write((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  const north = teamFile(s.north)
  assert.deepEqual(appTablesOf(files.of(north)), ['orders'])
  const before = changes.length
  assert.deepEqual(sql('select count(*) c from tasks', [], { of: s.north }), [{ c: 0 }])
  assert.deepEqual(appTablesOf(files.of(north)), tenanted)
  const made = changes.slice(before)
  assert.equal(made.length, 1)
  assert.deepEqual(made[0].file, north)
  assert.deepEqual(made[0].rows, [])
  assert.deepEqual(made[0].layout?.steps.map((step) => `${step.do} ${step.table}`).sort(), [
    'addTable lines',
    'addTable notes',
    'addTable payments',
    'addTable tasks',
  ])
  sameFiles(files, second, 'after the missing tables were made')
  // A file that holds every table is written nothing.
  assert.deepEqual(sql('select count(*) c from orders', [], { of: s.north }), [{ c: 1 }])
  assert.deepEqual(sql('select count(*) c from payments', [], { of: s.north }), [{ c: 0 }])
  assert.equal(changes.length, before + 1)

  // Inside a change, once a text that writes has opened the write of the file, the missing tables are made in that
  // write, which is the write of the change.
  write((db) => at(db, 'orders').of(s.south).add({ total: 20 }))
  const south = teamFile(s.south)
  const inChange = changes.length
  files.write((w) => {
    const run: Sql = Reflect.get(Object(createDb(w, desk, system, 'write', {}, { system: true })), 'sql')
    run('update orders set total = total + 1', [], { of: s.south })
    assert.deepEqual(run('select count(*) c from tasks', [], { of: s.south }), [{ c: 0 }])
  })
  assert.equal(changes.length, inChange + 1)
  assert.deepEqual(appTablesOf(files.of(south)), tenanted)
  assert.deepEqual(sql('select total from orders', [], { of: s.south }), [{ total: 21 }])
  sameFiles(files, second, 'after a change with raw SQL')

  // A text that only reads opens the write of no file, inside a change too: the missing tables are made in a write
  // of their own, as outside one, and a text that writes and may not write the file makes none.
  write((db) => at(db, 'orders').of(s.east).add({ total: 30 }))
  const east = teamFile(s.east)
  const reading = changes.length
  assert.equal(
    codeOf(() =>
      files.write((w) => {
        const db = createDb(w, desk, system, 'write', {}, { system: true })
        at(db, 'users').add({ name: 'Di' })
        Reflect.get(Object(db), 'sql')('delete from tasks', [], { of: s.east })
      }),
    ),
    'T2109',
  )
  assert.deepEqual(appTablesOf(files.of(east)), ['orders'])
  assert.equal(changes.length, reading)
  files.write((w) => {
    const run: Sql = Reflect.get(Object(createDb(w, desk, system, 'write', {}, { system: true })), 'sql')
    assert.deepEqual(run('select count(*) c from tasks', [], { of: s.east }), [{ c: 0 }])
  })
  assert.equal(changes.length, reading + 1)
  assert.deepEqual(changes.at(-1)?.file, east)
  assert.deepEqual(changes.at(-1)?.rows, [])
  assert.deepEqual(appTablesOf(files.of(east)), tenanted)
  sameFiles(files, second, 'after a change that reads with raw SQL')
})

test('[50-2] on a reader raw SQL of a file that lacks a table throws NotReady, and writes nothing', (t) => {
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  const north = teamFile(s.north)
  const sql = sqlOf(files)
  // A reader writes no file of its own accord: the engine hands the call to the writer.
  setHere(files.shared, { role: 'reader' })
  assert.throws(
    () => sql('select count(*) c from tasks', [], { of: s.north }),
    (error) => error instanceof NotReady && error.file.id === s.north && error.file.table === 'teams',
  )
  assert.deepEqual(appTablesOf(files.of(north)), ['orders'])
  // A tenant with no file is read in memory there too.
  assert.deepEqual(sql('select count(*) c from tasks', [], { of: s.east }), [{ c: 0 }])
  assert.equal(files.has(teamFile(s.east)), false)
  // On the writer the same call makes the tables.
  setHere(files.shared, { role: 'writer' })
  assert.deepEqual(sql('select count(*) c from tasks', [], { of: s.north }), [{ c: 0 }])
  assert.deepEqual(appTablesOf(files.of(north)), tenanted)
})

test('[50-2] raw SQL with of that only reads makes no file for a tenant with none, inside a change as outside one, and one that writes makes the file as an add does', (t) => {
  const marked: FileName[] = []
  const folder = folderOf(t)
  const files = filesOf(t, desk, { writing: (file) => marked.push(file) }, folder)
  const s = seedDesk(files, desk)
  const [east, west] = [teamFile(s.east), teamFile(s.west)]
  /** One change with full access, handed its raw SQL and its `db`. */
  const change = <T>(work: (run: Sql, db: object) => T): T =>
    files.write((w) => {
      const db = createDb(w, desk, system, 'write', {}, { system: true })
      return work(Reflect.get(Object(db), 'sql'), db)
    }).value
  const nothingMade = (what: string) => {
    assert.equal(existsSync(join(folder, 'tenants')), false, what)
    assert.deepEqual(files.open(), [], what)
    assert.deepEqual(marked, [], what)
  }

  // A change that only reads: every table of the layout is there and holds no row, and nothing is made on the disk.
  change((run) => {
    for (const name of tenanted) assert.deepEqual(run(`select count(*) c from ${name}`, [], { of: s.east }), [{ c: 0 }])
    assert.deepEqual(run('select o.total from orders o join lines l on l."order" = o._n', [], { of: s.east }), [])
  })
  nothingMade('a change that reads')
  // A change that reads and is undone leaves nothing behind.
  assert.throws(
    () =>
      change((run) => {
        run('select count(*) c from orders', [], { of: s.east })
        throw new Error('undone')
      }),
    /undone/,
  )
  nothingMade('a change that is undone')
  // A change may read any file: after it wrote the shared file, the read of a tenant with no file is no second file.
  change((run, db) => {
    at(db, 'users').add({ name: 'Di' })
    assert.deepEqual(run('select count(*) c from tasks', [], { of: s.east }), [{ c: 0 }])
  })
  nothingMade('a change of the shared file')

  // A text that writes makes the file, as an add does, with every table of its layout: the engine is told first.
  change((run) => {
    assert.deepEqual(run('select count(*) c from orders', [], { of: s.east }), [{ c: 0 }])
    assert.equal(files.has(east), false)
    assert.deepEqual(run('update orders set total = 0', [], { of: s.east }), [])
    assert.equal(files.has(east), true)
    assert.deepEqual(run('select count(*) c from tasks', [], { of: s.east }), [{ c: 0 }])
  })
  assert.deepEqual(marked, [east])
  assert.deepEqual(appTablesOf(files.of(east)), tenanted)

  // After a change wrote the file of one tenant, it reads a tenant with no file, and writes no second file.
  change((run, db) => {
    at(db, 'orders').of(s.east).add({ total: 3 })
    assert.deepEqual(run('select count(*) c from orders', [], { of: s.west }), [{ c: 0 }])
  })
  assert.deepEqual(sqlOf(files)('select total from orders', [], { of: s.east }), [{ total: 3 }])
  assert.equal(
    codeOf(() =>
      change((run, db) => {
        at(db, 'orders').of(s.east).add({ total: 4 })
        run('delete from orders', [], { of: s.west })
      }),
    ),
    'T2109',
  )
  assert.deepEqual(sqlOf(files)('select total from orders', [], { of: s.east }), [{ total: 3 }])
  assert.equal(files.has(west), false)
  assert.deepEqual(marked, [east])
})

test('[50-2] a change reads any file by raw SQL: a text that only reads opens the write of no file, so a change that reads one file with db.sql and writes another is no T2109, and only a text that writes opens the write of its file', (t) => {
  const marked: FileName[] = []
  const files = filesOf(t, desk, { writing: (file) => marked.push(file) })
  const s = seedDesk(files, desk)
  const asSystem = writingFiles(files, desk)
  asSystem((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  asSystem((db) => at(db, 'orders').of(s.south).add({ total: 20 }))
  const [north, south] = [teamFile(s.north), teamFile(s.south)]
  const change = <T>(work: (run: Sql, db: object) => T): T =>
    files.write((w) => {
      const db = createDb(w, desk, system, 'write', {}, { system: true })
      return work(Reflect.get(Object(db), 'sql'), db)
    }).value
  const totals = (tenant: string) => sqlOf(files)('select total from orders order by total', [], { of: tenant })
  const count = 'select count(*) c from orders'
  for (const closed of [false, true]) {
    if (closed) for (const file of files.open()) files.close(file)
    marked.length = 0
    // A read of one tenant's file, and then a write of another's and of the shared file.
    change((run, db) => {
      assert.deepEqual(run(count, [], { of: s.north }), [{ c: 1 }])
      at(db, 'orders').of(s.south).add({ total: 21 })
    })
    change((run, db) => {
      assert.deepEqual(run(count, [], { of: s.north }), [{ c: 1 }])
      at(db, 'users').add({ name: 'Di' })
    })
    // A read of the shared file, and then a write of a tenant's file.
    change((run, db) => {
      assert.equal(Object(run('select count(*) c from teams')[0]).c, 4)
      at(db, 'orders').of(s.south).add({ total: 22 })
    })
    // After the write of one file is open: reads of the shared file, of another tenant, and of its own file.
    change((run, db) => {
      at(db, 'orders').of(s.south).add({ total: 23 })
      assert.equal(Object(run('select count(*) c from teams')[0]).c, 4)
      assert.deepEqual(run(count, [], { of: s.north }), [{ c: 1 }])
      assert.equal(Object(run(count, [], { of: s.south })[0]).c > 3, true)
    })
    // The files of two tenants and the shared file read in one change, which then writes the shared file.
    change((run, db) => {
      run(count, [], { of: s.north })
      run(count, [], { of: s.south })
      run('select count(*) c from teams')
      at(db, 'users').add({ name: 'Ed' })
    })
    // The engine is told of the one file that was written, and of no file that was read.
    assert.deepEqual([...new Set(marked.map((file) => file.id))], closed ? [s.south] : [])
    asSystem((db) => {
      for (const row of at(db, 'orders')
        .of(s.south)
        .where({ total: { above: 20 } })
        .all())
        at(db, 'orders').of(s.south).remove(String(row.id))
    })
  }
  assert.deepEqual(totals(s.north), [{ total: 10 }])
  assert.deepEqual(totals(s.south), [{ total: 20 }])

  // A text that writes opens the write of its file: a second file is T2109, and the whole change is undone.
  for (const second of [
    (run: Sql) => run('update orders set total = 0', [], { of: s.north }),
    (run: Sql) => run('update teams set name = name'),
  ])
    assert.equal(
      codeOf(() =>
        change((run, db) => {
          at(db, 'orders').of(s.south).add({ total: 30 })
          second(run)
        }),
      ),
      'T2109',
    )
  assert.equal(
    codeOf(() =>
      change((run, db) => {
        run('update orders set total = 0', [], { of: s.north })
        at(db, 'users').add({ name: 'Fay' })
      }),
    ),
    'T2109',
  )
  assert.deepEqual(totals(s.north), [{ total: 10 }])
  assert.deepEqual(totals(s.south), [{ total: 20 }])
  // A text that writes, alone or after reads of other files, writes its file.
  change((run) => {
    run(count, [], { of: s.south })
    run('select count(*) c from teams')
    run('update orders set total = total + 1', [], { of: s.north })
    assert.deepEqual(run('select total from orders', [], { of: s.north }), [{ total: 11 }])
  })
  assert.deepEqual(totals(s.north), [{ total: 11 }])
  assert.equal(files.has(north) && files.has(south), true)
})
