import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, readFile, titlesOf, writeFile } from './desks.ts'
import { moment } from './many.ts'

/** How many lines of the log of a data folder say that a data file was written from outside the engine. */
const saidOutside = (dataFolder: string): number =>
  readFile(join(dataFolder, 'logs.db'), 'SELECT "message" FROM "lines"').filter((row) =>
    /from outside/.test(String(row.message)),
  ).length

test('[20-8@6] a write of the data file of a tenant from outside the engine, while it stands open, is met by the next write of the engine to that file: the log says so once', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const team = await addTeam(app, 'North')
  await addOrder(app, team, 'first')
  // The writes of the engine alone are no write from outside.
  await addOrder(app, team, 'second')
  await moment(300)
  assert.equal(saidOutside(dataFolder), 0)

  writeFile(fileOf(dataFolder, team), 'UPDATE "orders" SET "title" = ? WHERE "title" = ?', 'written outside', 'first')
  await addOrder(app, team, 'third')
  for (let i = 0; i < 100 && saidOutside(dataFolder) === 0; i++) await moment(20)
  assert.equal(saidOutside(dataFolder), 1)
  assert.ok((await titlesOf(app, team)).includes('written outside'))

  // It is said once for what was written: a later write of the engine finds nothing new.
  await addOrder(app, team, 'fourth')
  await moment(300)
  assert.equal(saidOutside(dataFolder), 1)
})
