import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { appIn, command } from './desks.ts'
import { until } from './many.ts'
import { copyOf } from './projects.ts'
import { watcher } from './watched.ts'

const system = { as: { kind: 'system' } } as const

const idOf = (row: unknown): string => String(Reflect.get(Object(row), 'id'))
const rowsOf = (answer: unknown): Record<string, unknown>[] => (Array.isArray(answer) ? answer : [])

/** Moves the clock of a test app on a second at a time, so that an open page answers each sign of life in time. */
async function seconds(app: { clock: { advance(length: string): void } }, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    app.clock.advance('1 second')
    await new Promise((done) => setTimeout(done, 5))
  }
}

test('[45-7] a row of a table kept in memory is live to a page, read under the rule of its table, and gone thirty seconds after its last write', async (t) => {
  const { app } = await appIn(t, copyOf(t, 'presence'))
  const maya = idOf(
    await app.write([{ add: 'users', values: { name: 'Maya' } }], system).then((rows) => rowsOf(rows)[0]),
  )
  const page = watcher(app)
  const first = await page.watch('here', 'whoIsHere')
  assert.deepEqual(first.value, [])
  const row = idOf(await app.call('here', { user: maya, doc: 'plan' }, system))
  await app.call('here', { user: maya, doc: 'secret plan', shown: false }, system)
  await until('the page is sent who is here', () => JSON.stringify(page.got).includes(row))
  // Under its rule: a caller sees the row that is shown, and the system both.
  assert.deepEqual(
    rowsOf(await app.call('whoIsHere', {}, { as: { kind: 'nobody' } })).map((one) => one.doc),
    ['plan'],
  )
  assert.equal((await app.rows('presence')).length, 2)
  // A write keeps a row: twenty seconds, a write, and twenty more seconds.
  await seconds(app, 20)
  await app.call('typing', { id: row }, system)
  await seconds(app, 20)
  assert.deepEqual(
    rowsOf(await app.call('whoIsHere', {}, { as: { kind: 'nobody' } })).map((one) => [one.doc, one.typing]),
    [['plan', true]],
  )
  assert.equal((await app.rows('presence')).length, 1, 'the row that was not written for forty seconds is gone')
  // Thirty seconds after its last write it is gone, and the page is told.
  const before = page.got.length
  await seconds(app, 15)
  await until('the page is told the row is gone', () => page.got.length > before)
  assert.deepEqual(await app.rows('presence'), [])
  page.close()
})

test('[45-7] a row of a table kept in memory is in no backup, in no part of the archive and in no export of its person, and the data file holds no such table', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'presence'))
  const maya = idOf(rowsOf(await app.write([{ add: 'users', values: { name: 'Maya' } }], system))[0])
  await command(app, dataFolder, 'data', { what: 'backup' })
  for (const doc of ['plan', 'notes', 'budget']) await app.call('here', { user: maya, doc }, system)
  const backup: Record<string, unknown> = Object(await command(app, dataFolder, 'data', { what: 'backup' }))
  const exported: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'user', do: 'export', id: maya }),
  )
  assert.equal('presence' in Object(exported.rows), false, JSON.stringify(exported.rows))
  assert.equal((await app.rows('presence')).length, 3)
  // The program stops and starts again on the same data: what waited for the archive is written as a part.
  await app.restart()
  // The backup and the data file hold no table of memory.
  for (const file of [String(backup.file), join(dataFolder, 'data.db')]) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((one) => one.name)
      assert.equal(tables.includes('presence'), false, file)
    } finally {
      db.close()
    }
  }
  // The archive holds no row of it.
  const archive = join(dataFolder, 'backups', 'archive')
  assert.ok(existsSync(archive))
  for (const name of readdirSync(archive))
    assert.equal(readFileSync(join(archive, name), 'latin1').includes('budget'), false, name)
})
