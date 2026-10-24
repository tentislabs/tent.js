import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import test from 'node:test'
import { addOrder, addTeam, deskOf, fileOf, listed, logLines, readFile, titlesOf } from './desks.ts'
import { moment } from './many.ts'

const system = { as: { kind: 'system' } } as const

test('[50-6] a file that lies at the place of another tenant is held against its place before anything reads it: it is moved aside, the log says so once, that tenant has no file, and its next write makes one of its own', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'of the north')
  // The file of North is closed, and a copy of it is laid at the place of South, which has no file, while the app runs.
  app.clock.advance('2 minutes')
  await moment()
  const atSouth = fileOf(dataFolder, south)
  mkdirSync(dirname(atSouth), { recursive: true })
  cpSync(fileOf(dataFolder, north), atSouth)
  const said = (): number => logLines(dataFolder, 'names another tenant than the one it stands under').length
  // A heavy read, on a query thread, answers no row of it: the main thread moved the file aside first.
  const heavy: unknown[] = Object(await app.call('heavyOrders', { team: south }, system))
  assert.deepEqual(heavy, [])
  assert.equal(said(), 1)
  assert.deepEqual([existsSync(atSouth), existsSync(`${atSouth}.refused`)], [false, true])
  assert.deepEqual(logLines(dataFolder, 'names another tenant')[0].data, { table: 'teams', id: south, names: north })
  // South is a tenant with no file: a read answers no row, and the directory lists the file of North alone.
  assert.deepEqual(await titlesOf(app, south), [])
  assert.equal(await app.call('countOrders', { team: south }, system), 0)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.id),
    [north],
  )
  // The next write of South makes a file of its own, which names South and holds its order alone.
  await addOrder(app, south, 'of the south')
  assert.deepEqual(await titlesOf(app, south), ['of the south'])
  assert.deepEqual(await titlesOf(app, north), ['of the north'])
  assert.equal(said(), 1)
  // Laid there again while South has a file that is closed: the first read moves it aside again, and says so.
  app.clock.advance('2 minutes')
  await moment()
  cpSync(fileOf(dataFolder, north), atSouth)
  assert.deepEqual(await titlesOf(app, south), [])
  assert.equal(said(), 2)
  await app.kill()
  assert.deepEqual(
    readFile(`${atSouth}.refused`, `SELECT "value" FROM "_t_meta" WHERE "key" = 'tenant'`).map((row) => row.value),
    [JSON.stringify(north)],
  )
})
