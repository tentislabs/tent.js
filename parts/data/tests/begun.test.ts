import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { number, text } from '../../core/index.ts'
import { runKilled } from '../../../rig/kill.ts'
import type { Store } from '../index.ts'
import { createDb, here, hereTable, layoutOf, openFiles, restore, setHere, sqliteStore } from '../index.ts'
import { appOf, filesOf, seedDesk, writingFiles } from './apart.ts'
import { at, described, sqlOf } from './shop.ts'
import { codeOf, made, opened, system, tableOf, workFolder } from './work.ts'

const notes = tableOf('notes', { n: number({ whole: true }), body: text({ optional: true }) })
const count = (store: Store): unknown => store.sql?.('SELECT count(*) AS "n" FROM "notes"', [])

test('[16-2@3] T0013: a write that is begun and ended apart is committed or undone by whoever began it, and a store without it keeps no file for each tenant', (t) => {
  const store = opened(workFolder(t))
  made(store, [notes])
  assert.equal(typeof store.begin, 'function')

  // Begun, written and committed: the row is there, and the commit answers what was touched.
  const first = store.begin?.()
  const added = first?.tx.add('notes', { n: 1 }, system)
  assert.deepEqual(first?.commit(), { touched: [{ table: 'notes', ids: [String(added?.id)] }] })
  assert.deepEqual(count(store), [{ n: 1 }])
  // Begun, written and undone: nothing of it is there, and the next write begins.
  const second = store.begin?.()
  second?.tx.add('notes', { n: 2 }, system)
  assert.equal(second?.undo(new Error('the work failed')), undefined)
  assert.deepEqual(count(store), [{ n: 1 }])
  // One write at a time: a second one is not begun while the first is open.
  const third = store.begin?.()
  assert.equal(
    codeOf(() => store.begin?.()),
    'T0013',
  )
  third?.undo()
  store.write((tx) => tx.add('notes', { n: 3 }, system))
  assert.deepEqual(count(store), [{ n: 2 }])

  // The files of an app begin the write of a file at its first row: a store that cannot keeps none.
  const without = (): Store => ({ ...sqliteStore(), begin: undefined })
  const lacking = openFiles(workFolder(t), layoutOf(appOf()), { store: without })
  assert.equal(
    codeOf(() => lacking.write((w) => w.tx().add('teams', { name: 'East' }, system))),
    'T0013',
  )
  assert.throws(() => lacking.write((w) => w.tx()), /begin/)
  lacking.shared.close()
})

test('[16-2@3] T0012: a text that may only read is refused where it writes, also while a write is open, and a text that reads what tells of the file itself is T0013, as every refusal of the guard is', (t) => {
  const description = described()
  const store = opened(workFolder(t))
  made(store, [notes])
  store.write((tx) => {
    tx.add('notes', { n: 1 }, system)
    // Inside a write a text that reads is carried out, and sees what the write wrote.
    assert.deepEqual(tx.sqlRead('SELECT "n" FROM "notes" WHERE "n" = ?', [1]), [{ n: 1 }])
    for (const text of [
      'INSERT INTO "notes" ("n") VALUES (2)',
      'UPDATE "notes" SET "n" = 5',
      'DELETE FROM "notes"',
      'INSERT INTO "notes" ("n") SELECT "n" + 1 FROM "notes"',
    ])
      assert.equal(
        codeOf(() => tx.sqlRead(text, [])),
        'T0012',
        text,
      )
    // The same write goes on, and writes by the text that may.
    tx.sql('UPDATE "notes" SET "n" = ?', [7])
  })
  assert.deepEqual(store.sql?.('SELECT "n" FROM "notes"', []), [{ n: 7 }])

  // A `db` that only reads, made over a write, runs `db.sql` by it.
  const shop = opened(workFolder(t))
  shop.write(() =>
    shop.applyTableChanges([{ do: 'addTable', table: 'teams', layout: tableOf('teams', { name: text() }) }]),
  )
  shop.write((tx) => {
    const writes = createDb(tx, description, system, 'write', {}, { system: true })
    at(writes, 'teams').add({ name: 'North' })
    const reads = createDb(tx, description, system, 'read', {}, { system: true })
    assert.deepEqual(sqlOf(reads)('SELECT "name" FROM "teams"', []), [{ name: 'North' }])
    assert.equal(
      codeOf(() => sqlOf(reads)('UPDATE "teams" SET "name" = ?', ['x'])),
      'T0012',
    )
    assert.equal(sqlOf(writes)('UPDATE "teams" SET "name" = ? RETURNING "name"', ['South']).length, 1)
  })

  // What tells of the file itself is no row of the app: the guard refuses it, outside a write and inside one.
  for (const text of [
    'SELECT * FROM pragma_database_list',
    'SELECT "file" FROM pragma_database_list()',
    'SELECT * FROM dbstat',
    'SELECT "name" FROM "notes" JOIN pragma_table_info(\'_t_meta\') ON 1',
    'SELECT (SELECT count(*) FROM pragma_table_list) AS "n" FROM "notes"',
    'SELECT * FROM PRAGMA_DATABASE_LIST',
  ]) {
    assert.equal(
      codeOf(() => store.sql?.(text, [])),
      'T0013',
      text,
    )
    assert.equal(
      codeOf(() => store.write((tx) => tx.sql(text, []))),
      'T0013',
      text,
    )
    assert.equal(
      codeOf(() => store.write((tx) => tx.sqlRead(text, []))),
      'T0013',
      text,
    )
  }
  assert.throws(() => store.sql?.('SELECT * FROM pragma_database_list', []), /the data file itself/)
})

test('[16-4@3] a data folder whose name ends in .db is opened as a folder, and the file of a tenant by its path', (t) => {
  const folder = join(workFolder(t), 'shop.db')
  // The folder is not there yet, and is made as a folder.
  const store = sqliteStore()
  store.open(folder)
  made(store, [notes])
  store.write((tx) => tx.add('notes', { n: 1 }, system))
  store.close()
  // It stands there now, and is opened as the folder it is.
  store.open(folder)
  assert.deepEqual(count(store), [{ n: 1 }])
  const second = sqliteStore()
  second.open(join(folder, 'data.db'), { readOnly: true })
  assert.deepEqual(count(second), [{ n: 1 }])
  second.close()
  store.close()

  // The file of a tenant is named by its id, and is opened as a file where it does not stand yet.
  const desk = appOf()
  const files = filesOf(t, desk)
  const s = seedDesk(files, desk)
  writingFiles(files, desk)((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  assert.match(files.path({ table: 'teams', id: s.north }), /[\\/][0-9a-z]{26}\.db$/)
  assert.ok(files.has({ table: 'teams', id: s.north }))
})

test('[20-6] restore of a file that is no data file fails with a code of ours and leaves the store as it was, and a store that fails to open leaves nothing open', async (t) => {
  const folder = workFolder(t)
  const store = opened(folder)
  made(store, [notes])
  store.write((tx) => tx.add('notes', { n: 1 }, system))

  const noData = join(folder, 'letter.txt')
  writeFileSync(noData, 'Dear reader, this is a letter and no data. '.repeat(200))
  const refused: unknown = await restore(store, noData).then(
    () => undefined,
    (error: unknown) => error,
  )
  assert.equal(
    codeOf(() => {
      throw refused
    }),
    'T0009',
  )
  assert.match(String(refused), /no data file/)
  // A file of SQLite that holds no table of the store is no data file either.
  const other = join(folder, 'other.db')
  const plain = new DatabaseSync(other)
  plain.exec('CREATE TABLE "x" ("a")')
  plain.close()
  await assert.rejects(restore(store, other), /no data file/)
  // The store stands as it was, and writes on.
  store.write((tx) => tx.add('notes', { n: 2 }, system))
  assert.deepEqual(count(store), [{ n: 2 }])

  // A folder whose `data.db` is no data file: the opening fails with a code of ours, and the folder can be removed.
  const broken = join(folder, 'broken')
  mkdirSync(broken)
  writeFileSync(join(broken, 'data.db'), 'this is no file of SQLite at all. '.repeat(200))
  const failing = sqliteStore()
  assert.equal(
    codeOf(() => failing.open(broken)),
    'T0009',
  )
  rmSync(broken, { recursive: true })
})

test('[29-1] here answers nothing for role and for mode before they were written, and setHere with toDisk is a write that was begun so', (t) => {
  const store = opened(workFolder(t))
  store.write(() => store.applyTableChanges([{ do: 'addTable', table: hereTable.name, layout: hereTable }]))
  const fresh = here(store)
  assert.equal(fresh.role, undefined)
  assert.equal(fresh.mode, undefined)
  assert.match(fresh.id, /^[0-9a-hjkmnp-tv-z]{26}$/)

  // On a store it is a write of its own, begun with `toDisk`.
  const how: unknown[] = []
  const watched: Store = {
    ...store,
    write(fn, o) {
      how.push(o)
      return store.write(fn, o)
    },
  }
  setHere(watched, { role: 'reader', mode: 'test' }, { toDisk: true })
  setHere(watched, { own: 'https://shop.example.com' })
  assert.deepEqual(how, [{ toDisk: true }, {}])
  assert.deepEqual(
    [here(store).role, here(store).mode, here(store).own],
    ['reader', 'test', 'https://shop.example.com'],
  )

  // On a write it holds where that write was begun so, and throws where it was not.
  assert.equal(
    codeOf(() => store.write((tx) => setHere(tx, { role: 'writer' }, { toDisk: true }))),
    'T0013',
  )
  assert.equal(here(store).role, 'reader', 'the write was undone')
  store.write((tx) => setHere(tx, { role: 'writer' }, { toDisk: true }), { toDisk: true })
  assert.equal(here(store).role, 'writer')
  const begun = store.begin?.({ toDisk: true })
  if (begun) setHere(begun.tx, { role: 'stopped' }, { toDisk: true })
  begun?.commit()
  assert.equal(here(store).role, 'stopped')
  // The write after one that reached the disk is an ordinary one again.
  store.write((tx) => setHere(tx, { role: 'writer' }))
  assert.equal(
    codeOf(() => store.write((tx) => setHere(tx, { role: 'reader' }, { toDisk: true }))),
    'T0013',
  )
})

test('[29-1] a write with toDisk that was answered is there after a kill, whatever was killed', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'toDisk.ts')
  const killed = await runKilled(program, { times: 3, when: 'answered', args: [workFolder(t)] })
  assert.equal(killed.kills, 3)
  for (const [round, one] of killed.ended.entries()) {
    assert.equal(one.code, 0, `seed ${killed.seed}, round ${round}: ${one.out}`)
    // Each start reads what the start before it was answered for: every such write is there, and its role with it.
    assert.match(one.out, new RegExp(`^holds: ${(round + 1) * 2} writes, the role is reader$`, 'm'), one.out)
  }
})
