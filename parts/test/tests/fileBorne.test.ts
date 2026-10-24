import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, listed, logLines, titlesOf } from './desks.ts'
import { codeOf, moment } from './many.ts'

/** The things that a hand lays at the place of the data file of a tenant, each of which a store cannot read. */
const things = {
  // A database of SQLite that is none of ours: it holds a table, and no `_t_meta`.
  'a database with no _t_meta': (path: string): void => {
    const db = new DatabaseSync(path)
    db.exec('CREATE TABLE "notes" ("id" TEXT PRIMARY KEY, "words" TEXT)')
    db.exec(`INSERT INTO "notes" VALUES ('1', 'of somebody else')`)
    db.close()
  },
  // A data file that is cut off: the first hundred bytes of a true one.
  'a data file that is cut off': (path: string, from: string): void =>
    writeFileSync(path, readFileSync(from).subarray(0, 100)),
  'a file that holds nothing': (path: string): void => writeFileSync(path, ''),
}

/** Lays one of the things at the place of the file of a tenant, and answers the place. */
function laid(dataFolder: string, at: string, what: keyof typeof things, from: string): string {
  const path = fileOf(dataFolder, at)
  mkdirSync(dirname(path), { recursive: true })
  rmSync(path, { recursive: true, force: true })
  things[what](path, from)
  return path
}

const nobody = (n: number): string => `0000000000000000000000${String(n).padStart(4, '0')}`
const lastOfAll = 'zzzzzzzzzzzzzzzzzzzzzzzzzz'

for (const what of Object.keys(things) as (keyof typeof things)[])
  test(`[50-6] the upkeep bears ${what} at the place of the file of a tenant: it is moved aside where the tenant is there and removed where it is gone, the log says so, and the walk goes on to its last file`, async (t) => {
    const { app, dataFolder } = await deskOf(t)
    const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
    await addOrder(app, north, 'of the north')
    app.clock.advance('2 minutes')
    await moment()
    const true_ = fileOf(dataFolder, north)
    // South has a row and no file. The first and the last place of the walk are of tenants that are gone.
    const atSouth = laid(dataFolder, south, what, true_)
    const gone = [nobody(1), lastOfAll]
    for (const id of gone) laid(dataFolder, id, what, true_)
    const stray = (await listed(app, dataFolder, { stray: true })).stray
    assert.ok(stray)
    assert.deepEqual([...stray.removed].sort(), gone)
    assert.deepEqual(stray.refused, [south])
    assert.deepEqual([existsSync(atSouth), existsSync(`${atSouth}.refused`)], [false, true])
    for (const id of gone) assert.equal(existsSync(fileOf(dataFolder, id)), false, id)
    assert.equal(logLines(dataFolder, 'is no data file').length, 3)
    // North is as it was, and South is a tenant with no file, whose next write makes one.
    assert.deepEqual(await titlesOf(app, north), ['of the north'])
    assert.deepEqual(await titlesOf(app, south), [])
    await addOrder(app, south, 'of the south')
    assert.deepEqual(await titlesOf(app, south), ['of the south'])
    // Done once more, the upkeep finds nothing of it.
    const again = (await listed(app, dataFolder, { stray: true })).stray
    assert.deepEqual([again?.removed, again?.refused], [[], []])
  })

test('[50-6] a folder in the place of a file that SQLite keeps beside a data file is moved aside by the upkeep, which goes on, and the tenant answers its rows again', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'of the north')
  await addOrder(app, south, 'of the south')
  app.clock.advance('2 minutes')
  await moment()
  // Both files are closed. A folder is laid beside the file of North, where SQLite keeps its writes ahead.
  const beside = `${fileOf(dataFolder, north)}-wal`
  mkdirSync(beside)
  laid(dataFolder, lastOfAll, 'a file that holds nothing', '')
  assert.equal(await codeOf(titlesOf(app, north)), 'T0009')
  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.ok(stray)
  assert.deepEqual([stray.refused, stray.removed], [[north], [lastOfAll]])
  assert.deepEqual([existsSync(beside), statSync(`${beside}.refused`).isDirectory()], [false, true])
  assert.equal(logLines(dataFolder, 'beside the data file of a tenant').length, 1)
  // The file of North itself was a data file all along: its rows are answered again.
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  assert.deepEqual(await titlesOf(app, south), ['of the south'])
  assert.deepEqual((await listed(app, dataFolder)).files.map((one) => one.id).sort(), [north, south].sort())
})

test('[50-6] a file that holds rows and names no tenant is no file that was just made: it is not opened at the place it lies at, and is moved aside by the first read and by the upkeep, as one that names another tenant is', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south, west] = [await addTeam(app, 'North'), await addTeam(app, 'South'), await addTeam(app, 'West')]
  await addOrder(app, north, 'of the north')
  app.clock.advance('2 minutes')
  await moment()
  // The file of North, with what it says of its tenant and its table taken out, is laid under South and under West.
  const places = [south, west].map((team) => {
    const path = fileOf(dataFolder, team)
    mkdirSync(dirname(path), { recursive: true })
    cpSync(fileOf(dataFolder, north), path)
    const db = new DatabaseSync(path)
    db.exec(`DELETE FROM "_t_meta" WHERE "key" IN ('tenant', 'table')`)
    db.close()
    return path
  })
  const said = (): number => logLines(dataFolder, 'names another tenant than the one it stands under').length
  // A read of South answers no row of North, with full access.
  assert.deepEqual(await app.rows('orders', { of: south }), [])
  assert.deepEqual([existsSync(places[0]), existsSync(`${places[0]}.refused`)], [false, true])
  assert.equal(said(), 1)
  // The upkeep finds the one under West, which nothing has read.
  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.deepEqual(stray?.refused, [west])
  assert.deepEqual([existsSync(places[1]), existsSync(`${places[1]}.refused`)], [false, true])
  assert.equal(said(), 2)
  // A file that was just made holds no row yet and names no tenant: the first write of South makes one, and it stands.
  await addOrder(app, south, 'of the south')
  assert.deepEqual(await titlesOf(app, south), ['of the south'])
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  assert.equal(said(), 2)
  // Laid there again while the file of South is closed: a heavy read, on a query thread, answers no row of it.
  app.clock.advance('2 minutes')
  await moment()
  cpSync(places[1].replace(/$/, '.refused'), places[0])
  const heavy: unknown[] = Object(await app.call('heavyOrders', { team: south }, { as: { kind: 'system' } }))
  assert.deepEqual(heavy, [])
  assert.equal(said(), 3)
})
