import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { boolean, link, list, number, table, text } from '../../core/index.ts'
import { addUser, codeOf, nobody, running, system, userOf, workFolder } from './apps.ts'

// The tables of the project of the tests, as a program that holds the app writes plans and writes with them.
const users = table('users', { columns: { name: text(), roles: list(text()), salary: number({ optional: true }) } })
const notes = table('notes', { columns: { title: text(), owner: link('users'), done: boolean({ default: false }) } })
const tags = table('tags', { columns: { name: text() } })

const named = (rows: unknown, column = 'title'): string[] =>
  Array.isArray(rows) ? rows.map((row) => String(Object(row)[column])) : []

test('[21-19] app.read and app.write pass the table rules for the caller they name, and none for the system', async (t) => {
  const { app, engine } = await running(t)
  const ada = await addUser(app, 'Ada', ['staff'], 5000)
  const bob = await addUser(app, 'Bob', [], 4000)
  const heard: string[] = []
  engine.on('row.changed', (told) => void heard.push(`${told.kind} ${told.table}`))
  engine.on('change.done', (told) => void heard.push(`done ${told.name}`))

  // A write as a caller passes the rules of its table: a note is added by whoever is signed in, and is theirs.
  const [mine] = Object(await app.write([notes.add({ title: 'of Ada' })], { as: ada }))
  assert.equal(mine.owner, ada.user?.id)
  const both = await app.write([notes.add({ title: 'of Bob' }), notes.add({ title: 'of Bob too' })], { as: bob })
  assert.deepEqual(named(both), ['of Bob', 'of Bob too'])
  assert.equal(await codeOf(app.write([notes.add({ title: 'of nobody' })], { as: nobody })), 'T3101')
  assert.equal(await codeOf(app.write([tags.add({ name: 'not staff' })], { as: bob })), 'T3101')
  assert.equal(Object(await app.write([tags.add({ name: 'by staff' })], { as: ada }))[0].name, 'by staff')
  // A row of another is not found for a change, and a list of writes is one write: it is undone whole.
  assert.equal(await codeOf(app.write([notes.change(mine.id, { done: true })], { as: bob })), 'T2103')
  const half = app.write([notes.add({ title: 'never kept' }), notes.remove(mine.id)], { as: bob })
  assert.equal(await codeOf(half), 'T2103')
  // A caller cannot give themselves a role, and the system writes what it likes.
  const bobId = String(bob.user?.id)
  assert.equal(await codeOf(app.write([users.change(bobId, { roles: ['staff'] })], { as: bob })), 'T3101')
  await app.write([users.change(bobId, { roles: ['staff'] }), notes.change(mine.id, { done: true })], { as: 'system' })
  // The rows of a write are told to whoever listens, and no change is, since none was called.
  assert.deepEqual(heard, ['added notes', 'added notes', 'added notes', 'added tags', 'changed users', 'changed notes'])

  // A read as a caller answers the rows that the rule lets them read, and no `private` column.
  assert.deepEqual(named(await app.read(notes.oldest('createdAt'), { as: ada })), ['of Ada'])
  assert.deepEqual(named(await app.read(notes.oldest('createdAt'), { as: bob })), ['of Bob', 'of Bob too'])
  assert.deepEqual(await app.read(notes, { as: nobody }), [])
  assert.equal(await app.read(notes.count(), { as: bob }), 2)
  assert.equal(Object(await app.read(notes.get(mine.id), { as: ada })).done, true)
  assert.equal(await app.read(notes.get(mine.id), { as: bob }), undefined)
  const seen = await app.read(users.sort('name'), { as: ada })
  assert.deepEqual(named(seen, 'name'), ['Ada', 'Bob'])
  assert.deepEqual(named(seen, 'salary'), ['undefined', 'undefined'])
  // As the system it answers every row, and only then a `private` column.
  for (const as of ['system', system] as const) {
    assert.deepEqual(named(await app.read(notes.oldest('createdAt'), { as })), ['of Ada', 'of Bob', 'of Bob too'])
    assert.deepEqual(named(await app.read(users.sort('name'), { as }), 'salary'), ['5000', '4000'])
    assert.deepEqual(Object(await app.read(users.get(bobId), { as })).roles, ['staff'])
  }
  // What is no plan and no write is refused, and so is a table that the app does not have.
  assert.equal(await codeOf(app.read({ plan: 'notes' }, { as: system })), 'T0013')
  assert.equal(await codeOf(app.write([{ add: 5 }], { as: system })), 'T0013')
  assert.equal(await codeOf(Reflect.apply(app.write, app, [notes.add({ title: 'x' }), { as: system }])), 'T0013')
})

test('[21-19] app.seed applies the seed of the running version in each of its forms, as the system', async (t) => {
  // A list of writes: each row is added as the system, whatever the rules of its table, and nothing is told.
  const listed = await running(t, { seed: 'seed-list.ts' })
  assert.deepEqual(Object.keys(Object(listed.bundle.description.seed)), ['writes'])
  const heard: string[] = []
  listed.engine.on('row.changed', (told) => void heard.push(`${told.kind} ${told.table}`))
  listed.engine.on('change.done', (told) => void heard.push(`done ${told.name}`))
  assert.deepEqual(await listed.app.read(users, { as: 'system' }), [])
  await listed.app.seed()
  assert.deepEqual(named(await listed.app.read(users.sort('name'), { as: 'system' }), 'name'), ['Ada', 'Bob'])
  assert.deepEqual(named(await listed.app.read(users.sort('name'), { as: 'system' }), 'salary'), ['5000', 'undefined'])
  assert.deepEqual(named(await listed.app.read(tags, { as: 'system' }), 'name'), ['from the list'])
  assert.deepEqual(heard, [])
  // The engine applies it whenever it is asked to, and only then: a second asking adds the rows again.
  await listed.app.seed()
  assert.equal(await listed.app.read(users.count(), { as: 'system' }), 4)

  // An arrow that is code: `db` writes with full access, `call` calls as the system, and `now` is the moment.
  const coded = await running(t, { seed: 'seed-code.ts' })
  assert.deepEqual(Object.keys(Object(coded.bundle.description.seed)), ['module'])
  const told: string[] = []
  coded.engine.on('row.changed', (one) => void told.push(`${one.kind} ${one.table}`))
  coded.engine.on('change.done', (one) => void told.push(`done ${one.name}`))
  const before = Date.now()
  await coded.app.seed()
  const seeded = named(await coded.app.read(notes.oldest('createdAt'), { as: 'system' }))
  assert.equal(seeded.length, 2)
  const at = Date.parse(seeded[0].replace('seeded at ', ''))
  assert.ok(at >= before && at <= Date.now())
  assert.equal(seeded[1], 'one of 1')
  assert.deepEqual(named(await coded.app.read(tags.oldest('createdAt'), { as: 'system' }), 'name'), [
    'by a call',
    'after 2 notes',
  ])
  // A write of `db` is a write of its own and tells nobody: only what `call` reached is told.
  assert.deepEqual(told, ['added tags', 'done addTag'])

  // An arrow that was read: it names a row it added, and no module is loaded for it.
  const body = [
    {
      const: 'ada',
      value: {
        plan: { db: 'users' },
        then: [
          {
            add: [
              {
                object: [
                  ['name', 'Ada'],
                  ['roles', []],
                ],
              },
            ],
          },
        ],
      },
    },
    {
      do: {
        plan: { db: 'notes' },
        then: [
          {
            add: [
              {
                object: [
                  ['title', { text: ['of ', { name: ['ada', 'name'] }, ' at ', { name: ['now'] }] }],
                  ['owner', { name: ['ada', 'id'] }],
                ],
              },
            ],
          },
        ],
      },
    },
  ]
  const read = await running(t, { seed: 'seed-code.ts', bodies: { seed: { run: body } } })
  assert.deepEqual(Object.keys(Object(read.bundle.description.seed)), ['body'])
  await read.app.seed()
  const [note] = Object(await read.app.read(notes.with('owner'), { as: 'system' }))
  assert.match(note.title, /^of Ada at /)
  assert.equal(note.owner.name, 'Ada')

  // An app with no seed has nothing to apply.
  const none = await running(t)
  await none.app.seed()
  assert.equal(await none.app.read(users.count(), { as: 'system' }), 0)
})

test('[21-19] app.snapshot writes the data file out, and app.restore puts it back under the running app', async (t) => {
  const work = workFolder(t)
  const { app, dataFolder } = await running(t, { seed: 'seed-list.ts' })
  await app.seed()
  const ada = Object(await app.read(users.where({ name: 'Ada' }).first(), { as: 'system' }))
  const caller = userOf(String(ada.id), ['staff'])
  await app.call('addNote', { title: 'before the snapshot' }, { as: caller })

  // The snapshot answers the number of the last write that it holds, which a later write does not move.
  const file = join(work, 'snapshots', 'first.db')
  const first = await app.snapshot(file)
  assert.ok(existsSync(file))
  assert.ok(Number.isInteger(first.writes) && first.writes >= 4)
  await app.call('addNote', { title: 'after the snapshot' }, { as: caller })
  await app.write([tags.add({ name: 'later' }), users.change(String(ada.id), { name: 'Ada the second' })], {
    as: 'system',
  })
  const second = await app.snapshot(join(work, 'snapshots', 'second.db'))
  assert.equal(second.writes, first.writes + 2)

  // The file is put back: the rows are those of the snapshot, the app answers on, and it writes again.
  await app.restore(file)
  assert.deepEqual(named(await app.read(notes.oldest('createdAt'), { as: 'system' })), ['before the snapshot'])
  assert.deepEqual(named(await app.read(tags, { as: 'system' }), 'name'), ['from the list'])
  assert.deepEqual(named(await app.read(users.sort('name'), { as: 'system' }), 'name'), ['Ada', 'Bob'])
  assert.equal(await app.call('countNotes', {}, { as: caller }), 1)
  await app.call('addNote', { title: 'after the restore' }, { as: caller })
  assert.equal((await app.snapshot(join(work, 'snapshots', 'third.db'))).writes, first.writes + 1)
  // A query thread reads the data that was put back.
  assert.deepEqual(named(await app.call('heavyNotes', {}, { as: caller })), [
    'before the snapshot',
    'after the restore',
  ])
  assert.equal(await app.call('heavyUsers', {}, { as: nobody }).then((rows) => named(rows, 'name').join()), 'Ada,Bob')
  // A file that is no data file is refused, and the data stays as it was.
  assert.equal(await codeOf(app.restore(join(dataFolder, 'engine.json'))), 'T0009')
  assert.equal(await codeOf(app.restore(join(work, 'no such file'))), 'T0009')
  assert.equal(await app.call('countNotes', {}, { as: caller }), 2)
})
