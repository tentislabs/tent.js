import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { number, text } from '../../core/index.ts'
import { runKilled } from '../../../rig/kill.ts'
import { made, opened, system, tableOf, workFolder } from './work.ts'

const MB = 1_048_576

test('[20-5] [night] killed in the middle of a change a thousand times, the database always opens and holds all of the change or none', async (t) => {
  const program = join(import.meta.dirname, 'killed', 'change.ts')
  // Four data files are killed side by side, 250 times each: the thousand kills then take a quarter of the time.
  const folders = [workFolder(t), workFolder(t), workFolder(t), workFolder(t)]
  const all = await Promise.all(
    folders.map((folder) => runKilled(program, { times: 250, when: 'mid', args: [folder] })),
  )
  let none = 0
  for (const killed of all) {
    assert.equal(killed.kills, 250)
    assert.equal(killed.ended.length, 250)
    for (const [round, one] of killed.ended.entries()) {
      // Each start holds the file against the rule before it writes, and ends with 3 where it does not hold.
      assert.equal(one.code, 0, `seed ${killed.seed}, round ${round}: ${one.out}`)
      const found = /^whole at batch \d+: (none|all) of the change before$/m.exec(one.out)
      assert.ok(found, `seed ${killed.seed}, round ${round}: ${one.out}`)
      if (found[1] === 'none') none++
    }
  }
  // The kill is of use only where it arrives before the change is committed: most of them must have.
  assert.ok(none >= 900, `${none} of 1000 kills arrived in the middle of the change`)

  for (const folder of folders) {
    const file = new DatabaseSync(join(folder, 'data.db'))
    try {
      assert.deepEqual(
        file
          .prepare('PRAGMA integrity_check')
          .all()
          .map((row) => row.integrity_check),
        ['ok'],
      )
      const rows = file.prepare('SELECT count(*) AS n, count(DISTINCT batch) AS batches FROM entries').get()
      assert.deepEqual({ ...rows }, { n: 10000, batches: 1 })
    } finally {
      file.close()
    }
  }
})

test('[20-5] [night] after a read was held open through 10,000 writes and let go, the write-ahead file is 4 MB or less once the next writes are written back', (t) => {
  const folder = workFolder(t)
  const store = opened(folder)
  made(store, [tableOf('notes', { n: number({ whole: true }), body: text() })])
  const body = 'a line of a note that is long enough to fill a page with a few rows. '.repeat(12)
  const write = (n: number) => store.write((tx) => tx.add('notes', { n, body }, system))
  for (let n = 0; n < 100; n++) write(n)
  const walSize = () => statSync(join(folder, 'data.db-wal')).size

  // A second connection begins a read and holds it: SQLite then cannot write its write-ahead file back.
  const reader = new DatabaseSync(join(folder, 'data.db'))
  t.after(() => reader.isOpen && reader.close())
  reader.exec('BEGIN')
  assert.equal(reader.prepare('SELECT count(*) AS n FROM notes').get()?.n, 100)
  for (let n = 0; n < 10_000; n++) write(100 + n)
  const grown = walSize()
  assert.ok(grown > 4 * MB, `the write-ahead file grew while the read was held: ${grown} bytes`)
  assert.equal(reader.prepare('SELECT count(*) AS n FROM notes').get()?.n, 100, 'the read still holds its moment')
  reader.exec('COMMIT')
  reader.close()

  // The next writes are written back, and the file is cut to its limit.
  let after = grown
  let written = 10_100
  while (written < 15_100 && after > 4 * MB) {
    write(written++)
    after = walSize()
  }
  assert.ok(
    after <= 4 * MB,
    `the write-ahead file is ${after} bytes, ${written - 10_100} writes after the read was let go`,
  )
  assert.deepEqual(store.sql?.('SELECT count(*) AS n FROM notes', []), [{ n: written }])
})
