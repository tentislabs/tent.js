import assert from 'node:assert/strict'
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { App } from '../../engine/index.ts'
import {
  addOrder,
  addTeam,
  command,
  deskOf,
  fileOf,
  teamFilesIn,
  hasFile,
  idOf,
  listed,
  readFile,
  titlesOf,
} from './desks.ts'
import { codeOf, moment } from './many.ts'

const system = { as: { kind: 'system' } } as const

/** Takes a backup of a running app, and answers its folder and the number of the last write it holds. */
async function backedUp(app: App, dataFolder: string, flags: object = {}): Promise<{ folder: string; writes: number }> {
  const answer: Record<string, unknown> = Object(await command(app, dataFolder, 'data', { what: 'backup', ...flags }))
  assert.equal(typeof answer.file, 'string')
  return { folder: String(answer.file), writes: Number(answer.writes) }
}

/** The list of a backup: every file of the directory, with the name of the backup folder that holds it. */
const listOf = (folder: string): { table: string; id: string; backup: string }[] =>
  JSON.parse(readFileSync(join(folder, 'files.json'), 'utf8'))

test('[50-8@4] a backup after ten writes to three of 100 tenants holds the shared file and those three, and a whole restore from it, after the backup before it aged out, puts back all 100', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 100; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `the order of ${i}`)
  }
  const first = await backedUp(app, dataFolder)
  assert.equal(teamFilesIn(first.folder).length, 100)
  assert.equal(existsSync(join(first.folder, 'data.db')), true)

  // Ten writes to three tenants.
  const written = [teams[4], teams[40], teams[77]]
  for (let i = 0; i < 10; i++) await addOrder(app, written[i % 3], `write ${i}`)
  const second = await backedUp(app, dataFolder)
  assert.ok(second.writes > first.writes)
  assert.equal(existsSync(join(second.folder, 'data.db')), true)
  assert.deepEqual(teamFilesIn(second.folder), [...written].sort())
  // Its list names every file of the directory, with the backup that holds it.
  const list = listOf(second.folder)
  assert.equal(list.length, 100)
  const [one, two] = [first.folder, second.folder].map((folder) => folder.split(/[\\/]/).at(-1))
  for (const entry of list) {
    assert.equal(entry.table, 'teams')
    assert.equal(entry.backup, written.includes(entry.id) ? two : one, entry.id)
  }

  // The project keeps two backups: with the third, the first ages out, and its files go into the oldest kept one.
  const third = await backedUp(app, dataFolder)
  assert.equal(existsSync(first.folder), false)
  assert.equal(teamFilesIn(second.folder).length, 100)
  assert.deepEqual(teamFilesIn(third.folder), [])
  for (const folder of [second.folder, third.folder])
    assert.deepEqual([...new Set(listOf(folder).map((entry) => entry.backup))], [two])

  // After the backup: a write to a tenant it holds, and a tenant that it does not name.
  await addOrder(app, teams[9], 'after the backup')
  const late = await addTeam(app, 'late')
  await addOrder(app, late, 'of a tenant that the backup does not name')
  assert.equal(hasFile(dataFolder, late), true)

  // A whole restore from the second backup puts back all 100, each as the backup holds it.
  await command(app, dataFolder, 'data', { what: 'restore', file: second.folder })
  for (const [i, team] of teams.entries()) {
    const more = written.includes(team)
      ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => written[n % 3] === team).map((n) => `write ${n}`)
      : []
    assert.deepEqual(await titlesOf(app, team), [`the order of ${i}`, ...more], `team ${i}`)
  }
  // The file that the backup does not name is removed, and the directory is built anew from the files.
  assert.equal(hasFile(dataFolder, late), false)
  assert.deepEqual(await titlesOf(app, late), [])
  const after = (await listed(app, dataFolder)).files
  assert.equal(after.length, 100)
  assert.deepEqual(after.map((entry) => entry.id).sort(), [...teams].sort())
})

test('[50-8@4] a whole restore of a backup made while writes went on removes no row that the backup holds', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 12; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `the order of ${i}`)
  }
  // While the backup copies file after file, people are added and place orders in every team.
  const taking = backedUp(app, dataFolder)
  let ended = false
  void taking.finally(() => {
    ended = true
  })
  for (let round = 0; !ended && round < 400; round++) {
    const caller = await app.user({ name: `person ${round}`, roles: [] })
    const person = caller.kind === 'user' ? (caller.user?.id ?? '') : ''
    await addOrder(app, teams[round % 12], `placed in round ${round}`, { placedBy: person })
    await moment(0)
  }
  const { folder } = await taking

  // What the backup holds, read from its files with no engine.
  const held = new Map<string, string[]>()
  for (const team of teams) {
    const copy = join(folder, fileOf(dataFolder, team).slice(dataFolder.length + 1))
    assert.equal(existsSync(copy), true)
    held.set(
      team,
      readFile(copy, 'SELECT "id" FROM "orders" ORDER BY "id"').map((row) => String(row.id)),
    )
  }
  assert.ok(
    [...held.values()].some((ids) => ids.length > 1),
    'a write reached the backup while it was made',
  )

  await command(app, dataFolder, 'data', { what: 'restore', file: folder })
  // Every file is swept when it is next opened, and no row that the backup holds links to a person it lacks.
  for (const team of teams) {
    const read = await app.read({ from: 'orders', of: team, sort: [{ by: 'id' }] }, { as: 'system' })
    assert.deepEqual(Object(read).map(idOf), held.get(team), team)
  }
})

test('[50-8@4] [16-2@4] one tenant is put back alone, also after its row was removed, and is refused under another tenant', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  const { folder } = await backedUp(app, dataFolder)
  await addOrder(app, north, 'after the backup')
  await addOrder(app, south, 'kept')

  // North is put back alone: South keeps what it wrote since.
  const answer = await command(app, dataFolder, 'data', { what: 'restore', file: folder, of: north })
  assert.deepEqual(answer, { restored: folder, of: north })
  assert.deepEqual(await titlesOf(app, north), ['a lamp'])
  assert.deepEqual(await titlesOf(app, south), ['a desk', 'kept'])
  await addOrder(app, north, 'written after it was put back')
  assert.deepEqual(await titlesOf(app, north), ['a lamp', 'written after it was put back'])

  // After its row was removed, the row is put back first, from the shared file of the same backup.
  await app.call('removeTeam', { team: north }, system)
  assert.deepEqual(await titlesOf(app, north), [])
  await command(app, dataFolder, 'data', { what: 'restore', file: folder, of: north })
  assert.deepEqual(
    (await app.rows('teams')).filter((row) => row.id === north).map((row) => row.name),
    ['North'],
  )
  assert.deepEqual(await titlesOf(app, north), ['a lamp'])

  // A file holds its table and its tenant: the copy of North under the name of South is refused, and nothing is put back.
  const [from, to] = [north, south].map((team) => join(folder, fileOf(dataFolder, team).slice(dataFolder.length + 1)))
  cpSync(from, to)
  assert.equal(await codeOf(command(app, dataFolder, 'data', { what: 'restore', file: folder, of: south })), 'T0009')
  assert.deepEqual(await titlesOf(app, south), ['a desk', 'kept'])
  // A tenant that the backup holds no file of, and an id that names no tenant, are refused too.
  const east = await addTeam(app, 'East')
  assert.equal(await codeOf(command(app, dataFolder, 'data', { what: 'restore', file: folder, of: east })), 'T0009')
  assert.equal(
    typeof (await codeOf(command(app, dataFolder, 'data', { what: 'restore', file: folder, of: '../x' }))),
    'string',
  )
})

test('[50-8@4] mark and back take every file, and a snapshot of an app that keeps files of tenants is a folder in the form of a whole backup', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  const mark = await app.mark()
  // The mark is a folder: the shared file, every file of a tenant, and the list.
  assert.deepEqual(teamFilesIn(mark.file), [north, south].sort())
  assert.deepEqual(readdirSync(mark.file).sort(), ['data.db', 'files.json', 'tenants'])

  await addOrder(app, north, 'after the mark')
  const east = await addTeam(app, 'East')
  await addOrder(app, east, 'of a tenant made after the mark')
  await app.back(mark)
  assert.deepEqual(await titlesOf(app, north), ['a lamp'])
  assert.deepEqual(await titlesOf(app, south), ['a desk'])
  assert.equal(hasFile(dataFolder, east), false)
  assert.deepEqual(
    (await app.rows('teams')).map((row) => row.name),
    ['North', 'South'],
  )
  // `rows` of a tenant table reads one tenant with `of`, and without it every tenant in turn.
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => row.title),
    ['a lamp'],
  )
  assert.deepEqual((await app.rows('orders')).map((row) => row.title).sort(), ['a desk', 'a lamp'])
  // `snapshot` answers the highest number that a file of the folder holds.
  const { writes } = await app.snapshot(join(mark.file, '..', 'by-hand'))
  assert.equal(writes, app.at().n)
})
