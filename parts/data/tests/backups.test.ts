import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Store } from '../index.ts'
import { backup, connected, restore } from '../index.ts'
import { made, opened, system, tableOf, workFolder } from './work.ts'

const entries = tableOf('entries', { k: { kind: 'number', whole: true } })

/** What a data file holds, read by a connection of the test: SQLite's own check, its rows, and the number of its last write. */
function fileOf(file: string): { check: unknown[]; rows: number; highest: unknown; n: unknown } {
  const db = new DatabaseSync(file)
  try {
    const counted = db.prepare('SELECT count(*) AS "rows", max("k") AS "highest" FROM "entries"').get()
    const meta = db.prepare(`SELECT "value" FROM "_t_meta" WHERE "key" = 'n'`).get()
    return {
      check: db
        .prepare('PRAGMA integrity_check')
        .all()
        .map((row) => row.integrity_check),
      rows: Number(counted?.rows),
      highest: counted?.highest,
      n: meta ? JSON.parse(String(meta.value)) : undefined,
    }
  } finally {
    db.close()
  }
}

/** The backups that a folder holds, in the order they were made: their names stand in that order. */
const backupsIn = (folder: string): string[] =>
  readdirSync(folder)
    .sort()
    .map((name) => join(folder, name))

/** Adds one row in a write of its own, which is the next write of the store. */
const addOne = (store: Store, k: number) => store.write((tx) => tx.add('entries', { k }, system))

test('[20-6] a backup taken during writes restores to a file that passes the integrity check and has the expected rows, and the snapshot answers the number of the last write its file holds', async (t) => {
  const folder = workFolder(t)
  const plain = opened(folder)
  made(plain, [entries])
  // The number of each write is kept with a sink or without.
  const store = connected(plain, [entries], {})
  for (let k = 1; k <= 100; k++) addOne(store, k)

  // Writes go on while the backup is made.
  let written = 100
  let done = false
  const taking = backup(store, join(folder, 'backups')).finally(() => {
    done = true
  })
  while (!done) {
    for (let i = 0; i < 20; i++) addOne(store, ++written)
    await new Promise((resolve) => setImmediate(resolve))
  }
  const taken = await taking
  assert.ok(written > 100)
  assert.ok(taken.n >= 100 && taken.n <= written, `${taken.n} of ${written}`)
  // It answers the number alone, as `snapshot` does: the folder holds the file.
  assert.deepEqual(Object.keys(taken), ['n'])
  const [first] = backupsIn(join(folder, 'backups'))
  assert.equal(backupsIn(join(folder, 'backups')).length, 1)
  // The file is whole, as the data stood at one commit: the write of its number, and every row up to it. A write
  // that was made while the backup ran did not move the number it answers.
  assert.deepEqual(fileOf(first), { check: ['ok'], rows: taken.n, highest: taken.n, n: taken.n })
  assert.equal(fileOf(join(folder, 'data.db')).n, written)

  // The snapshot of the store answers the same way.
  const snapshot = await store.snapshot(join(folder, 'snapshot.db'))
  assert.deepEqual(snapshot, { n: written })
  assert.equal(fileOf(join(folder, 'snapshot.db')).rows, written)

  // Put back, the data is the backup: its rows, its number, and the next write goes on from there.
  await restore(store, first)
  const read = store.read({ from: 'entries', count: true }, system)
  assert.equal(read.value, taken.n)
  addOne(store, taken.n + 1)
  assert.deepEqual(fileOf(join(folder, 'data.db')), {
    check: ['ok'],
    rows: taken.n + 1,
    highest: taken.n + 1,
    n: taken.n + 1,
  })
  // A second backup does not take the place of the first.
  const second = await backup(store, join(folder, 'backups'))
  assert.equal(second.n, taken.n + 1)
  assert.deepEqual(Object.keys(second), ['n'])
  const both = backupsIn(join(folder, 'backups'))
  assert.equal(both.length, 2)
  assert.equal(both[0], first)
  assert.equal(fileOf(both[1]).n, taken.n + 1)
  assert.equal(fileOf(first).n, taken.n)
  // A file that is no data file is not put in place, and the store is as it was.
  await assert.rejects(restore(store, join(folder, 'nothing.db')), { code: 'T0009' })
  assert.equal(store.read({ from: 'entries', count: true }, system).value, taken.n + 1)
})
