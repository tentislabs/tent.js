import assert from 'node:assert/strict'
import { cpSync } from 'node:fs'
import test from 'node:test'
import { addOrder, addTeam, command, deskOf, fileOf } from './desks.ts'
import { codeOf } from './many.ts'

const system = { as: { kind: 'system' } } as const

test('[50-12.5] a backup of one tenant put back under a tenant that is gone, where the file under its id is the file of another: it is refused with nothing put back, not the row of the tenant either', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'of the north')
  await addOrder(app, south, 'of the south')
  const backup: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'backup', whole: true }),
  )
  const folder = String(backup.file)
  // In the backup the file of North lies over the file of South. South is then removed from the app.
  cpSync(fileOf(folder, north), fileOf(folder, south))
  await app.call('removeTeam', { team: south }, system)
  const teams = async (): Promise<unknown[]> => (await app.rows('teams')).map((row) => row.name)
  assert.deepEqual(await teams(), ['North'])
  // Putting South back would first put its row back from the backup: the file is held to its tenant before that.
  assert.equal(await codeOf(command(app, dataFolder, 'data', { what: 'restore', file: folder, of: south })), 'T0009')
  assert.deepEqual(await teams(), ['North'], 'the row of the tenant was put back for a restore that was refused')
})
