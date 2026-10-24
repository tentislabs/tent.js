import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { copyOf } from './projects.ts'
import { addOrder, addTeam, appIn, command, deskOf, fileOf, teamFilesIn, hasFile, idOf, listed } from './desks.ts'

const system = { kind: 'system' } as const

/** The id of a tenant that was never made: 26 characters of an id's own letters. */
const madeUpId = (seed: number): string => `01${String(seed).padStart(24, '0')}`.slice(0, 26)

/** Answers the code and the message of what a promise is refused with, or `{ ok: true }` where it is kept. */
async function refusal(work: Promise<unknown>): Promise<{ code?: string; message?: string; ok?: true }> {
  try {
    await work
    return { ok: true }
  } catch (error) {
    return { code: String(Object(error).code), message: error instanceof Error ? error.message : String(error) }
  }
}

/** Holds that a text tells no path of the data folder, no text of SQL, and no row of another tenant. */
function tellsNothing(what: string, text: string, dataFolder: string): void {
  for (const leak of [dataFolder, 'tenants/', 'tenants\\', 'SELECT', 'INSERT', 'ATTACH', 'of the north', '.db'])
    assert.equal(text.includes(leak), false, `${what} leaked ${JSON.stringify(leak)}: ${text}`)
}

test('[50-12.1] raw SQL of a function with full access that names another tenant id, and one that names a file of the engine', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'vault'))
  const north = idOf(await app.call('addTeam', { name: 'North' }, { as: system }))
  const south = idOf(await app.call('addTeam', { name: 'South' }, { as: system }))
  await app.call('addOrder', { team: north, title: 'of the north' }, { as: system })
  await app.call('addOrder', { team: south, title: 'of the south' }, { as: system })

  // The control: raw SQL that names its own tenant reads the one order of its file.
  assert.equal(await app.call('rawNamesOwn', { team: north }, { as: system }), 1)
  // Raw SQL in North's file that names South's id finds nothing: the file holds one tenant, and SQL cannot leave it.
  assert.equal(await app.call('rawNamesOther', { team: north, other: south }, { as: system }), 0)
  assert.equal(await app.call('rawNamesOther', { team: south, other: north }, { as: system }), 0)

  // Raw SQL that names a table of the engine, that opens another file, that reads what tells of the file, or that
  // holds two statements: each is refused with T0013 before it runs, and what it tells holds no path and no SQL.
  const tries: [string, object][] = [
    ['rawMeta', { team: north }],
    ['rawSessions', { team: north }],
    ['rawAttach', { team: north, path: fileOf(dataFolder, south) }],
    ['rawPragma', { team: north }],
    ['rawTwo', { team: north }],
  ]
  for (const [name, input] of tries) {
    const told = await refusal(app.call(name, input, { as: system }))
    assert.equal(told.code, 'T0013', `${name}: ${told.message}`)
    tellsNothing(name, String(told.message), dataFolder)
  }
  // South is untouched: its one order still stands, read for South alone.
  assert.equal(await app.call('rawNamesOwn', { team: south }, { as: system }), 1)
  assert.deepEqual(teamFilesIn(dataFolder).sort(), [north, south].sort())
})

test('[50-12.8] a tenant removed around a read and a write of its file: no row of it or of another is answered, and the open files of others stay open', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  const west = await addTeam(app, 'West')
  await addOrder(app, north, 'of the north')
  await addOrder(app, south, 'of the south')
  await addOrder(app, west, 'of the west')
  // North's file is open and held throughout. A single writer serializes a write and a remove of one file, so the
  // two cannot interleave inside one write; the attack fires them at the same moment and holds the end state.
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === north)?.open, true)

  // Removed with a heavy read of its file fired at the same moment.
  const read = app.call('heavyOrders', { team: south }, { as: system })
  const [readOut] = await Promise.all([refusal(read), refusal(app.call('removeTeam', { team: south }, { as: system }))])
  if (readOut.ok) assert.equal(JSON.stringify(await read).includes('of the north'), false, 'the read leaked North')

  // Removed with a write of its file fired at the same moment.
  const write = app.call('addOrder', { team: west, title: 'racing the removal' }, { as: system })
  await Promise.all([refusal(write), refusal(app.call('removeTeam', { team: west }, { as: system }))])

  // The upkeep holds the disk against the directory either way: a file a race left for a gone tenant is removed.
  await refusal(listed(app, dataFolder, { stray: true }))

  // North is untouched and still open, answering its own order and nobody else's.
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === north)?.open, true)
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => String(row.title)),
    ['of the north'],
  )

  // South and West: no row of another tenant is answered, and there is no half state - a directory row with no
  // file that answers rows, or a file that answers rows with no directory row.
  for (const [id, own] of [
    [south, 'of the south'],
    [west, 'of the west'],
  ] as const) {
    const rows = (await app.rows('orders', { of: id }).catch(() => [])).map((row) => String(row.title))
    assert.equal(rows.includes('of the north'), false, `${id} leaked North`)
    const inDirectory = (await listed(app, dataFolder)).files.some((one) => one.id === id)
    if (inDirectory)
      assert.deepEqual(
        rows.filter((title) => title !== own),
        [],
        `${id} stands whole or answers nothing`,
      )
    else {
      assert.equal(hasFile(dataFolder, id), false, `${id} left a file with no row of the directory`)
      assert.deepEqual(rows, [], `${id} answered rows with no row of the directory`)
    }
  }
})

/** Drops a thing by hand at the place of a tenant's file, making the folders it needs. */
function craft(dataFolder: string, at: string, write: (path: string) => void): string {
  const path = fileOf(dataFolder, at)
  mkdirSync(dirname(path), { recursive: true })
  write(path)
  return path
}

test('[50-12.7] a tenant file laid by hand that is no data file, under an id of nobody, is removed by the upkeep', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  await app.restart()
  const nobody = madeUpId(9)
  craft(dataFolder, nobody, (path) => writeFileSync(path, Buffer.from('not a database, just bytes')))
  // The upkeep bears a file that is no data file under an id with no tenant row: it is removed, as the row says.
  await listed(app, dataFolder, { stray: true })
  assert.equal(hasFile(dataFolder, nobody), false, 'the upkeep removed the thing that is no data file')
  // No row of North leaked, and North keeps its file and its order.
  assert.equal(JSON.stringify(await app.rows('orders', { of: nobody }).catch(() => [])).includes('of the north'), false)
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => String(row.title)),
    ['of the north'],
  )
})

// Ids of nobody whose files stand in the first and in the last folder that the upkeep walks.
const first = `01${'0'.repeat(24)}`
const last = `01${'0'.repeat(22)}zz`

test('[50-12.11] a folder in the place of a tenant file, under an id of nobody: the upkeep removes it, tent data files --stray names it, and the walk goes on with every other file', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  await app.restart()
  const nobody = madeUpId(6)
  craft(dataFolder, nobody, (path) => mkdirSync(path, { recursive: true }))
  // A thing that is no data file lies before it and after it in the walk, each under an id of nobody.
  for (const id of [first, last]) craft(dataFolder, id, (path) => writeFileSync(path, Buffer.from('just bytes')))
  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.ok(stray, 'the command answered what the upkeep found')
  // Its tenant is gone: the folder is removed, and the command names it.
  assert.equal(existsSync(fileOf(dataFolder, nobody)), false, 'the folder was removed by the upkeep')
  assert.ok(stray.removed.includes(nobody), `the command names the folder: ${JSON.stringify(stray)}`)
  // The walk went on with every other file: what lay before the folder and after it is removed and named too.
  for (const id of [first, last]) {
    assert.equal(hasFile(dataFolder, id), false, `the walk reached ${id}`)
    assert.ok(stray.removed.includes(id), `the command names ${id}`)
  }
  // No row of North is read under the id, and North keeps its file and its order.
  assert.deepEqual(await app.rows('orders', { of: nobody }), [])
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => String(row.title)),
    ['of the north'],
  )
})

test('[50-12.11] a thing that is no data file, under the id of a tenant with no file: the upkeep moves it aside, tent data files --stray names it, and the walk goes on with every other file', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  // Ghost is a tenant with a row and no file of its own.
  const ghost = await addTeam(app, 'Ghost')
  await app.restart()
  craft(dataFolder, ghost, (path) => writeFileSync(path, Buffer.from('not a database, just bytes')))
  // A thing that is no data file lies in the first and in the last folder of the walk, each under an id of nobody.
  for (const id of [first, last]) craft(dataFolder, id, (path) => writeFileSync(path, Buffer.from('just bytes')))
  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.ok(stray, 'the command answered what the upkeep found')
  // Its tenant is there: the thing is moved aside, as a file that names another tenant is, and the command names it.
  assert.equal(hasFile(dataFolder, ghost), false, 'the thing was moved aside by the upkeep')
  assert.ok(stray.refused.includes(ghost), `the command names the thing: ${JSON.stringify(stray)}`)
  // The walk went on with every other file: what lay elsewhere under an id of nobody is removed and named.
  for (const id of [first, last]) {
    assert.equal(hasFile(dataFolder, id), false, `the walk reached ${id}`)
    assert.ok(stray.removed.includes(id), `the command names ${id}`)
  }
  // Ghost has no file and answers no row, the directory lists none for it, and it is then written into a file of its own.
  assert.deepEqual(await app.rows('orders', { of: ghost }), [])
  assert.equal(
    (await listed(app, dataFolder)).files.some((one) => one.id === ghost),
    false,
  )
  await addOrder(app, ghost, 'of the ghost')
  assert.deepEqual(
    (await app.rows('orders', { of: ghost })).map((row) => String(row.title)),
    ['of the ghost'],
  )
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => String(row.title)),
    ['of the north'],
  )
})

test('[50-12.5] a backup of one tenant put back under another, by each way a restore can be asked for', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  await addOrder(app, north, 'of the north')
  await addOrder(app, south, 'of the south')
  const backup = String(Object(await command(app, dataFolder, 'data', { what: 'backup', whole: true })).file)
  // As another user with the backup could do: the file of North is laid over the file of South in the backup.
  cpSync(fileOf(backup, north), fileOf(backup, south))

  // Way one: the command that puts one tenant back. It is refused, and South keeps its own order.
  const one = await refusal(command(app, dataFolder, 'data', { what: 'restore', file: backup, of: south }))
  assert.equal(one.code, 'T0009', `restore --of: ${one.message}`)
  tellsNothing('restore --of', String(one.message), dataFolder)

  // Way two: the whole restore, by the command. South's file in the backup is North's: a read of South after it
  // answers no order of North, and the directory never serves one tenant's rows under another's id.
  await refusal(command(app, dataFolder, 'data', { what: 'restore', file: backup }))
  const afterWhole = await refusal(app.rows('orders', { of: south }))
  if (afterWhole.ok)
    assert.equal(
      JSON.stringify(await app.rows('orders', { of: south })).includes('of the north'),
      false,
      'the whole restore served North under South',
    )
  // North itself is whole after the restore.
  assert.deepEqual(
    (await app.rows('orders', { of: north })).map((row) => String(row.title)),
    ['of the north'],
  )

  // Way three: `app.restore` of the same backup folder, direct. South still never answers North.
  await refusal(app.restore(backup))
  const afterApp = await refusal(app.rows('orders', { of: south }))
  if (afterApp.ok)
    assert.equal(
      JSON.stringify(await app.rows('orders', { of: south })).includes('of the north'),
      false,
      'app.restore served North under South',
    )
})

test('[50-12.1] a command that names a tenant by a path, by the id of another app row, and by nothing', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'of the north')
  const before = teamFilesIn(dataFolder)
  // The id of a row that is no tenant: a user's row id. It names no team, so no file is opened or made.
  const cy = await app.user({ name: 'Cy' })
  const userId = String(Object(Reflect.get(Object(cy), 'user')).id)

  const rows = (named: unknown) => command(app, dataFolder, 'data', { what: 'rows', table: 'orders', of: named })
  // By a path, and by an id with a slash or a backslash: `of` takes an id of 26 of its own letters, so each names
  // no tenant, and the read answers no row. Nothing climbs out of the data folder.
  const paths = [
    '../../etc/passwd',
    '..\\..\\windows',
    `${north}/../x`,
    'a/b',
    `${north}.db`,
    '      ',
    north.slice(0, 10),
  ]
  for (const named of paths) {
    const answer = await refusal(rows(named))
    if (answer.ok) assert.deepEqual(await rows(named), [], `a path ${JSON.stringify(named)} named a tenant`)
    else assert.ok(answer.code, `a path ${JSON.stringify(named)} was refused cleanly`)
  }
  // By the id of another app's row (a user) and by a made-up id: both name no team, so no rows and no file.
  for (const named of [userId, madeUpId(42)]) assert.deepEqual(await rows(named), [], `${named} named a tenant`)
  // By nothing: a tenant table, with no `of`, is T0002.
  assert.equal((await refusal(rows(undefined))).code, 'T0002')

  // A restore and a retry named by a path: each is refused cleanly, and nothing of the data folder is touched.
  assert.ok(
    (await refusal(command(app, dataFolder, 'data', { what: 'restore', file: dataFolder, of: '../../x' }))).code,
  )
  assert.ok((await refusal(command(app, dataFolder, 'data', { what: 'files', retry: '../../x' }))).code)

  // No file was made by any of it, and North's one file still stands with its order.
  assert.deepEqual(teamFilesIn(dataFolder), before.includes(north) ? before : [...before, north].sort())
  assert.equal(hasFile(dataFolder, north), true)
  assert.ok(!existsSync(join(dataFolder, '..', 'etc')) && !existsSync(join(dataFolder, 'etc')), 'nothing climbed out')
  rmSync(join(dataFolder, 'nothing-here'), { force: true, recursive: true })
})
