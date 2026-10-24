import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Files, FileName, Tx, Wrote } from '../index.ts'
import { backup, connected, layoutOf, restore, sweep } from '../index.ts'
import {
  appOf,
  filesOf,
  folderOf,
  metaOf,
  person,
  readingFiles,
  seedDesk,
  storedIn,
  teamFile,
  writingFiles,
} from './apart.ts'
import { at } from './shop.ts'
import { workFolder } from './work.ts'

const desk = appOf()

/** The count of removals that the shared file tells, as `<mark>.<count>`. */
function toldBy(files: Files): string {
  const { mark, count } = Object(metaOf(files.shared, 'removals'))
  return `${mark ?? '0'}.${count ?? 0}`
}

/** What a test keeps of the sweeps that the opening of a file ran. */
interface Swept {
  wrote: Wrote[]
  gone: string[][]
  ran: { file: FileName; removed: number; cleared: number }[]
}

/** Opens the files of the desk so that each file is swept when it is opened, before anything reads it, as the engine does. */
function sweptFiles(t: Parameters<typeof filesOf>[0], folder = folderOf(t)) {
  const kept: Swept = { wrote: [], gone: [], ran: [] }
  const o = {
    wrote: (w: Wrote) => kept.wrote.push(w),
    gone: (users: string[], tx: Tx) => {
      assert.equal(typeof tx.read, 'function')
      kept.gone.push(users)
    },
  }
  const files: Files = filesOf(
    t,
    desk,
    {
      before(file) {
        const { removed, cleared } = sweep(files, file, desk, o)
        if (removed || cleared) kept.ran.push({ file, removed, cleared })
        return 'ready'
      },
    },
    folder,
  )
  /** What the engine does at once after a removal in the shared file: every open file is swept. */
  const sweepOpen = () => {
    for (const file of files.open()) {
      const { removed, cleared } = sweep(files, file, desk, o)
      if (removed || cleared) kept.ran.push({ file, removed, cleared })
    }
  }
  return { files, kept, sweepOpen, o }
}

test('[50-4] a row of the shared file is removed: in an open file the rows that link to it are removed or cleared at once, and in a closed file when it is next opened, before any read', (t) => {
  const { files, kept, sweepOpen } = sweptFiles(t)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const db = readingFiles(files, desk)
  const [north, south] = [teamFile(s.north), teamFile(s.south)]
  const fill = (team: string) =>
    write((db) => ({
      adas: at(db, 'orders').of(team).add({ total: 1, placedBy: s.ada }),
      bobs: at(db, 'orders').of(team).add({ total: 2, placedBy: s.bob }),
      adasNote: at(db, 'notes').of(team).add({ author: s.ada, text: 'of Ada' }),
      bobsNote: at(db, 'notes').of(team).add({ author: s.bob, text: 'of Bob' }),
    }))
  const [n, so] = [fill(s.north), fill(s.south)]
  // Bob changed his own note and a note of Ada, in both files: the earlier versions are kept, and name him.
  const asBob = writingFiles(files, desk, person(s.bob))
  asBob((db) => at(db, 'notes').of(s.south).change(String(so.bobsNote.id), { text: 'of Bob, again' }))
  asBob((db) => at(db, 'notes').of(s.south).change(String(so.adasNote.id), { text: 'of Ada, by Bob' }))
  // A file that was never swept stands at the count of the shared file.
  assert.equal(metaOf(Object(files.of(north)), 'swept'), toldBy(files))
  const before = toldBy(files)
  files.close(south)
  assert.deepEqual(files.open(), [north])

  // Bob is removed, in a write of the shared file: no file is written by it, and the count is raised.
  write((db) => at(db, 'users').remove(s.bob))
  assert.notEqual(toldBy(files), before)
  assert.equal(Object(metaOf(files.shared, 'removals')).count, 1)
  assert.equal(storedIn(files.of(north), 'notes').length, 2)
  assert.deepEqual(files.open(), [north])

  // At once, in the file that is open: `notes.author` removes, and `orders.placedBy` clears.
  sweepOpen()
  assert.deepEqual(kept.ran, [{ file: north, removed: 1, cleared: 1 }])
  assert.deepEqual(
    at(db, 'notes')
      .of(s.north)
      .all()
      .map((row) => row.id),
    [n.adasNote.id],
  )
  assert.deepEqual(
    at(db, 'orders')
      .of(s.north)
      .all()
      .map((row) => [row.id, row.placedBy]),
    [
      [n.adas.id, s.ada],
      [n.bobs.id, undefined],
    ],
  )
  assert.equal(metaOf(Object(files.of(north)), 'swept'), toldBy(files))
  // A row that the sweep removes fires its trigger: it is told as any removal is, and a cleared row as a change.
  assert.deepEqual(
    kept.wrote.map((w) => `${w.kind} ${w.table} ${w.row.id}`),
    [`changed orders ${n.bobs.id}`, `removed notes ${n.bobsNote.id}`],
  )
  assert.deepEqual(kept.wrote[0].columns, ['placedBy'])
  assert.equal(kept.wrote[0].before?.placedBy, s.bob)
  assert.deepEqual(kept.gone, [[s.bob]])
  // A second sweep of a file that stands at the count does nothing, and writes nothing.
  kept.wrote.length = 0
  sweepOpen()
  assert.deepEqual(kept.wrote, [])
  assert.equal(kept.ran.length, 1)

  // The closed file holds the rows still, and is swept when it is next opened, before the read that opened it.
  assert.deepEqual(files.open(), [north])
  assert.deepEqual(
    at(db, 'notes')
      .of(s.south)
      .all()
      .map((row) => row.id),
    [so.adasNote.id],
  )
  assert.deepEqual(kept.ran[1], { file: south, removed: 1, cleared: 1 })
  assert.equal(at(db, 'orders').of(s.south).get(String(so.bobs.id))?.placedBy, undefined)
  assert.equal(metaOf(Object(files.of(south)), 'swept'), toldBy(files))
  // For a person who is gone the kept earlier versions of the rows that were removed are gone, and `removed`
  // stands in place of them where the history names who changed a row. The order that was cleared keeps its
  // earlier version, as any row that is changed does.
  assert.deepEqual(
    storedIn(files.of(south), '_t_history').map((row) => `${row.tableName} ${row.rowId} by ${row.by}`),
    [`notes ${so.adasNote.id} by removed`, `orders ${so.bobs.id} by system`],
  )
  assert.deepEqual(kept.gone, [[s.bob], [s.bob]])
  // A removal in a file that links to no removed row writes nothing more.
  write((db) => at(db, 'users').remove(s.cy))
  kept.wrote.length = 0
  sweepOpen()
  assert.deepEqual(kept.wrote, [])
  assert.equal(metaOf(Object(files.of(north)), 'swept'), toldBy(files))
  assert.equal(metaOf(Object(files.of(south)), 'swept'), toldBy(files))
})

test('[50-4] a removal by raw SQL raises the count where it names such a table or names none, and a removal of a row that no file links to raises none', (t) => {
  const { files } = sweptFiles(t)
  const s = seedDesk(files, desk)
  const count = () => Number(Object(metaOf(files.shared, 'removals') ?? { count: 0 }).count)
  const raw = (text: string, touches?: string[]) =>
    writingFiles(
      files,
      desk,
      { kind: 'system' },
      { system: true, ...(touches ? { touches } : {}) },
    )((db) => Reflect.get(db, 'sql')(text, []))
  const start = count()
  // `members` is linked to by no tenant table.
  writingFiles(
    files,
    desk,
  )((db) => {
    const [row] = at(db, 'members').where({ user: s.bob }).all()
    at(db, 'members').remove(String(row.id))
  })
  assert.equal(count(), start)
  raw('delete from members where 0', ['members'])
  assert.equal(count(), start)
  raw('delete from users where 0', ['users'])
  assert.equal(count(), start + 1)
  raw('delete from members where 0')
  assert.equal(count(), start + 2)
  writingFiles(files, desk)((db) => at(db, 'users').remove(s.cy))
  assert.equal(count(), start + 3)
})

test('[50-4] after a restore, a file whose count equals the shared file by number is swept all the same', async (t) => {
  const { files, kept, sweepOpen } = sweptFiles(t)
  const s = seedDesk(files, desk)
  const write = writingFiles(files, desk)
  const north = teamFile(s.north)
  write((db) => at(db, 'orders').of(s.north).add({ total: 1, placedBy: s.ada }))
  write((db) => at(db, 'users').remove(s.cy))
  sweepOpen()
  const backups = workFolder(t)
  await backup(files.shared, backups)
  // The folder holds the one file of the backup.
  const [saved] = readdirSync(backups)

  // After the backup a person is added, and places an order.
  const dan = write((db) => String(at(db, 'users').add({ name: 'Dan' }).id))
  const order = write((db) => at(db, 'orders').of(s.north).add({ total: 2, placedBy: dan }))
  const told = toldBy(files)
  assert.equal(metaOf(Object(files.of(north)), 'swept'), told)
  files.close(north)

  // The shared file is put back: it does not hold Dan, and its count is the one the file was swept at, by number.
  await restore(files.shared, join(backups, saved))
  const db = readingFiles(files, desk)
  assert.equal(at(db, 'users').get(dan), undefined)
  const again = toldBy(files)
  assert.equal(again.split('.')[1], told.split('.')[1])
  assert.notEqual(again.split('.')[0], told.split('.')[0])
  assert.notEqual(again, told)

  // The mark is new, so the file is swept when it is next opened: the order that Dan placed names nobody.
  kept.ran.length = 0
  assert.equal(at(db, 'orders').of(s.north).get(String(order.id))?.placedBy, undefined)
  assert.deepEqual(kept.ran, [{ file: north, removed: 0, cleared: 1 }])
  assert.equal(metaOf(Object(files.of(north)), 'swept'), again)
})

test('[50-4] a change that reads a closed file which is unswept: that file is swept in a write of its own before the read, and the change goes on in its one file', (t) => {
  const { files, kept } = sweptFiles(t)
  const numbered = connected(files, layoutOf(desk), {})
  const s = seedDesk(numbered, desk)
  const write = writingFiles(numbered, desk)
  const [north, south] = [teamFile(s.north), teamFile(s.south)]
  write((db) => at(db, 'notes').of(s.south).add({ author: s.bob, text: 'of Bob' }))
  write((db) => at(db, 'notes').of(s.south).add({ author: s.ada, text: 'of Ada' }))
  write((db) => at(db, 'orders').of(s.north).add({ total: 1 }))
  files.close(south)
  write((db) => at(db, 'users').remove(s.bob))
  const before = Number(metaOf(Object(files.of(north)), 'n'))

  // The change has written its file when it reads the other one, which must be swept first.
  const read = write((db) => {
    const order = at(db, 'orders').of(s.north).add({ total: 2 })
    const notes = at(db, 'notes').of(s.south).all()
    at(db, 'orders').of(s.north).change(String(order.id), { total: notes.length })
    return notes.map((row) => row.text)
  })
  assert.deepEqual(read, ['of Ada'])
  assert.deepEqual(kept.ran, [{ file: south, removed: 1, cleared: 0 }])
  assert.deepEqual(
    at(readingFiles(numbered, desk), 'orders')
      .of(s.north)
      .all()
      .map((row) => row.total),
    [1, 1],
  )
  // Each of the two writes took a number of the one count: the sweep first, and the change after it.
  const [swept, changed] = [metaOf(Object(files.of(south)), 'n'), metaOf(Object(files.of(north)), 'n')]
  assert.equal(Number(swept) > before, true)
  assert.equal(changed, Number(swept) + 1)
})
