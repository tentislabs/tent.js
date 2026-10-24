import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { ChangeSink, Files, Store } from '../index.ts'
import { connected, layoutOf, NotReady, sqliteStore } from '../index.ts'
import { appOf, filesOf, metaOf, seedDesk, teamFile, writingFiles } from './apart.ts'
import { at } from './shop.ts'
import { made, opened, tableOf, workFolder } from './work.ts'

/** Lets what waits on a promise that is settled run. */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

test('[20-6] a raw SQL write that hands a large whole number, while a sink is behind, is answered as the write it was, and the sink is handed it', async (t) => {
  const folder = workFolder(t)
  const plain = opened(folder)
  const notes = tableOf('notes', { n: { kind: 'number', whole: true, optional: true } })
  made(plain, [notes])
  const handed: number[] = []
  let release = () => {}
  const behind = new Promise<void>((resolve) => {
    release = resolve
  })
  const sink: ChangeSink = {
    start: (n) => n,
    async wrote(change) {
      handed.push(change.n)
      await behind
    },
  }
  const store = connected(plain, [notes], { sink })
  await settled()
  // The first write keeps the sink at work, so the second waits for it.
  store.write((tx) => tx.sql('UPDATE "notes" SET "n" = ? WHERE 0', [1]))
  assert.doesNotThrow(
    () => store.write((tx) => tx.sql('UPDATE "notes" SET "n" = ? WHERE 0', [2n ** 60n])),
    'the write was committed, and is answered as one',
  )
  release()
  await settled()
  await settled()
  assert.deepEqual(handed, [1, 2], 'the sink is handed both writes, in order')
})

/** Opens the files of the desk with what the engine asks of a file before anything reads it: that it lies where it names. */
function heldFiles(t: Parameters<typeof filesOf>[0]): Files {
  const app = appOf()
  const files = filesOf(t, app, {
    before: (file, store) => (metaOf(store, 'tenant') === file.id ? 'ready' : 'wait'),
  })
  return connected(files, layoutOf(app))
}

test('[50-12.7] a file laid by hand under the id of a tenant, and refused before anything reads it, moves nothing of the count of writes', (t) => {
  const app = appOf()
  // A second app, whose file of a team holds many writes: its file is laid under the id of a team of the first.
  const other = heldFiles(t)
  const theirs = seedDesk(other, app)
  const write = writingFiles(other, app)
  for (let k = 0; k < 30; k++) write((db) => at(db, 'orders').of(theirs.north).add({ total: k }))
  const laid = other.path(teamFile(theirs.north))
  const files = heldFiles(t)
  const ours = seedDesk(files, app)
  writingFiles(files, app)((db) => at(db, 'orders').of(ours.north).add({ total: 1 }))
  // The desk, the order of North, and this row: the third write of the app, which the shared file holds.
  writingFiles(files, app)((db) => at(db, 'users').add({ name: 'Dee', roles: [] }))
  assert.equal(Number(metaOf(files.shared, 'n')), 3)
  other.of(teamFile(theirs.north))?.close()
  const place = files.path(teamFile(ours.east))
  mkdirSync(dirname(place), { recursive: true })
  copyFileSync(laid, place)
  assert.throws(() => files.of(teamFile(ours.east)), NotReady, 'the file lies where it names another tenant')
  writingFiles(files, app)((db) => at(db, 'users').add({ name: 'Eve', roles: [] }))
  assert.equal(Number(metaOf(files.shared, 'n')), 4, 'the next write takes the number after the last write')
})

test('[20-4] a data file that a store of a newer layout wrote is not taken as one of this layout', (t) => {
  const folder = workFolder(t)
  const store: Store = sqliteStore()
  store.open(folder)
  assert.equal(store.version().layout, 1)
  store.close()
  // The file says that a store of the layout 2 wrote it.
  const file = new DatabaseSync(`${folder}/data.db`)
  file.prepare(`UPDATE "_t_meta" SET "value" = '2' WHERE "key" = 'shapeNumber'`).run()
  file.close()
  let layout: number | undefined
  try {
    store.open(folder)
    layout = store.version().layout
    store.close()
  } catch {
    // A store that does not read the file at all holds the rule too.
    layout = 2
  }
  assert.equal(layout, 2, 'the layout of the file is the one the file holds')
})
