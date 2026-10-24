import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, listed, readFile, titlesOf, writeFile } from './desks.ts'
import { moment } from './many.ts'

const system = { as: { kind: 'system' } } as const

test('[50-4@4] a file whose row of the directory names no count of removals is listed as unswept where its next opening sweeps it, --sweep reaches it, and it is listed as swept where the file itself stands at the count', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  const caller = await app.user({ name: 'Ada', roles: [] })
  const ada = caller.kind === 'user' ? (caller.user?.id ?? '') : ''
  for (const team of [north, south]) {
    await addOrder(app, team, 'placed by Ada', { placedBy: ada })
    await addOrder(app, team, 'placed by nobody')
  }
  // Both files are closed when the person is removed: neither is swept in that write.
  app.clock.advance('2 minutes')
  await moment()
  await app.call('removeUser', { user: ada }, system)
  /** Takes the count that the row of North names away, while no engine holds the data. */
  const forgotten = async (): Promise<void> => {
    await app.kill()
    writeFile(join(dataFolder, 'data.db'), 'UPDATE "_t_tenants" SET "swept" = NULL WHERE "rowId" = ?', north)
    await app.restart()
  }
  const unswept = async (): Promise<string[]> =>
    (await listed(app, dataFolder, { unswept: true })).files.map((one) => one.id).sort()
  const sweptIn = (team: string): unknown =>
    readFile(join(dataFolder, 'data.db'), `SELECT "swept" FROM "_t_tenants" WHERE "rowId" = '${team}'`)[0]?.swept

  // The row of North names no count, and its file stands at the count before the removal: its next opening sweeps it.
  await forgotten()
  assert.equal(sweptIn(north), null)
  assert.deepEqual(await unswept(), [north, south].sort())
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => [one.open, one.unswept]),
    [
      [false, true],
      [false, true],
    ],
  )
  // Listing it opened nothing, and swept nothing.
  assert.deepEqual(
    readFile(fileOf(dataFolder, north), 'SELECT "title" FROM "orders" ORDER BY "title"').map((row) => row.title),
    ['placed by Ada', 'placed by nobody'],
  )
  // The pass of a removal reaches both files.
  assert.equal((await listed(app, dataFolder, { sweep: true })).swept, 2)
  assert.deepEqual(await unswept(), [])
  assert.deepEqual(await titlesOf(app, north), ['placed by nobody'])

  // The row names no count once more, and the file itself stands at the count of the shared file: nothing is left to sweep.
  app.clock.advance('2 minutes')
  await moment()
  await forgotten()
  assert.equal(sweptIn(north), null)
  assert.deepEqual(await unswept(), [])
  assert.equal((await listed(app, dataFolder, { sweep: true })).swept, 0)
})
