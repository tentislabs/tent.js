import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, readFile, titlesOf } from './desks.ts'

/** Whether the directory of a data folder marks the file of a tenant as open. */
const markedOpen = (dataFolder: string, id: string): unknown[] =>
  readFile(join(dataFolder, 'data.db'), `SELECT "open" FROM "_t_tenants" WHERE "rowId" = '${id}'`).map(
    (row) => row.open,
  )

test('[17-1@4] app.kill() ends the writer as a killed program would: engine.json is left, the file of a tenant is left marked open with what its store kept beside it, and restart opens the folder again with every write', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  const engineFile = join(dataFolder, 'engine.json')
  const before = readFileSync(engineFile, 'utf8')
  await app.kill()
  // Nothing was closed in order: the file of the engine stands as it stood, and so does what a stop would fold.
  assert.equal(existsSync(engineFile) && readFileSync(engineFile, 'utf8'), before)
  assert.equal(existsSync(`${fileOf(dataFolder, north)}-wal`), true, 'what the store kept beside the file is gone')
  assert.deepEqual(markedOpen(dataFolder, north), [1])
  // Opened again, the engine takes the file of the engine as left behind, and reads what the kill left.
  await app.restart()
  assert.notEqual(readFileSync(engineFile, 'utf8'), before)
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  await addOrder(app, north, 'after the kill')
  assert.deepEqual(await titlesOf(app, north), ['of the north', 'after the kill'])
  // A close is in order: the file of the engine is taken away, and no file is left marked open.
  await app.close()
  assert.equal(existsSync(engineFile), false)
})
