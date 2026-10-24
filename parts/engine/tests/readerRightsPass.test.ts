import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { writeKey } from '../index.ts'
import { bundled, system } from './apps.ts'
import { current, machineAddress, until, worldOf } from './machines.ts'

/** The orders that a data file of a team holds, with the columns it holds, read alone: none where it is not there. */
function ordersIn(file: string): { rows: string[]; columns: string[] } {
  if (!existsSync(file)) return { rows: [], columns: [] }
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = db.prepare('SELECT "title" FROM "orders" ORDER BY "title"').all()
    const columns = db.prepare('PRAGMA table_info("orders")').all()
    return { rows: rows.map((one) => String(one.title)), columns: columns.map((one) => String(one.name)).sort() }
  } finally {
    db.close()
  }
}

const fileOf = (folder: string, team: string): string => join(folder, 'tenants', 'teams', team.slice(-2), `${team}.db`)

test('[29-11] a reader that joins by a key of the right copy while a pass brings the files of tenants up ends with every file as the writer holds it', async (t) => {
  const world = worldOf(t)
  const first = await bundled(t, { project: 'teams' }, join(world.work, 'first'))
  const writerFolder = join(world.work, 'writer')
  const writer = await world.engine().open(first.folder, {
    dataFolder: writerFolder,
    mode: 'test',
    address: '*',
    own: machineAddress.writer,
  })
  world.apps[machineAddress.writer] = writer
  const teams: string[] = []
  for (let k = 0; k < 8; k++) {
    const team = String(Object(await writer.call('addTeam', { name: `team ${k}` }, { as: system })).id)
    teams.push(team)
    await writer.call('addOrder', { team, title: `order of ${k}` }, { as: system })
  }
  // A version that every file is brought up for: the pass begins with the switch, two files at a time.
  const next = await bundled(
    t,
    {
      project: 'teams',
      change: (d: Description) => {
        Object.assign(Object(d.tables.orders.columns), { rush: { kind: 'text', optional: true } })
      },
    },
    join(world.work, 'next'),
  )
  const copy = writeKey(writer, { name: 'near', rights: ['copy'] }).key
  const taken = await writer.switch(await writer.add(next.folder))
  assert.equal(taken.behind, 8, 'the pass has every file to bring up')
  const near = await world.engine().read({
    from: machineAddress.writer,
    key: copy,
    dataFolder: join(world.work, 'near'),
    own: machineAddress.near,
    reach: world.reach,
    address: '*',
  })
  world.apps[machineAddress.near] = near
  await current(world, near)
  await until('the pass has ended on the writer', () => {
    return teams.every((team) => ordersIn(fileOf(writerFolder, team)).columns.includes('rush'))
  })
  await until('the reader holds every write of the writer', () => near.at().n === writer.at().n)
  for (const team of teams)
    assert.deepEqual(
      ordersIn(fileOf(join(world.work, 'near'), team)),
      ordersIn(fileOf(writerFolder, team)),
      `the file of ${team}`,
    )
})
