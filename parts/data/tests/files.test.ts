import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Change, Searcher } from '../index.ts'
import { applyChange, connected, createDb, exportUser, layoutOf, NotReady, sqliteStore } from '../index.ts'
import {
  appOf,
  appTablesOf,
  filesOf,
  folderOf,
  metaOf,
  person,
  readingFiles,
  sameFiles,
  seedDesk,
  storedIn,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at } from './shop.ts'
import { codeOf, system } from './work.ts'

const desk = appOf()

/** Every file under a folder, as its path from that folder, written with `/`. */
function filesUnder(folder: string, below = ''): string[] {
  if (!existsSync(join(folder, below))) return []
  return readdirSync(join(folder, below), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(folder, `${below}${entry.name}/`) : [`${below}${entry.name}`],
  )
}

test('[50-2] the rows of a tenant table live in the file of their tenant and in no other, and nothing is made before it is used', (t) => {
  const folder = folderOf(t)
  const files = filesOf(t, desk, {}, folder)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const db = readingFiles(files, desk)
  const [north, south, east] = [teamFile(s.north), teamFile(s.south), teamFile(s.east)]

  // A tenant with no row yet has no file, and a read makes none.
  assert.deepEqual(filesUnder(folder, 'tenants/'), [])
  assert.deepEqual(at(db, 'orders').of(s.north).all(), [])
  assert.equal(at(db, 'orders').of(s.north).count(), 0)
  assert.equal(at(db, 'orders').of(s.north).get('0'.repeat(26)), undefined)
  assert.equal(files.has(north), false)
  assert.equal(files.of(north), undefined)
  assert.deepEqual(files.open(), [])
  assert.deepEqual([...files.walk()], [])
  assert.deepEqual(filesUnder(folder, 'tenants/'), [])

  // The first write makes the file, where the document says it stands, and `add` writes the tenant into the column.
  const first = write((db) => at(db, 'orders').of(s.north).add({ total: 10, placedBy: s.ada, note: 'acme bolts' }))
  assert.equal(first.team, s.north)
  assert.equal(files.has(north), true)
  assert.equal(files.path(north), join(folder, 'tenants', 'teams', s.north.slice(-2), `${s.north}.db`))
  assert.equal(existsSync(files.path(north)), true)
  assert.deepEqual(files.open(), [north])
  assert.deepEqual([...files.walk()], [north])
  assert.equal(files.has(south), false)
  const second = write((db) => at(db, 'orders').of(s.south).add({ total: 20, note: 'acme nuts' }))
  assert.equal(second.team, s.south)
  assert.deepEqual([...files.walk()].map((file) => file.id).sort(), [s.north, s.south].sort())

  // Each tenant reads its own rows and no other's, and the shared file holds no tenant table.
  const ids = (tenant: string) =>
    at(db, 'orders')
      .of(tenant)
      .all()
      .map((row) => row.id)
  assert.deepEqual(ids(s.north), [first.id])
  assert.deepEqual(ids(s.south), [second.id])
  assert.deepEqual(ids(s.east), [])
  assert.equal(at(db, 'orders').of(s.south).get(String(first.id)), undefined)
  assert.equal(at(db, 'orders').of(s.north).get(String(first.id))?.total, 10)
  assert.deepEqual(appTablesOf(files.shared), ['members', 'teams', 'users'])
  assert.deepEqual(
    storedIn(files.of(north), 'orders').map((row) => [row.id, row.team]),
    [[first.id, s.north]],
  )
  assert.deepEqual(
    storedIn(files.of(south), 'orders').map((row) => [row.id, row.team]),
    [[second.id, s.south]],
  )

  // One that uses two of five tables holds those two.
  write((db) => at(db, 'tasks').of(s.north).add({ title: 'call back' }))
  assert.deepEqual(appTablesOf(files.of(north)), ['orders', 'tasks'])
  assert.deepEqual(appTablesOf(files.of(south)), ['orders'])
  // A table that the file does not hold yet answers no rows.
  assert.deepEqual(at(db, 'notes').of(s.north).all(), [])
  assert.equal(at(db, 'notes').of(s.north).count(), 0)

  // A table that links to another makes both.
  write((db) => at(db, 'payments').of(s.east).add({ amount: 5 }))
  assert.deepEqual(appTablesOf(files.of(east)), ['orders', 'payments'])
  assert.deepEqual(at(db, 'orders').of(s.east).all(), [])

  // A tenant's file holds no index on its `tenant` column, and one for every other link.
  const indexes = (files.of(north)?.sql?.('SELECT "name" FROM sqlite_master WHERE "type" = \'index\'', []) ?? []).map(
    (row) => String(Object(row).name),
  )
  assert.equal(
    indexes.some((name) => name.includes('team')),
    false,
    indexes.join(' '),
  )
  assert.equal(indexes.includes('orders__i__placedBy'), true, indexes.join(' '))

  // What a tenant's file says of itself.
  const file = files.of(north)
  assert.ok(file)
  assert.equal(metaOf(file, 'table'), 'teams')
  assert.equal(metaOf(file, 'tenant'), s.north)
  assert.equal(typeof metaOf(file, 'fingerprint'), 'string')
})

test('[50-2] [16-2@3] a row keeps to the file of its tenant: T2109 for a plan without of, for another tenant in the column and for a second file, and T2104 for a tenant that is none', (t) => {
  const folder = folderOf(t)
  const files = filesOf(t, desk, {}, folder)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const db = readingFiles(files, desk)
  const order = write((db) => at(db, 'orders').of(s.north).add({ total: 10, team: s.north }))
  assert.equal(order.team, s.north)

  // A plan and a write made in code without `of`.
  assert.equal(
    codeOf(() => at(db, 'orders').all()),
    'T2109',
  )
  assert.equal(
    codeOf(() => at(db, 'orders').get(String(order.id))),
    'T2109',
  )
  assert.equal(
    codeOf(() => at(db, 'orders').count()),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      at(db, 'teams')
        .where({ id: { in: at(db, 'orders').pick(['team']) } })
        .all(),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').add({ total: 1 }))),
    'T2109',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').change(String(order.id), { total: 2 }))),
    'T2109',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').remove(String(order.id)))),
    'T2109',
  )

  // A row is added with the tenant of `of`, and its `tenant` column cannot be changed.
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').of(s.north).add({ total: 1, team: s.south }))),
    'T2109',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').of(s.north).change(String(order.id), { team: s.south }))),
    'T2109',
  )
  // The same tenant written again changes nothing, and is taken.
  assert.equal(
    write((db) => at(db, 'orders').of(s.north).change(String(order.id), { team: s.north, total: 11 })).total,
    11,
  )
  assert.equal(files.has(teamFile(s.south)), false)

  // A change that writes a second file is undone, and neither file is written.
  assert.equal(
    codeOf(() =>
      write((db) => {
        at(db, 'orders').of(s.north).add({ total: 100 })
        at(db, 'orders').of(s.south).add({ total: 200 })
      }),
    ),
    'T2109',
  )
  assert.deepEqual(
    at(db, 'orders')
      .of(s.north)
      .all()
      .map((row) => row.total),
    [11],
  )
  assert.equal(files.has(teamFile(s.south)), false)
  // The shared file and a tenant's file are two files too, in either order.
  assert.equal(
    codeOf(() =>
      write((db) => {
        at(db, 'teams').add({ name: 'Far' })
        at(db, 'orders').of(s.north).add({ total: 100 })
      }),
    ),
    'T2109',
  )
  assert.equal(
    codeOf(() =>
      write((db) => {
        at(db, 'orders').of(s.north).add({ total: 100 })
        at(db, 'teams').add({ name: 'Far' })
      }),
    ),
    'T2109',
  )
  assert.equal(at(db, 'teams').where({ name: 'Far' }).count(), 0)
  assert.equal(at(db, 'orders').of(s.north).count(), 1)

  // A change reads another file before it writes, and after.
  write((db) => at(db, 'tasks').of(s.south).add({ title: 'one' }))
  const copied = write((db) => {
    const tasks = at(db, 'tasks').of(s.south).count()
    const made = at(db, 'orders').of(s.north).add({ total: tasks })
    assert.equal(at(db, 'tasks').of(s.south).count(), 1)
    assert.equal(at(db, 'teams').get(s.north)?.name, 'North')
    return made
  })
  assert.equal(copied.total, 1)

  // A link to a row of another tenant is not found.
  const theirs = write((db) => at(db, 'orders').of(s.south).add({ total: 7 }))
  assert.equal(
    codeOf(() => write((db) => at(db, 'lines').of(s.north).add({ order: theirs.id, qty: 1 }))),
    'T2104',
  )
  assert.equal(write((db) => at(db, 'lines').of(s.south).add({ order: theirs.id, qty: 1 })).order, theirs.id)
  // A link into the shared file is held against the shared file.
  assert.equal(
    codeOf(() =>
      write((db) =>
        at(db, 'orders')
          .of(s.north)
          .add({ total: 1, placedBy: '0'.repeat(26) }),
      ),
    ),
    'T2104',
  )

  // An id that is not the id of a row names no tenant: it reads nothing, writes nothing and touches no file.
  const before = filesUnder(folder).sort()
  const nobody = ['../x', `../${s.north}`, 'a/b', `${s.north}/..`, 'x'.repeat(300), '', s.north.toUpperCase()]
  for (const id of nobody) {
    assert.deepEqual(at(db, 'orders').of(id).all(), [], id)
    assert.equal(at(db, 'orders').of(id).count(), 0, id)
    assert.equal(
      codeOf(() => write((db) => at(db, 'orders').of(id).add({ total: 1 }))),
      'T2104',
      id,
    )
    assert.equal(
      codeOf(() => write((db) => at(db, 'orders').of(id).change(String(order.id), { total: 1 }))),
      'T2104',
      id,
    )
    assert.equal(
      codeOf(() => write((db) => at(db, 'orders').of(id).remove(String(order.id)))),
      'T2104',
      id,
    )
    assert.equal(files.has({ table: 'teams', id }), false, id)
    assert.equal(files.of({ table: 'teams', id }), undefined, id)
    assert.equal(files.of({ table: 'teams', id }, { make: true }), undefined, id)
  }
  // A table that no tenant table names has no file either.
  assert.equal(files.of({ table: '../teams', id: s.north }, { make: true }), undefined)
  assert.equal(files.of({ table: 'users', id: s.ada }, { make: true }), undefined)
  // A tenant whose row is not in the shared file: no rows, T2104 for a write, and no file.
  const gone = `${s.north.slice(0, 25)}${s.north.endsWith('0') ? '1' : '0'}`
  assert.deepEqual(at(db, 'orders').of(gone).all(), [])
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').of(gone).add({ total: 1 }))),
    'T2104',
  )
  assert.equal(files.has(teamFile(gone)), false)
  // A tenant with no file: a change and a removal find no row.
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').of(s.east).change(String(order.id), { total: 1 }))),
    'T2103',
  )
  assert.equal(
    codeOf(() => write((db) => at(db, 'orders').of(s.east).remove(String(order.id)))),
    'T2103',
  )
  assert.equal(files.has(teamFile(s.east)), false)
  assert.deepEqual(filesUnder(folder).sort(), before)
})

test('[50-2] a link into the shared file is read under the rule of the caller, a filter through it finds the rows, and search, near and history answer inside one file', (t) => {
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const made = write((db) => ({
    adas: at(db, 'orders')
      .of(s.north)
      .add({ total: 10, placedBy: s.ada, note: 'acme bolts', meaning: [1, 0, 0, 0] }),
    bobs: at(db, 'orders')
      .of(s.north)
      .add({ total: 20, placedBy: s.bob, note: 'brass nuts', meaning: [0, 1, 0, 0] }),
    none: at(db, 'orders')
      .of(s.north)
      .add({ total: 30, note: 'acme washers', meaning: [0.9, 0.1, 0, 0] }),
  }))
  const south = write((db) =>
    at(db, 'orders')
      .of(s.south)
      .add({ total: 40, placedBy: s.ada, note: 'acme springs', meaning: [1, 0, 0, 0] }),
  )

  // `.with` answers the linked row of the shared file under the caller's rule: Ada reads her own row of `users`.
  const ada = readingFiles(files, desk, person(s.ada))
  const linked = at(ada, 'orders').of(s.north).with('placedBy').sort('total').all()
  assert.deepEqual(
    linked.map((row) => row.placedBy),
    [{ ...Object(linked[0].placedBy), id: s.ada, name: 'Ada' }, { id: s.bob }, undefined],
  )
  // A filter through that link reads the shared side first, and finds the rows in the file.
  const db = readingFiles(files, desk)
  const by = (name: string) =>
    at(db, 'orders')
      .of(s.north)
      .where({ 'placedBy.name': name })
      .all()
      .map((row) => row.id)
  assert.deepEqual(by('Ada'), [made.adas.id])
  assert.deepEqual(by('Bob'), [made.bobs.id])
  assert.deepEqual(by('Cy'), [])
  assert.deepEqual(
    at(db, 'orders')
      .of(s.north)
      .where({ placedBy: s.ada })
      .all()
      .map((row) => row.id),
    [made.adas.id],
  )
  // A link inside the file is a link as ever: a line is read with its order, and found through it.
  const line = write((db) => at(db, 'lines').of(s.north).add({ order: made.bobs.id, qty: 3 }))
  assert.equal(Object(at(db, 'lines').of(s.north).with('order').all()[0].order).note, 'brass nuts')
  assert.deepEqual(
    at(db, 'lines')
      .of(s.north)
      .where({ 'order.total': 20 })
      .all()
      .map((row) => row.id),
    [line.id],
  )
  assert.deepEqual(
    at(db, 'lines')
      .of(s.north)
      .where({ 'order.placedBy.name': 'Bob' })
      .all()
      .map((row) => row.id),
    [line.id],
  )

  // Search by words, inside one file.
  const found = (tenant: string, words: string) =>
    at(db, 'orders')
      .of(tenant)
      .search(words)
      .all()
      .map((row) => row.id)
  assert.deepEqual(found(s.north, 'acme'), [made.adas.id, made.none.id])
  assert.deepEqual(found(s.south, 'acme'), [south.id])
  assert.deepEqual(found(s.south, 'brass'), [])

  // Search by meaning, inside one file.
  const near = at(db, 'orders').of(s.north).near('meaning', [1, 0, 0, 0]).limit(2).all()
  assert.deepEqual(
    near.map((row) => row.id),
    [made.adas.id, made.none.id],
  )
  assert.equal(near[0].distance, 0)
  assert.deepEqual(
    at(db, 'orders')
      .of(s.south)
      .near('meaning', [1, 0, 0, 0])
      .limit(5)
      .all()
      .map((row) => row.id),
    [south.id],
  )

  // The earlier versions of a row are kept in the file of its tenant.
  write((db) => at(db, 'orders').of(s.north).change(String(made.adas.id), { total: 11 }))
  const history = at(db, 'orders').of(s.north).history(String(made.adas.id))
  assert.deepEqual(
    history.map((entry) => [entry.by, entry.value.total]),
    [['system', 10]],
  )
  assert.deepEqual(at(db, 'orders').of(s.south).history(String(made.adas.id)), [])
  assert.equal(storedIn(files.of(teamFile(s.north)), '_t_history').length, 1)
  assert.equal(storedIn(files.of(teamFile(s.south)), '_t_history').length, 0)
  assert.equal(storedIn(files.shared, '_t_history').length, 0)

  // Raw SQL with `of` runs in the file of that tenant, and without it in the shared file.
  const full = readingFiles(files, desk, system, { system: true })
  const sql: (text: string, values?: unknown[], o?: { of?: string }) => unknown[] = Reflect.get(Object(full), 'sql')
  assert.deepEqual(sql('select count(*) c from orders', [], { of: s.north }), [{ c: 3 }])
  assert.deepEqual(sql('select count(*) c from orders where total > ?', [15], { of: s.north }), [{ c: 2 }])
  assert.deepEqual(sql('select count(*) c from orders', [], { of: s.south }), [{ c: 1 }])
  assert.deepEqual(sql('select count(*) c from teams'), [{ c: 4 }])
  // Inside a change it writes that file, and no other.
  const inWrite = (work: (run: typeof sql) => void) =>
    files.write((w) => work(Reflect.get(Object(createDb(w, desk, system, 'write', {}, { system: true })), 'sql')))
  inWrite((run) => run('update orders set total = total + 1 where total > ?', [25], { of: s.north }))
  assert.deepEqual(sql('select total from orders order by total', [], { of: s.north }), [
    { total: 11 },
    { total: 20 },
    { total: 31 },
  ])
  assert.equal(
    codeOf(() =>
      inWrite((run) => {
        run('update orders set total = 0', [], { of: s.north })
        run('update orders set total = 0', [], { of: s.south })
      }),
    ),
    'T2109',
  )
  assert.deepEqual(sql('select count(*) c from orders where total = 0', [], { of: s.north }), [{ c: 0 }])
})

test('[50-2] a search of the builder own is asked for one tenant, and told the rows of each file', (t) => {
  const told: string[] = []
  const texts = new Map<string, string>()
  const searcher: Searcher = {
    has: () => true,
    wrote(table, id, row, of) {
      told.push(`${table} ${of?.table} ${of?.id} ${row ? Object.values(row).join(' ') : 'removed'}`)
      if (row) texts.set(`${of?.id} ${id}`, Object.values(row).join(' '))
      else texts.delete(`${of?.id} ${id}`)
    },
    find: (_table, words, limit, of) =>
      [...texts]
        .filter(([key, text]) => key.startsWith(`${of?.id} `) && text.includes(words))
        .map(([key]) => key.split(' ')[1])
        .slice(0, limit),
    gone(of) {
      told.push(`gone ${of.table} ${of.id}`)
    },
  }
  const plain = filesOf(t, desk)
  const files = connected(plain, layoutOf(desk), { searcher })
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const north = write((db) => at(db, 'orders').of(s.north).add({ total: 1, note: 'acme bolts' }))
  const south = write((db) => at(db, 'orders').of(s.south).add({ total: 2, note: 'acme nuts' }))
  write((db) => at(db, 'orders').of(s.south).add({ total: 3, note: 'brass' }))
  assert.deepEqual(told, [
    `orders teams ${s.north} acme bolts`,
    `orders teams ${s.south} acme nuts`,
    `orders teams ${s.south} brass`,
  ])
  const db = readingFiles(files, desk, system, { searcher })
  const found = (tenant: string, words: string) =>
    at(db, 'orders')
      .of(tenant)
      .search(words)
      .all()
      .map((row) => row.id)
  assert.deepEqual(found(s.north, 'acme'), [north.id])
  assert.deepEqual(found(s.south, 'acme'), [south.id])
  // The tenant is removed with its row: the searcher is told that it is gone.
  told.length = 0
  writingFiles(files, desk)((db) => at(db, 'teams').remove(s.south))
  assert.deepEqual(told, [`gone teams ${s.south}`])
})

test('[50-2] a file that was opened to read alone and closed leaves no file beside it', (t) => {
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  const north = teamFile(s.north)
  const path = files.path(north)
  files.close(north)
  assert.deepEqual(files.open(), [])
  const beside = () => ['-wal', '-shm'].filter((ending) => existsSync(`${path}${ending}`))
  assert.deepEqual(beside(), [])
  const alone = sqliteStore()
  alone.open(path, { readOnly: true })
  assert.equal(alone.read({ from: 'orders', count: true }, system).value, 1)
  assert.equal(
    codeOf(() => alone.write((tx) => tx.add('orders', { total: 1, team: s.north }, system))),
    'T0012',
  )
  alone.close()
  assert.deepEqual(beside(), [])
  // The file is opened again when it is asked for, and holds what it held.
  assert.equal(at(readingFiles(files, desk), 'orders').of(s.north).count(), 1)
  assert.deepEqual(files.open(), [north])
})

test('[50-2] with its changes kept, a change that writes a row of one table and then the first row of another leaves a second set of files with both rows', (t) => {
  const second = filesOf(t, desk)
  const changes: Change[] = []
  const first = connected(filesOf(t, desk), layoutOf(desk), {
    keep: true,
    copy: (change) => {
      changes.push(change)
      applyChange(second, change)
    },
  })
  const s = seedDesk(first, desk)
  const write = writingFiles(first, desk)
  write((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'the first' }))
  const made = write((db) => {
    const order = at(db, 'orders')
      .of(s.north)
      .add({ total: 20, placedBy: s.ada, meaning: [0, 0, 1, 0] })
    const note = at(db, 'notes').of(s.north).add({ author: s.ada, text: 'the first note' })
    const line = at(db, 'lines').of(s.north).add({ order: order.id, qty: 2 })
    return { order, note, line }
  })
  const last = changes.at(-1)
  assert.deepEqual(last?.file, teamFile(s.north))
  // The tables that the write made after its first row travel as steps, which a reader runs first.
  assert.deepEqual(
    last?.layout?.steps.map((step) => `${step.do} ${step.table}`),
    ['addTable notes', 'addTable lines'],
  )
  assert.deepEqual(
    last?.rows.map((row) => `${row.kind} ${row.table}`),
    ['added orders', 'added notes', 'added lines'],
  )
  const theirs = readingFiles(second, desk)
  assert.deepEqual(
    at(theirs, 'orders')
      .of(s.north)
      .all()
      .map((row) => row.total),
    [10, 20],
  )
  assert.equal(at(theirs, 'notes').of(s.north).get(String(made.note.id))?.text, 'the first note')
  assert.equal(at(theirs, 'lines').of(s.north).get(String(made.line.id))?.order, made.order.id)
  assert.deepEqual(
    at(theirs, 'orders')
      .of(s.north)
      .near('meaning', [0, 0, 1, 0])
      .limit(1)
      .all()
      .map((row) => row.id),
    [made.order.id],
  )
  sameFiles(first, second)
})

test('[50-2] the export of a person holds their rows of every file', async (t) => {
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  write((db) => at(db, 'notes').of(s.north).add({ author: s.ada, text: 'north' }))
  write((db) => at(db, 'notes').of(s.south).add({ author: s.ada, text: 'south' }))
  write((db) => at(db, 'notes').of(s.south).add({ author: s.bob, text: 'of Bob' }))
  for (const file of files.open()) files.close(file)
  const ada = await exportUser(files, desk, s.ada)
  assert.equal(ada.user?.name, 'Ada')
  // `notes` is the one table that states an owner: her notes of both tenants, and no note of Bob.
  assert.deepEqual(Object.keys(ada.rows), ['notes'])
  assert.deepEqual(ada.rows.notes.map((row) => row.text).sort(), ['north', 'south'])
  assert.deepEqual(ada.rows.notes.map((row) => row.team).sort(), [s.north, s.south].sort())
  assert.deepEqual((await exportUser(files, desk, s.cy)).rows, { notes: [] })
  // The files were read alone: none of them is left open.
  assert.deepEqual(files.open(), [])
})

test('[50-2] a file that the engine holds back is not ready: of throws NotReady with the file, and the file is not left open', (t) => {
  let ready = true
  const asked: string[] = []
  const files = filesOf(t, desk, {
    before(file, store) {
      // The file is handed with its store, before anything reads it.
      asked.push(`${file.id} ${store.read({ from: 'orders', count: true }, system).value}`)
      return ready ? 'ready' : 'wait'
    },
  })
  const s = seedDesk(files, desk)
  const north = teamFile(s.north)
  // A file that is made stands at the running layout: nothing is asked of it.
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 10 }))
  assert.deepEqual(asked, [])
  files.close(north)
  const db = readingFiles(files, desk)
  assert.equal(at(db, 'orders').of(s.north).count(), 1)
  assert.deepEqual(asked, [`${s.north} 1`])
  // While it is open it is asked nothing more.
  assert.equal(at(db, 'orders').of(s.north).count(), 1)
  assert.equal(asked.length, 1)

  files.close(north)
  ready = false
  let thrown: unknown
  try {
    at(db, 'orders').of(s.north).count()
  } catch (error) {
    thrown = error
  }
  assert.ok(thrown instanceof NotReady)
  assert.deepEqual(thrown.file, north)
  assert.deepEqual(files.open(), [])
  // A write for that file is held back the same way, and writes nothing.
  assert.throws(() => writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 11 })), NotReady)
  ready = true
  assert.equal(at(db, 'orders').of(s.north).count(), 1)
})
