import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, command, dataPlace, deskBundle, teamFilesIn, openOn, titlesOf } from './desks.ts'

const system = { as: { kind: 'system' } } as const

test('[50-8@4] a data folder under a path of 150 letters backs up, is restored, and is snapshot whole, with the files of its tenants: on Windows past the 260 letters of a path that the system allows by default', async (t) => {
  const bundle = await deskBundle(t)
  const place = join(dataPlace(t), '..')
  // A project may lie under a path of 150 letters, and its data folder below it: here 185, its files of tenants further.
  const dataFolder = join(place, 'd'.repeat(Math.max(1, 185 - place.length - 1)))
  assert.ok(dataFolder.length >= 185, dataFolder)
  const { app } = await openOn(t, bundle, dataFolder)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')

  const backedUp: Record<string, unknown> = Object(await command(app, dataFolder, 'data', { what: 'backup' }))
  const folder = String(backedUp.file)
  assert.deepEqual(teamFilesIn(folder), [north, south].sort())

  await addOrder(app, north, 'after the backup')
  await app.write([{ remove: 'teams', id: south }], system)
  await command(app, dataFolder, 'data', { what: 'restore', file: folder })
  assert.deepEqual(await titlesOf(app, north), ['a lamp'])
  assert.deepEqual(await titlesOf(app, south), ['a desk'])

  const snapshot = join(dataFolder, 'snapshot-of-the-data-folder')
  const { writes } = await app.snapshot(snapshot)
  assert.equal(writes, app.at().n)
  assert.equal(existsSync(join(snapshot, 'data.db')), true)
  assert.deepEqual(teamFilesIn(snapshot), [north, south].sort())
})
