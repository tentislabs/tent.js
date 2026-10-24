import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { addOrder, addTeam, command, dataPlace, deskBundle, openOn, titlesOf } from './desks.ts'

test('[15-6@4] data is empty for a seed while it holds no row: tables that were made hold none, and a row that was added and removed again is none', async (t) => {
  const { app, dataFolder } = await openOn(t, await deskBundle(t), dataPlace(t))
  const empty = (): Promise<unknown> => command(app, dataFolder, 'data', { what: 'empty' })
  assert.equal(await empty(), true)
  assert.deepEqual(await app.read({ from: 'teams' }, { as: 'system' }), [])
  assert.equal(await empty(), true)
  const team = await addTeam(app, 'South')
  assert.equal(await empty(), false, 'a row of the shared file')
  await app.write([{ remove: 'teams', id: team }], { as: 'system' })
  assert.equal(await empty(), true, 'the row is gone again')
})

test('[15-6@4] data whose tenant is gone from the shared file is empty for a seed: what its file still holds is read by nobody', async (t) => {
  const bundle = await deskBundle(t)
  const dataFolder = dataPlace(t)
  const first = await openOn(t, bundle, dataFolder)
  const team = await addTeam(first.app, 'South')
  await addOrder(first.app, team, 'A lamp')
  await first.engine.close()
  // The row of the team is taken out of the shared file by hand: the order in the team's file hangs on nothing.
  const shared = new DatabaseSync(join(dataFolder, 'data.db'))
  shared.exec('DELETE FROM "teams"')
  shared.close()
  const { app } = await openOn(t, bundle, dataFolder)
  assert.deepEqual(await app.read({ from: 'teams' }, { as: 'system' }), [])
  assert.deepEqual(await titlesOf(app, team), [])
  assert.equal(await command(app, dataFolder, 'data', { what: 'empty' }), true)
})
