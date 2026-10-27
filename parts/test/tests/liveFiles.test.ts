import assert from 'node:assert/strict'
import test from 'node:test'
import { addOrder, addTeam, callsIn, deskOf, hasFile, readerFolder } from './desks.ts'
import { current, level, moment, readersHeld, until } from './many.ts'
import type { Watcher } from './watched.ts'
import { watcher } from './watched.ts'

/** The titles that the last message of a watch holds. */
const held = (page: Watcher, id: string): unknown => page.got.findLast((one) => one.id === id)?.value

test("[50-7] a page that watches a query over two tenants' files is sent the change of a write to either, and nothing for a write to a third; a page that watches a tenant with no file yet is sent the first row", async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south, east, west] = [
    await addTeam(app, 'North'),
    await addTeam(app, 'South'),
    await addTeam(app, 'East'),
    await addTeam(app, 'West'),
  ]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  await addOrder(app, east, 'a shelf')
  const page = watcher(app)
  const first = await page.watch('two', 'ordersOf', { input: { teams: [north, south] } })
  assert.deepEqual([first.t, first.value], ['result', ['a lamp', 'a desk']])

  // A write to either file is sent the page.
  const rug = await addOrder(app, north, 'a rug')
  await until('the page is sent the order of the first team', () => page.got.length === 2)
  assert.deepEqual(held(page, 'two'), ['a lamp', 'a rug', 'a desk'])
  await addOrder(app, south, 'a chair')
  await until('the page is sent the order of the second team', () => page.got.length === 3)
  assert.deepEqual(held(page, 'two'), ['a lamp', 'a rug', 'a desk', 'a chair'])

  // A write to the file of a third tenant is none of this page's: its query is not even run again.
  const runs = callsIn(dataFolder, 'ordersOf')
  await addOrder(app, east, 'a stool')
  await addTeam(app, 'One more')
  await moment(200)
  assert.deepEqual([page.got.length, callsIn(dataFolder, 'ordersOf')], [3, runs])
  // Neither is a write of another table in a file that the page follows: the query read the orders of that file,
  // and a line of an order is none of them.
  await app.call('addLine', { team: north, order: rug, qty: 2 }, { as: { kind: 'system' } })
  await moment(200)
  assert.deepEqual([page.got.length, callsIn(dataFolder, 'ordersOf')], [3, runs])

  // A tenant with no file yet: the page that watches it is sent its first row, which makes the file.
  assert.equal(hasFile(dataFolder, west), false)
  assert.deepEqual((await page.watch('none', 'ordersOf', { input: { teams: [west] } })).value, [])
  assert.equal(hasFile(dataFolder, west), false)
  await addOrder(app, west, 'the first')
  await until('the page is sent the first row of the tenant', () => page.of('result', 'none').length === 2)
  assert.deepEqual(held(page, 'none'), ['the first'])
  // The write of that tenant was none of the first watch's.
  assert.equal(page.of('result', 'two').length + page.of('rows', 'two').length, 3)
})

test(
  "[50-7] a page on a reader that watches a query over two tenants' files is sent the change of a write to either, and nothing for a write to a third",
  readersHeld,
  async (t) => {
    const desk = await deskOf(t)
    const { app } = desk
    const [north, south, east, west] = [
      await addTeam(app, 'North'),
      await addTeam(app, 'South'),
      await addTeam(app, 'East'),
      await addTeam(app, 'West'),
    ]
    await addOrder(app, north, 'a lamp')
    await addOrder(app, east, 'a shelf')
    const near = await app.reader()
    await current(app, near)
    await level(app, near)
    const page = watcher(near)
    // One file is there, and one is not yet.
    assert.deepEqual((await page.watch('two', 'ordersOf', { input: { teams: [north, south] } })).value, ['a lamp'])
    await addOrder(app, south, 'a desk')
    await until('the page of the reader is sent the first row of a tenant', () => page.got.length === 2)
    assert.deepEqual(held(page, 'two'), ['a lamp', 'a desk'])
    await addOrder(app, north, 'a rug')
    await until('the page of the reader is sent the order', () => page.got.length === 3)
    assert.deepEqual(held(page, 'two'), ['a lamp', 'a rug', 'a desk'])
    // The reader ran the query itself, and does not run it again for a write to the file of another tenant.
    const runs = callsIn(readerFolder(desk, 2), 'ordersOf')
    assert.ok(runs >= 3)
    await addOrder(app, east, 'a stool')
    await addOrder(app, west, 'a first one')
    await level(app, near)
    await moment(200)
    assert.deepEqual([page.got.length, callsIn(readerFolder(desk, 2), 'ordersOf')], [3, runs])
    assert.equal(callsIn(desk.dataFolder, 'ordersOf'), 0)
  },
)
