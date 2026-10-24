import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { calc, caller, col, link, list, number, project, role, table, text, where } from '../../core/index.ts'
import type { FileName } from '../index.ts'
import { appOf, filesOf, person, readingFiles, seedDesk, teamFile, writingFiles } from './apart.ts'
import { at, described } from './shop.ts'
import { codeOf } from './work.ts'

const desk = appOf()

test('[50-3] a rule that reads members of the shared file lets a member read the rows of their team and nobody else, and a caller who names another team opens no file and makes none', (t) => {
  const opened: FileName[] = []
  const marked: FileName[] = []
  const files = filesOf(t, desk, { opened: (file) => opened.push(file), writing: (file) => marked.push(file) })
  const s = seedDesk(files, desk)
  const asSystem = writingFiles(files, desk)
  const [north, south, east] = [teamFile(s.north), teamFile(s.south), teamFile(s.east)]
  const mine = asSystem((db) => at(db, 'orders').of(s.north).add({ total: 10, note: 'of north' }))
  const theirs = asSystem((db) => at(db, 'orders').of(s.south).add({ total: 20, note: 'of south' }))
  const ada = readingFiles(files, desk, person(s.ada))
  const bob = readingFiles(files, desk, person(s.bob))
  const cy = readingFiles(files, desk, person(s.cy))
  const visitor = readingFiles(files, desk, { kind: 'nobody' })
  const ids = (db: object, tenant: string) =>
    at(db, 'orders')
      .of(tenant)
      .all()
      .map((row) => row.id)

  // A member reads the rows of their team.
  assert.deepEqual(ids(ada, s.north), [mine.id])
  assert.deepEqual(ids(bob, s.south), [theirs.id])
  assert.equal(at(ada, 'orders').of(s.north).get(String(mine.id))?.note, 'of north')
  assert.equal(at(ada, 'orders').of(s.north).count(), 1)

  // Nobody else does, and no file is opened for a caller who names a team they are no member of.
  for (const file of files.open()) files.close(file)
  opened.length = 0
  assert.deepEqual(ids(ada, s.south), [])
  assert.deepEqual(ids(bob, s.north), [])
  assert.deepEqual(ids(cy, s.north), [])
  assert.deepEqual(ids(visitor, s.north), [])
  assert.equal(at(bob, 'orders').of(s.north).get(String(mine.id)), undefined)
  assert.equal(at(bob, 'orders').of(s.north).count(), 0)
  assert.deepEqual(at(bob, 'orders').of(s.north).search('north').all(), [])
  assert.deepEqual(at(bob, 'orders').of(s.north).history(String(mine.id)), [])
  assert.deepEqual(files.open(), [])
  assert.deepEqual(opened, [])
  // The same read by a member opens the file.
  assert.deepEqual(ids(ada, s.north), [mine.id])
  assert.deepEqual(files.open(), [north])
  assert.deepEqual(opened, [north])

  // An add by such a caller is refused, and makes no file. A change and a removal find no row, and open none.
  marked.length = 0
  const asBob = writingFiles(files, desk, person(s.bob))
  const asAda = writingFiles(files, desk, person(s.ada))
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of(s.east).add({ total: 1 }))),
    'T3101',
  )
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of(s.north).add({ total: 1 }))),
    'T3101',
  )
  assert.equal(files.has(east), false)
  assert.deepEqual(marked, [])
  files.close(north)
  opened.length = 0
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of(s.north).change(String(mine.id), { total: 0 }))),
    'T2103',
  )
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of(s.north).remove(String(mine.id)))),
    'T2103',
  )
  assert.deepEqual(opened, [])
  // A caller who guesses ids of tenants learns nothing from the code, and makes nothing.
  const guessed = `${s.north.slice(0, 25)}${s.north.endsWith('0') ? '1' : '0'}`
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of(guessed).add({ total: 1 }))),
    'T3101',
  )
  assert.equal(
    codeOf(() => asBob((db) => at(db, 'orders').of('../x').add({ total: 1 }))),
    'T3101',
  )
  assert.deepEqual(files.open(), [])

  // A member writes the rows of their team, and the file of a new tenant is made by a write that passed its rule.
  assert.equal(asAda((db) => at(db, 'orders').of(s.north).change(String(mine.id), { total: 11 })).total, 11)
  assert.equal(asBob((db) => at(db, 'orders').of(s.south).add({ total: 21 })).team, s.south)
  asSystem((db) => at(db, 'members').add({ team: s.east, user: s.cy }))
  assert.equal(files.has(east), false)
  marked.length = 0
  const asCy = writingFiles(files, desk, person(s.cy))
  assert.equal(asCy((db) => at(db, 'orders').of(s.east).add({ total: 30 })).team, s.east)
  assert.equal(files.has(east), true)
  // The engine is told of a file before it is made, and before its first write since it was opened.
  assert.deepEqual(marked, [east])
  assert.deepEqual(ids(cy, s.east).length, 1)
  assert.deepEqual(ids(cy, s.north), [])
  assert.deepEqual(files.has(south), true)
})

test('[50-3] a rule of a table of lines that reads its orders, written without of, lets in who may read the order', (t) => {
  const opened: FileName[] = []
  const files = filesOf(t, desk, { opened: (file) => opened.push(file) })
  const s = seedDesk(files, desk)
  const asSystem = writingFiles(files, desk)
  const made = asSystem((db) => {
    const open = at(db, 'orders').of(s.north).add({ total: 10 })
    const paid = at(db, 'orders').of(s.north).add({ total: 20, status: 'paid' })
    return {
      open,
      paid,
      first: at(db, 'lines').of(s.north).add({ order: open.id, qty: 1 }),
      second: at(db, 'lines').of(s.north).add({ order: paid.id, qty: 2 }),
    }
  })
  const far = asSystem((db) => {
    const order = at(db, 'orders').of(s.south).add({ total: 30 })
    return at(db, 'lines').of(s.south).add({ order: order.id, qty: 3 })
  })
  const ada = readingFiles(files, desk, person(s.ada))
  const bob = readingFiles(files, desk, person(s.bob))
  const lines = (db: object, tenant: string) =>
    at(db, 'lines')
      .of(tenant)
      .all()
      .map((row) => row.id)

  // The plan inside the rule is read in the file the rule is applied in, under the reader's own rule of `orders`:
  // Ada reads the line of the open order of her team, and not the line of the paid one.
  assert.deepEqual(lines(ada, s.north), [made.first.id])
  assert.deepEqual(lines(bob, s.south), [far.id])
  assert.equal(at(ada, 'lines').of(s.north).get(String(made.second.id)), undefined)
  // With full access no rule is asked.
  assert.deepEqual(lines(readingFiles(files, desk), s.north), [made.first.id, made.second.id])

  // Who may not read the order reads no line of it, and no file is opened for them.
  for (const file of files.open()) files.close(file)
  opened.length = 0
  assert.deepEqual(lines(bob, s.north), [])
  assert.deepEqual(lines(ada, s.south), [])
  assert.equal(at(bob, 'lines').of(s.north).count(), 0)
  assert.deepEqual(opened, [])
  assert.deepEqual(files.open(), [])

  // A tenant whose file holds no table of orders yet: the rule reads no row, and fails nothing.
  asSystem((db) => at(db, 'members').add({ team: s.east, user: s.ada }))
  asSystem((db) => at(db, 'tasks').of(s.east).add({ title: 'one' }))
  assert.deepEqual(lines(ada, s.east), [])
  assert.equal(at(ada, 'tasks').of(s.east).count(), 1)
})

test('[50-3] the rule of an add is asked of the row before the file of its tenant is made, whatever the rule reads: the row itself, the shared file by a plan, the shared file through a link, and a column that is worked out', (t) => {
  const members = table('members', {
    columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
    access: { read: 'signedIn', add: role('admin') },
  })
  const open = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
  const byTeam = (name: string, columns: Record<string, Type>, add: ReturnType<typeof where>) =>
    table(name, {
      columns: { team: link('teams', { onRemove: 'remove' }), ...columns },
      tenant: 'team',
      access: { ...open, add },
    })
  // No rule here names the tenant, so none is answered by the tenant of `of` alone.
  const yard = described([
    project('yard', {}),
    table('users', {
      columns: { name: text(), roles: list(text()) },
      access: { read: 'signedIn', add: role('admin') },
    }),
    table('teams', { columns: { name: text() }, access: { read: 'signedIn', add: role('admin') } }),
    members,
    byTeam('drops', { kind: text() }, where({ kind: 'fine' })),
    byTeam(
      'notes',
      { author: link('users', { onRemove: 'remove' }) },
      where({ author: { in: members.where({ user: caller('id') }).pick(['user']) } }),
    ),
    byTeam('cards', { holder: link('users', { onRemove: 'remove' }) }, where({ 'holder.name': 'Ada' })),
    // A column that the store works out from the row is asked of the row as the store would hold it.
    byTeam(
      'bills',
      { net: number(), gross: number({ from: calc('*', col('net'), 2) }) },
      where({ gross: { above: 10 } }),
    ),
  ])
  const marked: FileName[] = []
  const files = filesOf(t, yard, { writing: (file) => marked.push(file) })
  const s = writingFiles(
    files,
    yard,
  )((db) => {
    const add = (name: string, values: Record<string, unknown>) => String(at(db, name).add(values).id)
    const [ada, bob] = ['Ada', 'Bob'].map((name) => add('users', { name }))
    const [north, east, west, far, out] = ['North', 'East', 'West', 'Far', 'Out'].map((name) => add('teams', { name }))
    add('members', { team: north, user: ada })
    return { ada, bob, north, east, west, far, out }
  })
  // A file that is open stays open, and is no file of the tenants that are written below.
  writingFiles(files, yard)((db) => at(db, 'drops').of(s.north).add({ kind: 'fine' }))
  assert.deepEqual(files.open(), [teamFile(s.north)])
  marked.length = 0

  // Each row is added by Ada, a member of North, for a tenant with no file: first one that the rule refuses.
  const cases: [string, string, Record<string, unknown>, Record<string, unknown>][] = [
    ['drops', s.east, { kind: 'not fine' }, { kind: 'fine' }],
    ['notes', s.west, { author: s.bob }, { author: s.ada }],
    ['cards', s.far, { holder: s.bob }, { holder: s.ada }],
    ['bills', s.out, { net: 5 }, { net: 6 }],
  ]
  const noted: unknown[] = []
  const write = writingFiles(files, yard, person(s.ada), { noted: (one) => noted.push(one) })
  for (const [name, tenant, refused, fits] of cases) {
    const [file, stood] = [teamFile(tenant), files.open()]
    noted.length = 0
    assert.equal(
      codeOf(() => write((db) => at(db, name).of(tenant).add(refused))),
      'T3101',
      name,
    )
    assert.equal(files.has(file), false, name)
    assert.deepEqual(marked, [], name)
    assert.deepEqual(files.open(), stood, name)
    assert.deepEqual(noted.splice(0), [{ kind: 'refused', table: name, what: 'add', rule: 'where' }], name)
    // A row that fits the rule makes the file, and the engine is told of it first.
    assert.equal(write((db) => at(db, name).of(tenant).add(fits)).team, tenant, name)
    assert.equal(files.has(file), true, name)
    assert.deepEqual(marked.splice(0), [file], name)
    // In the file that now stands the rule refuses the same row, and nothing of it stays.
    assert.equal(
      codeOf(() => write((db) => at(db, name).of(tenant).add(refused))),
      'T3101',
      name,
    )
    assert.equal(at(readingFiles(files, yard), name).of(tenant).count(), 1, name)
  }
  // A caller who is no member of any team fits the rule of `notes` for no row, and makes no file by trying.
  const south = String(writingFiles(files, yard)((db) => at(db, 'teams').add({ name: 'South' })).id)
  assert.equal(
    codeOf(() => writingFiles(files, yard, person(s.bob))((db) => at(db, 'notes').of(south).add({ author: s.bob }))),
    'T3101',
  )
  assert.equal(files.has(teamFile(south)), false)
  assert.deepEqual(marked, [])
})

test('[50-3] a read for a tenant whose row is gone opens no file, also where the rule of the table holds a plan on a table of the same file: the tenant is asked before anything of the file is read', (t) => {
  const open = { read: 'signedIn', add: 'signedIn', change: 'signedIn', remove: 'signedIn' } as const
  const team = () => link('teams', { onRemove: 'remove' })
  const tasks = table('tasks', { columns: { team: team(), title: text() }, tenant: 'team', access: open })
  const yard = described([
    project('yard', {}),
    table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } }),
    table('teams', { columns: { name: text() }, access: { read: 'signedIn' } }),
    tasks,
    // A mark is read while its task is open: the plan is read in the file that the rule is applied in.
    table('marks', {
      columns: { team: team(), task: link('tasks', { onRemove: 'remove' }) },
      tenant: 'team',
      access: { ...open, read: where({ task: { in: tasks.where({ title: 'open' }).pick(['id']) } }) },
    }),
  ])
  const opened: FileName[] = []
  const files = filesOf(t, yard, { opened: (file) => opened.push(file) })
  const asSystem = writingFiles(files, yard)
  const s = asSystem((db) => ({
    ada: String(at(db, 'users').add({ name: 'Ada' }).id),
    north: String(at(db, 'teams').add({ name: 'North' }).id),
  }))
  const mark = asSystem((db) => {
    const task = at(db, 'tasks').of(s.north).add({ title: 'open' }).id
    return String(at(db, 'marks').of(s.north).add({ task }).id)
  })
  const marks = () => at(readingFiles(files, yard, person(s.ada)), 'marks').of(s.north)
  assert.deepEqual(
    marks()
      .all()
      .map((row) => row.id),
    [mark],
  )
  // The row of the tenant goes, and its file stands, closed.
  asSystem((db) => at(db, 'teams').remove(s.north))
  for (const file of files.open()) files.close(file)
  opened.length = 0
  assert.equal(files.has(teamFile(s.north)), true)
  assert.deepEqual(marks().all(), [])
  assert.equal(marks().count(), 0)
  assert.equal(marks().get(mark), undefined)
  assert.deepEqual(
    marks()
      .where({ task: { in: tasks.of(s.north).pick(['id']) } })
      .all(),
    [],
  )
  assert.deepEqual(readingFiles(files, yard, person(s.ada)).read({ from: 'marks', of: s.north }), [])
  assert.deepEqual(opened, [])
  assert.deepEqual(files.open(), [])
})
