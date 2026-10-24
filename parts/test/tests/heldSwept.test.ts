import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { TestApp, TestBrowser } from '../index.ts'
import { stormed } from './storms.ts'

async function signedIn(app: TestApp, email: string): Promise<TestBrowser> {
  const browser = app.browser()
  assert.deepEqual(await browser.call('signIn', { email }), { ok: true, caller: 'changed' })
  return browser
}

/** One count of the shared data file, read beside the engine. */
function counted(dataFolder: string, sql: string, ...values: string[]): number {
  const db = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return Number(db.prepare(sql).get(...values)?.n ?? 0)
  } finally {
    db.close()
  }
}

const holdsOf = (dataFolder: string, file: string): number =>
  counted(dataFolder, 'SELECT count(*) AS n FROM "_t_holds" WHERE "file" = ?', file)

const isLoose = (dataFolder: string, file: string): boolean =>
  counted(dataFolder, 'SELECT count(*) AS n FROM "_t_files" WHERE "id" = ? AND "looseAt" IS NOT NULL', file) === 1

const isGone = (dataFolder: string, file: string): boolean =>
  counted(dataFolder, 'SELECT count(*) AS n FROM "_t_files" WHERE "id" = ? AND "removedAt" IS NULL', file) === 0

test('[50-8@7a] a write of a tenant that is undone after the hold of its file, and a kill after it, leave the file kept, and the upkeep takes the hold away once the file of the tenant is open', async (t) => {
  const { app, dataFolder } = await stormed(t, 'teamFiles')
  await app.user({ email: 'maya@example.com', roles: [] })
  let maya = await signedIn(app, 'maya@example.com')
  const north = String((await maya.call('addTeam', { name: 'North' })).value)
  const paper = String((await maya.call('putText', { words: 'the paper of the north' })).value)
  // The hold is written in a write of the shared file of its own, before the write of the tenant, which fails.
  const failed = await maya.call('keepAndFail', { team: north, title: 'kept', paper })
  assert.equal(failed.ok, false, JSON.stringify(failed))
  assert.equal(holdsOf(dataFolder, paper), 1)
  // A kill, and a start: the file is kept, since a hold stands for it.
  await app.kill()
  await app.restart()
  assert.equal(isGone(dataFolder, paper), false)
  // Once the file of the tenant is open, the upkeep takes the hold whose row is not there away: at the start, where
  // the start opened it, and at the latest a day on.
  maya = await signedIn(app, 'maya@example.com')
  assert.deepEqual((await maya.call('papersOf', { team: north })).value, [])
  app.clock.advance('1 day')
  assert.deepEqual([holdsOf(dataFolder, paper), isLoose(dataFolder, paper)], [0, true])
  // Loose from then on, it is gone an hour later.
  app.clock.advance('61 minutes')
  assert.equal(isGone(dataFolder, paper), true)
})

test('[22-16@7a] a kept earlier version that is kept no more lets go of its file: the upkeep takes its hold away, and the file is loose from then on', async (t) => {
  const { app, dataFolder } = await stormed(t, 'filed', {
    change: [
      [
        'tent.ts',
        'limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000 },',
        'limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000, uploadsPerMinute: 1000 },',
      ],
    ],
  })
  const maya = await signedIn(app, 'maya@example.com')
  const first = String((await maya.call('putText', { words: 'the first paper' })).value)
  const second = String((await maya.call('putText', { words: 'the second paper' })).value)
  const row = String((await maya.call('keepPaper', { title: 'kept', paper: first })).value)
  // The row holds the second file now, and the version that it left holds the first.
  assert.equal((await maya.call('swapPaper', { row, paper: second })).ok, true)
  assert.deepEqual([holdsOf(dataFolder, first), holdsOf(dataFolder, second)], [1, 1])
  // The version ages out of the data while the engine is stopped, as anything that drops a kept version leaves it.
  await app.kill()
  const db = new DatabaseSync(join(dataFolder, 'data.db'))
  db.prepare('DELETE FROM "_t_history" WHERE "tableName" = ? AND "rowId" = ?').run('papers', row)
  db.close()
  // The upkeep at the start takes away the hold of the version that is not kept: the first file is loose again.
  await app.restart()
  assert.deepEqual([holdsOf(dataFolder, first), isLoose(dataFolder, first)], [0, true])
  assert.deepEqual([holdsOf(dataFolder, second), isLoose(dataFolder, second)], [1, false])
  app.clock.advance('61 minutes')
  assert.deepEqual([isGone(dataFolder, first), isGone(dataFolder, second)], [true, false])
})
