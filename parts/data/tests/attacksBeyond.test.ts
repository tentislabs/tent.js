import assert from 'node:assert/strict'
import { test } from 'node:test'
import { count } from '../../core/index.ts'
import type { FileName } from '../index.ts'
import { createDb } from '../index.ts'
import { filesOf, person, readingFiles, storedIn, teamFile, writingFiles } from './apart.ts'
import { board, rawOf, seedBoard } from './board.ts'
import { at } from './shop.ts'
import { codeOf, system } from './work.ts'

test('[50-12.8] the id of a tenant whose row is gone names no tenant: where its file still stands, a read answers no rows and a write is T2104', (t) => {
  const files = filesOf(t, board)
  const s = seedBoard(files)
  const asSystem = writingFiles(files, board)
  const task = asSystem((db) => at(db, 'tasks').of(s.south).add({ title: 'of south' }))
  const south = teamFile(s.south)
  // The row of the tenant is removed. Removing its file is the work of the engine, after this write: until
  // then, and after a stop between the two, the file stands with no tenant.
  asSystem((db) => at(db, 'teams').remove(s.south))
  assert.equal(at(readingFiles(files, board), 'teams').get(s.south), undefined)
  const held = files.has(south) ? storedIn(files.of(south), 'tasks') : []

  for (const closed of [false, true]) {
    if (closed) for (const file of files.open()) files.close(file)
    // A caller in no team, who reads and writes the tasks of every team, a former member, and the system.
    for (const who of [person(s.cy), person(s.bob), system]) {
      const reads = readingFiles(files, board, who)
      const what = `${who.kind === 'system' ? 'the system' : who.user?.id}${closed ? ', the file closed' : ''}`
      assert.deepEqual(at(reads, 'tasks').of(s.south).all(), [], what)
      assert.equal(at(reads, 'tasks').of(s.south).count(), 0, what)
      assert.equal(at(reads, 'tasks').of(s.south).get(String(task.id)), undefined, what)
      assert.deepEqual(at(reads, 'tasks').of(s.south).search('south').all(), [], what)
      assert.deepEqual(at(reads, 'orders').of(s.south).all(), [], what)
      const write = writingFiles(files, board, who)
      assert.equal(
        codeOf(() => write((db) => at(db, 'tasks').of(s.south).add({ title: 'for nobody' }))),
        'T2104',
        what,
      )
      assert.equal(
        codeOf(() => write((db) => at(db, 'tasks').of(s.south).change(String(task.id), { title: 'for nobody' }))),
        'T2104',
        what,
      )
      assert.equal(
        codeOf(() => write((db) => at(db, 'tasks').of(s.south).remove(String(task.id)))),
        'T2104',
        what,
      )
    }
    assert.equal(
      codeOf(() => rawOf(files)('select count(*) c from tasks', [], { of: s.south })),
      'T2104',
    )
  }
  // No row was written into the file of nobody.
  if (files.has(south)) assert.deepEqual(storedIn(files.of(south), 'tasks'), held)
})

test('[50-12.9] an add that its rule refuses makes no file: a file is made only by a write that has passed its rule', (t) => {
  const marked: FileName[] = []
  const files = filesOf(t, board, { writing: (file) => marked.push(file) })
  const s = seedBoard(files)
  const east = teamFile(s.east)
  assert.equal(files.has(east), false)
  for (const file of files.open()) files.close(file)
  marked.length = 0
  // The rule of `drops` names no tenant: it asks of the row itself, and this row does not fit it.
  for (const who of [person(s.bob), person(s.cy)]) {
    const write = writingFiles(files, board, who)
    assert.equal(
      codeOf(() => write((db) => at(db, 'drops').of(s.east).add({ kind: 'not fine' }))),
      'T3101',
    )
    assert.equal(files.has(east), false)
    assert.deepEqual(marked, [])
    assert.deepEqual(files.open(), [])
  }
  // A row that fits the rule makes the file.
  assert.equal(
    writingFiles(files, board, person(s.bob))((db) => at(db, 'drops').of(s.east).add({ kind: 'fine' })).team,
    s.east,
  )
  assert.equal(files.has(east), true)
  assert.deepEqual(marked, [east])
})

test('[20-3] [50-3] in the files of tenants nothing is told of a row that the caller may not read: by no link, filter, sort, group, with, search or near, and of no private column', (t) => {
  const opened: FileName[] = []
  const files = filesOf(t, board, { opened: (file) => opened.push(file) })
  const s = seedBoard(files)
  const bob = readingFiles(files, board, person(s.bob))
  const ada = readingFiles(files, board, person(s.ada))
  const titles = (rows: { title?: unknown }[]) => rows.map((row) => row.title)
  const all = ['one', 'two', 'three', 'four']

  // Bob is no member of North. He reads its tasks, and nothing of its orders, its lines and its people.
  for (const file of files.open()) files.close(file)
  opened.length = 0
  const orders = at(bob, 'orders').of(s.north)
  assert.deepEqual(orders.all(), [])
  assert.equal(orders.count(), 0)
  assert.equal(orders.get(s.secret), undefined)
  assert.deepEqual(orders.search('secret').all(), [])
  assert.deepEqual(orders.near('meaning', [1, 0, 0, 0]).limit(3).all(), [])
  assert.deepEqual(orders.history(s.secret), [])
  assert.deepEqual(orders.group('status', { n: count() }).all(), [])
  assert.deepEqual(orders.sort('total').limit(2).after(undefined).all(), { rows: [] })
  assert.deepEqual(at(bob, 'lines').of(s.north).all(), [])
  assert.equal(at(bob, 'lines').of(s.north).count(), 0)
  assert.deepEqual(opened, [])

  const tasks = at(bob, 'tasks').of(s.north)
  assert.deepEqual(titles(tasks.all()), all)
  // `with` holds the id he already had, and nothing more: of an order, a line, a user, and a user behind an order.
  for (const name of ['order', 'line', 'assignee', 'order.placedBy'])
    for (const row of tasks.with(name).all()) {
      const linked = row[name.split('.')[0]]
      assert.ok(linked === undefined || linked === null || Object.keys(Object(linked)).join() === 'id', name)
    }
  // A filter through a link fits no row, whatever it asks; turned round it fits every row, whatever the row holds.
  for (const filter of [
    { 'order.note': 'secret plan' },
    { 'order.note': { startsWith: 's' } },
    { 'order.total': { above: 0 } },
    { 'order.id': s.secret },
    { 'order.createdAt': { above: new Date(0) } },
    { 'order.status': 'open' },
    { 'line.qty': 3 },
    { 'line.order.note': 'secret plan' },
    { 'line.order.status': 'paid' },
    { 'order.placedBy.name': 'Ada' },
    { 'assignee.name': 'Ada' },
    { 'assignee.name': { startsWith: 'A' } },
    { any: [{ 'order.note': 'secret plan' }, { 'line.qty': 8 }, { 'assignee.name': 'Cy' }] },
    { not: { not: { 'order.note': 'secret plan' } } },
    { order: { in: at(bob, 'orders').of(s.north).where({ note: 'secret plan' }).pick(['id']) } },
    { title: { in: at(bob, 'orders').of(s.north).pick(['note']) } },
    { line: { in: at(bob, 'lines').of(s.north).pick(['id']) } },
  ]) {
    assert.deepEqual(tasks.where(filter).all(), [], JSON.stringify(Object.keys(filter)))
    assert.equal(tasks.count(filter), 0, JSON.stringify(Object.keys(filter)))
  }
  // A pick reads through no link: a path in it is refused, alone and in a plan inside `in`.
  assert.equal(
    codeOf(() => tasks.pick(['order.note']).all()),
    'T1014',
  )
  assert.equal(
    codeOf(() => tasks.where({ title: { in: at(bob, 'tasks').of(s.north).pick(['order.note']) } }).all()),
    'T1014',
  )
  assert.deepEqual(titles(tasks.where({ not: { 'order.note': 'secret plan' } }).all()), all)
  assert.deepEqual(titles(tasks.where({ not: { 'order.note': 'no such note' } }).all()), all)
  // A sort leaves the rows in the order they were added, and a group has one key for them all.
  for (const by of ['order.total', 'order.note', 'order.createdAt', 'line.qty']) {
    assert.deepEqual(titles(tasks.sort(by).all()), all, by)
    assert.deepEqual(titles(tasks.newest(by).all()), all, by)
    assert.deepEqual(tasks.group(by, { n: count() }).all(), [{ n: 4 }], by)
  }
  // A private column: through a link it is refused in a filter and a sort, and left out of a group.
  assert.equal(
    codeOf(() => tasks.where({ 'order.cost': 7 }).all()),
    'T0013',
  )
  assert.equal(
    codeOf(() => tasks.where({ 'assignee.salary': 5000 }).all()),
    'T0013',
  )
  assert.equal(
    codeOf(() => tasks.sort('order.cost').all()),
    'T0013',
  )
  assert.equal(
    codeOf(() => tasks.where({ title: { in: at(bob, 'orders').of(s.north).pick(['cost']) } }).all()),
    'T0013',
  )
  assert.equal(
    codeOf(() => tasks.group('order.cost', { n: count() }).all()),
    'T0013',
  )
  // A plan inside a filter names its tenant: one that names none is refused, and is not read in this file.
  assert.equal(
    codeOf(() => tasks.where({ order: { in: at(bob, 'orders').pick(['id']) } }).all()),
    'T2109',
  )
  // A search of the builder's own that answers the ids of another tenant gives no row of that tenant.
  const asked: string[] = []
  const found = createDb(
    files,
    board,
    person(s.bob),
    'read',
    {},
    {
      searcher: {
        has: () => true,
        wrote() {},
        find(name) {
          asked.push(name)
          return [s.secret, s.first, s.far]
        },
      },
    },
  )
  // For a tenant that his rule does not reach it is not asked at all.
  assert.deepEqual(at(found, 'orders').of(s.north).search('plan').all(), [])
  assert.deepEqual(asked, [])
  assert.deepEqual(titles(at(found, 'tasks').of(s.south).search('one').all()), [])
  assert.deepEqual(titles(at(found, 'tasks').of(s.north).search('one').all()), ['one'])

  // Ada is a member of North: she reads its orders, and a line while its order is open. Of the line of the paid
  // order, of the user Cy and of a private column she is told as little.
  const hers = at(ada, 'tasks').of(s.north)
  assert.deepEqual(titles(hers.where({ 'order.note': 'secret plan' }).all()), ['one'])
  assert.deepEqual(titles(hers.where({ 'line.qty': 3 }).all()), ['one'])
  for (const filter of [
    { 'line.qty': 8 },
    { 'line.order.note': 'paid thing' },
    { 'assignee.name': 'Cy' },
    { 'order.placedBy.name': 'Cy' },
  ])
    assert.deepEqual(hers.where(filter).all(), [], JSON.stringify(filter))
  assert.deepEqual(
    hers
      .with('line', 'assignee')
      .all()
      .map((row) => [Object.keys(Object(row.line)).length > 1, Object.keys(Object(row.assignee)).length > 1]),
    [
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ],
  )
  assert.deepEqual(hers.group('line.qty', { n: count() }).all(), [{ n: 3 }, { 'line.qty': 3, n: 1 }])
  assert.deepEqual(titles(hers.sort('line.qty').all()), ['two', 'three', 'four', 'one'])
  const own = at(ada, 'orders').of(s.north)
  assert.equal(own.count(), 3)
  for (const row of [...own.all(), ...own.pick(['cost', 'note']).all()]) assert.equal('cost' in row, false)
  assert.equal(
    codeOf(() => own.group('cost', { n: count() }).all()),
    'T0013',
  )
  for (const row of hers.with('order').all()) assert.equal('cost' in Object(row.order), false)
  writingFiles(files, board, person(s.ada))((db) => at(db, 'orders').of(s.north).change(s.secret, { total: 11 }))
  const [version] = own.history(s.secret)
  assert.equal(version.value.total, 10)
  assert.equal('cost' in version.value, false)
  assert.equal(
    codeOf(() => own.sort('cost').all()),
    'T0013',
  )
  // Of the other team she reads nothing, and its file is not opened for her.
  for (const file of files.open()) files.close(file)
  opened.length = 0
  assert.deepEqual(at(ada, 'orders').of(s.south).all(), [])
  assert.deepEqual(titles(hers.where({ title: { in: at(ada, 'orders').of(s.south).pick(['note']) } }).all()), [])
  assert.deepEqual(at(ada, 'lines').of(s.south).all(), [])
  assert.deepEqual(opened, [])
})
