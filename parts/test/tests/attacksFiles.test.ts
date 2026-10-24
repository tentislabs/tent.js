import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
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
  logLines,
  readFile,
} from './desks.ts'

/** The id of a tenant that was never made: 26 characters of an id's own letters. */
const madeUpId = (seed: number): string => `01${String(seed).padStart(24, '0')}`.slice(0, 26)

/** Answers the code of what a promise is refused with, or nothing where it is kept. */
async function codeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : `no code: ${error}`
  }
  return undefined
}

test('[50-12.1] a caller who names a tenant they may not reach, and a row of ids of nobody: no row, no file opened and none made, and the open files of others stay open', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  // Cy is a member of North alone. North's rule lets its members in; South's keeps them out.
  const cy: Caller = await app.user({ name: 'Cy' })
  const cyId = String(Reflect.get(Object(cy), 'user') && Object(Reflect.get(cy, 'user')).id)
  await app.write([{ add: 'members', values: { team: north, user: cyId } }], { as: 'system' })
  // North's file is opened by a write of its member.
  const order = idOf(await app.as(cy).call('addOrder', { team: north, title: 'of the north' }))
  assert.equal(hasFile(dataFolder, north), true)
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === north)?.open, true)

  // As Cy, a query and a change that name South, which Cy may not reach.
  assert.deepEqual(await app.as(cy).call('listOrders', { team: south }), [])
  assert.equal(await codeOf(app.as(cy).call('addOrder', { team: south, title: 'into the south' })), 'T3101')
  assert.equal(
    await codeOf(app.write([{ change: 'orders', of: south, id: order, values: { title: 'x' } }], { as: cy })),
    'T2103',
  )
  assert.equal(await codeOf(app.write([{ remove: 'orders', of: south, id: order }], { as: cy })), 'T2103')
  // No file of South was opened or made.
  assert.equal(hasFile(dataFolder, south), false)
  assert.equal(teamFilesIn(dataFolder).includes(south), false)

  // A run of made-up ids that name no tenant, each in a query and some as a change: no file is made for any, and
  // North's file stays open all the while. The night test runs ten thousand of them, as the row says; this one
  // a hundred, so that it ends within some seconds.
  for (let i = 0; i < 100; i++) {
    const id = madeUpId(i)
    assert.deepEqual(await app.as(cy).call('listOrders', { team: id }), [], `query ${i}`)
    if (i % 20 === 0)
      assert.equal(await codeOf(app.as(cy).call('addOrder', { team: id, title: 'x' })), 'T3101', `add ${i}`)
  }
  assert.deepEqual(teamFilesIn(dataFolder), [north])
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === north)?.open, true)
})

test('[50-12.1] [night] 10,000 ids that name no tenant in a row: no file is made, the open file of another stays open, and the app keeps answering', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const cy: Caller = await app.user({ name: 'Cy' })
  const cyId = String(Reflect.get(Object(cy), 'user') && Object(Reflect.get(cy, 'user')).id)
  await app.write([{ add: 'members', values: { team: north, user: cyId } }], { as: 'system' })
  await app.as(cy).call('addOrder', { team: north, title: 'of the north' })
  const began = performance.now()
  for (let i = 0; i < 10_000; i++) {
    const id = madeUpId(i)
    assert.deepEqual(await app.as(cy).call('listOrders', { team: id }), [], `query ${i}`)
    if (i % 1000 === 0)
      assert.equal(await codeOf(app.as(cy).call('addOrder', { team: id, title: 'x' })), 'T3101', `add ${i}`)
  }
  // The app keeps answering: the member's own team is read at once, and no file was made for a made-up id.
  const own = (await app.as(cy).call('listOrders', { team: north })) as { title: string }[]
  assert.deepEqual(
    own.map((row) => row.title),
    ['of the north'],
  )
  assert.deepEqual(teamFilesIn(dataFolder), [north])
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === north)?.open, true)
  assert.ok(performance.now() - began < 180_000, 'ten thousand named-tenant reads were answered in time')
})

test('[50-12.5] a backup of one tenant put back over another tenant file is refused: a file holds its table and its tenant', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  await addOrder(app, north, 'of the north')
  await addOrder(app, south, 'of the south')
  // A whole backup holds the shared file and both tenants' files.
  const backup: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'backup', whole: true }),
  )
  const folder = String(backup.file)
  assert.equal(existsSync(fileOf(folder, north)), true)
  assert.equal(existsSync(fileOf(folder, south)), true)
  // The file of North is put over the file of South in the backup, as another user with the backup could do.
  cpSync(fileOf(folder, north), fileOf(folder, south))
  // Putting South back from that backup is refused: the file under South names North in its own `_t_meta`.
  assert.equal(await codeOf(command(app, dataFolder, 'data', { what: 'restore', file: folder, of: south })), 'T0009')
  // South's own file is as it was: it holds the order of the south and none of the north.
  const rows = readFile(fileOf(dataFolder, south), 'SELECT "title" FROM "orders"').map((one) => String(one.title))
  assert.deepEqual(rows, ['of the south'])
})

/** Drops the data file of one tenant by hand at the place of another id, with what stands beside it. */
function dropped(dataFolder: string, from: string, at: string): string {
  const path = fileOf(dataFolder, at)
  mkdirSync(dirname(path), { recursive: true })
  cpSync(fileOf(dataFolder, from), path)
  for (const beside of ['-wal', '-shm'])
    if (existsSync(`${fileOf(dataFolder, from)}${beside}`))
      cpSync(`${fileOf(dataFolder, from)}${beside}`, `${path}${beside}`)
  return path
}

test('[50-12.7] a file dropped into tenants/ by hand under the id of a tenant is refused where its own _t_meta names another tenant, and one under an id of nobody is removed by the upkeep', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  await addOrder(app, north, 'of the north')
  await app.restart()
  // South has no file. The file of North is dropped at the place of South, and at the place of a tenant that never was.
  const nobody = madeUpId(7)
  const atSouth = dropped(dataFolder, north, south)
  const forNobody = dropped(dataFolder, north, nobody)

  const stray = (await listed(app, dataFolder, { stray: true })).stray
  assert.ok(stray, 'the command answered what the upkeep found')
  // The one under an id of nobody is removed by the upkeep.
  assert.deepEqual(stray.removed, [nobody])
  assert.equal(existsSync(forNobody), false)
  // The one under the id of South names North as its own: it is refused, moved aside, and read for nobody.
  assert.deepEqual(stray.refused, [south])
  assert.equal(existsSync(atSouth), false)
  assert.equal(hasFile(dataFolder, south), false)
  assert.equal(logLines(dataFolder, 'names another tenant').length, 1)
  assert.deepEqual(await app.rows('orders', { of: south }), [])
  assert.equal(
    (await listed(app, dataFolder)).files.some((one) => one.id === south || one.id === nobody),
    false,
  )
  // South is written anew into a file of its own, and North is as it was.
  await addOrder(app, south, 'of the south')
  const titles = async (team: string): Promise<string[]> =>
    (await app.rows('orders', { of: team })).map((row) => String(row.title))
  assert.deepEqual(await titles(south), ['of the south'])
  assert.deepEqual(await titles(north), ['of the north'])
  assert.deepEqual(
    readFile(fileOf(dataFolder, south), `SELECT "value" FROM "_t_meta" WHERE "key" = 'tenant'`).map((row) =>
      JSON.parse(String(row.value)),
    ),
    [south],
  )
})

test('[50-12.7] a file dropped under the id of a tenant is read and written for nobody before the upkeep has run: its own _t_meta names another tenant', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const north = await addTeam(app, 'North')
  const south = await addTeam(app, 'South')
  await addOrder(app, north, 'of the north')
  await app.restart()
  const atSouth = dropped(dataFolder, north, south)
  // Asked at once, with no upkeep between: whoever names South is answered no row of North, by any way.
  const answers: Record<string, unknown> = {
    'a query by a plan': await app
      .as('system')
      .call('listOrders', { team: south })
      .catch((error: unknown) => Object(error).code),
    'a query in code': await app
      .as('system')
      .call('countOrders', { team: south })
      .catch((error: unknown) => Object(error).code),
    'a read of the program': await app.rows('orders', { of: south }).catch((error: unknown) => Object(error).code),
  }
  for (const [what, answer] of Object.entries(answers)) {
    assert.equal(
      JSON.stringify(answer).includes('of the north'),
      false,
      `${what} answered a row of North: ${JSON.stringify(answer)}`,
    )
    assert.ok(
      typeof answer === 'string' || answer === 0 || (Array.isArray(answer) && answer.length === 0),
      `${what} answered ${JSON.stringify(answer)}`,
    )
  }
  // A write for South does not land in the file that names North.
  await addOrder(app, south, 'of the south').catch(() => undefined)
  await app.close()
  const lying = existsSync(atSouth)
    ? readFile(atSouth, 'SELECT "title" FROM "orders"').map((row) => String(row.title))
    : []
  assert.equal(
    lying.includes('of the north') && lying.includes('of the south'),
    false,
    'the order of South was written into the file that holds the orders of North',
  )
})
