import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, listed, logLines, titlesOf } from './desks.ts'
import { moment } from './many.ts'

const system = { as: { kind: 'system' } } as const

/** Lays a thing by hand at the place of the file of a tenant: a folder, or bytes that are no data file. */
function laid(dataFolder: string, at: string, what: 'folder' | 'bytes'): string {
  const path = fileOf(dataFolder, at)
  mkdirSync(dirname(path), { recursive: true })
  rmSync(path, { recursive: true, force: true })
  if (what === 'folder') mkdirSync(path)
  else writeFileSync(path, Buffer.from('bytes that are no data file'))
  return path
}

const nobody = (n: number): string => `0000000000000000000000${String(n).padStart(4, '0')}`

test('[50-6] the upkeep bears a folder and a thing that is no data file under tenants/: it removes each where its tenant is gone, moves each aside where its tenant is there, also one that the directory lists, says so once, and goes on with every other file', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south, ghost, west] = [
    await addTeam(app, 'North'),
    await addTeam(app, 'South'),
    await addTeam(app, 'Ghost'),
    await addTeam(app, 'West'),
  ]
  for (const team of [north, south, west]) await addOrder(app, team, `of ${team === north ? 'the north' : 'another'}`)
  app.clock.advance('2 minutes')
  await moment()
  // Ghost has a row and no file: a folder lies at its place. South and West have files that the directory lists:
  // bytes that are no data file lie at the place of the one, and a folder at the place of the other.
  const paths = {
    ghost: laid(dataFolder, ghost, 'folder'),
    south: laid(dataFolder, south, 'bytes'),
    west: laid(dataFolder, west, 'folder'),
  }
  const gone = [nobody(1), nobody(2)]
  laid(dataFolder, gone[0], 'folder')
  writeFileSync(`${laid(dataFolder, gone[1], 'bytes')}`, Buffer.from('more bytes'))
  const said = (): number => logLines(dataFolder, 'is no data file').length
  // The directory is listed with those things under it: nothing of them is read as a file.
  assert.deepEqual((await listed(app, dataFolder)).files.map((one) => one.id).sort(), [north, south, west].sort())

  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.ok(stray)
  // Each thing whose tenant is gone is removed, and each whose tenant is there is moved aside, and named so.
  assert.deepEqual([...stray.removed].sort(), gone)
  assert.deepEqual([...stray.refused].sort(), [ghost, south, west].sort())
  for (const id of gone) assert.equal(existsSync(fileOf(dataFolder, id)), false, id)
  for (const path of Object.values(paths))
    assert.deepEqual([existsSync(path), existsSync(`${path}.refused`)], [false, true], path)
  assert.equal(statSync(`${paths.ghost}.refused`).isDirectory(), true)
  // The log says each once, and the walk went on: North is as it was.
  assert.equal(said(), 5)
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  // Each of the three is a tenant with no file now: the directory lists none for it, and its next write makes one.
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.id),
    [north],
  )
  for (const team of [ghost, south, west]) assert.deepEqual(await titlesOf(app, team), [])
  await addOrder(app, south, 'of the south, anew')
  assert.deepEqual(await titlesOf(app, south), ['of the south, anew'])
  // Done once more, the upkeep finds nothing of it, and says nothing more.
  const again = (await listed(app, dataFolder, { stray: true })).stray
  assert.deepEqual([again?.removed, again?.refused], [[], []])
  assert.equal(said(), 5)
})

test('[50-6] the sweep that tent data files --sweep starts bears a thing that is no data file under the row of a tenant: it moves it aside, says so, and sweeps every other file', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south, west] = [await addTeam(app, 'North'), await addTeam(app, 'South'), await addTeam(app, 'West')]
  const caller = await app.user({ name: 'Ada', roles: [] })
  const ada = caller.kind === 'user' ? (caller.user?.id ?? '') : ''
  for (const team of [north, south, west]) {
    await addOrder(app, team, 'placed by Ada', { placedBy: ada })
    await addOrder(app, team, 'placed by nobody')
  }
  app.clock.advance('2 minutes')
  await moment()
  // Every file is closed and unswept, and the directory lists the three. South is bytes now, and West a folder.
  await app.call('removeUser', { user: ada }, system)
  laid(dataFolder, south, 'bytes')
  laid(dataFolder, west, 'folder')
  // The directory says of each of the three that it is unswept: it reads no file to say so.
  const unswept = (await listed(app, dataFolder, { unswept: true })).files.map((one) => one.id)
  assert.deepEqual([...unswept].sort(), [north, south, west].sort())
  // The sweep reaches North, and bears the two: each is moved aside, and its tenant has no file.
  assert.equal((await listed(app, dataFolder, { sweep: true })).swept, 1)
  assert.deepEqual(await titlesOf(app, north), ['placed by nobody'])
  for (const team of [south, west]) {
    assert.deepEqual(
      [existsSync(fileOf(dataFolder, team)), existsSync(`${fileOf(dataFolder, team)}.refused`)],
      [false, true],
    )
    assert.deepEqual(await titlesOf(app, team), [])
  }
  assert.equal(logLines(dataFolder, 'is no data file').length, 2)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.id),
    [north],
  )
})
