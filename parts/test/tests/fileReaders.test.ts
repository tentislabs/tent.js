import assert from 'node:assert/strict'
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import type { App } from '../../engine/index.ts'
import {
  addOrder,
  addTeam,
  callsIn,
  command,
  dataPlace,
  deskBundle,
  deskOf,
  fileOf,
  teamFilesIn,
  hasFile,
  idOf,
  listed,
  logLines,
  ordersOf,
  pairOf,
  readerFolder,
  readFile,
  titlesOf,
  writeFile,
} from './desks.ts'
import { beat, codeOf, current, level, moment, until } from './many.ts'

const system = { as: { kind: 'system' } } as const

/** What a data file of a team holds, read with no engine: its rows, its columns, and what it says of its layout. */
function heldIn(dataFolder: string, team: string): unknown {
  const file = fileOf(dataFolder, team)
  return {
    orders: readFile(file, 'SELECT * FROM "orders" ORDER BY "id"').map(({ _n, ...row }) => row),
    columns: readFile(file, 'SELECT name, type, "notnull" FROM pragma_table_info(\'orders\')'),
    meta: readFile(
      file,
      `SELECT "key", "value" FROM "_t_meta" WHERE "key" IN ('table', 'tenant', 'fingerprint', 'holds', 'n', 'epoch') ORDER BY "key"`,
    ),
  }
}

test('[50-11] a write to the file of a tenant is answered once the near reader holds it in that file, and a file and a table that are made on the writer are made on the reader', async (t) => {
  const desk = await deskOf(t)
  const { app } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const north = await addTeam(app, 'North')
  await level(app, near)

  // While the link of the near reader is held, the write is committed and not answered.
  near.hold()
  let answered = false
  const write = app.call('addOrder', { team: north, title: 'a lamp' }, system).then((row) => {
    answered = true
    return idOf(row)
  })
  await moment(80)
  assert.equal(answered, false)
  assert.equal(hasFile(folder, north), false)
  near.release()
  const order = await write
  // By then the reader holds the row, in the file of that tenant, which it made.
  assert.equal(hasFile(folder, north), true)
  assert.deepEqual(await titlesOf(near, north), ['a lamp'])
  assert.equal(near.at().n, app.at().n)

  // A table that is made on the writer with its first row is made on the reader.
  await app.call('addLine', { team: north, order, qty: 3 }, system)
  assert.deepEqual(
    (await near.rows('lines', { of: north })).map((row) => [row.order, row.qty]),
    [[order, 3]],
  )
  // The directory of the reader is its own: a row for each file it holds, with the tables of the file.
  const mine = (await listed(near, folder)).files
  assert.deepEqual(
    mine.map((one) => [one.id, one.tables, one.behind]),
    [[north, ['lines', 'orders'], false]],
  )
  // A read of that tenant is answered by the reader itself, from its own file.
  assert.equal(await near.call('countOrders', { team: north }, system), 1)
})

test('[50-11] a reader that starts empty while writes go on ends with every file as the writer holds it, and one that starts empty on a writer that has just begun to keep its changes joins with one fetch', async (t) => {
  const desk = await deskOf(t)
  const { app } = desk
  const teams: string[] = []
  for (let i = 0; i < 6; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `the order of ${i}`)
  }
  // The writer begins to keep its changes when it is opened for its first reader. Its last write was to the file
  // of a tenant, so its shared file holds a lower number than the app, and it writes nothing meanwhile.
  const first = await app.reader()
  await current(app, first)
  const folder = readerFolder(desk, 2)
  assert.equal(first.at().n, app.at().n)
  assert.deepEqual(logLines(folder, 'fetched anew'), [])
  assert.deepEqual(teamFilesIn(folder), teamFilesIn(desk.dataFolder))
  for (const [i, team] of teams.entries()) assert.deepEqual(await titlesOf(first, team), [`the order of ${i}`])

  // A second reader starts empty while writes go on.
  let joined = false
  const joining = app.reader().finally(() => {
    joined = true
  })
  const written: string[][] = teams.map((_, i) => [`the order of ${i}`])
  for (let round = 0; !joined && round < 200; round++) {
    const at = round % teams.length
    await addOrder(app, teams[at], `round ${round}`)
    written[at].push(`round ${round}`)
    if (round % 9 === 0) {
      teams.push(await addTeam(app, `team ${teams.length}`))
      written.push([`made in round ${round}`])
      await addOrder(app, teams.at(-1) ?? '', `made in round ${round}`)
    }
  }
  const second = await joining
  await current(app, first, second)
  await level(app, first, second)
  assert.ok(teams.length > 6, 'files were made while the reader fetched')
  assert.deepEqual(teamFilesIn(readerFolder(desk, 3)), teamFilesIn(desk.dataFolder))
  for (const [i, team] of teams.entries()) {
    assert.deepEqual(await titlesOf(app, team), written[i])
    assert.deepEqual(await titlesOf(second, team), written[i], `team ${i} on the reader`)
  }
})

test('[50-11] a writer that is killed between a commit and its kept change makes the reader fetch that one file', async (t) => {
  const desk = await deskOf(t)
  const { app, dataFolder } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  await level(app, near)

  // The reader is down. The writer commits a write to the file of North, and is ended.
  await near.kill()
  const before = app.at().n
  const write = addOrder(app, north, 'cut off')
  await beat(app, 8)
  await write
  assert.equal(app.at().n, before + 1)
  await app.kill()
  // As a kill between the commit of the file and its kept change leaves the disk: the file holds the write and
  // is marked open, and the shared file holds no kept change of it.
  const shared = join(dataFolder, 'data.db')
  assert.equal(readFile(shared, `SELECT "n" FROM "_t_changes" WHERE "n" = ${before + 1}`).length, 1)
  writeFile(shared, 'DELETE FROM "_t_changes" WHERE "n" = ?', before + 1)
  writeFile(shared, 'UPDATE "_t_tenants" SET "open" = 1 WHERE "rowId" = ?', north)

  await app.restart()
  // The writer read the file that was marked open, and gave it a kept change that holds `fetch` and no record.
  const [kept] = readFileWhileOpen(shared, before + 1)
  assert.deepEqual([kept.fetch, kept.file, kept.record], [true, { table: 'teams', id: north }, 0])
  await near.restart({ reads: app })
  await current(app, near)
  // The reader says that it holds the change before the file has arrived: the test waits for the file.
  await until(
    'the reader holds what the writer holds',
    () => near.at().n === app.at().n && logLines(folder, 'data file of a tenant was fetched').length > 0,
  )
  // The reader fetched that one file, and nothing else.
  assert.deepEqual(
    logLines(folder, 'data file of a tenant was fetched').map((one) => one.data.id),
    [north],
  )
  assert.deepEqual(logLines(folder, 'fetched anew'), [])
  assert.deepEqual(await titlesOf(near, north), ['a lamp', 'cut off'])
  assert.deepEqual(await titlesOf(near, south), ['a desk'])
})

/** Reads one kept change of a shared file that an engine holds open: whether it holds `fetch`, its file, and the length of its record. */
function readFileWhileOpen(shared: string, n: number): { fetch: unknown; file: unknown; record: number }[] {
  return readFile(shared, `SELECT "change", length("record") AS "size" FROM "_t_changes" WHERE "n" = ${n}`).map(
    (row) => {
      const change = JSON.parse(String(row.change))
      return { fetch: change.fetch, file: change.file, record: Number(row.size) }
    },
  )
}

test('[50-11] a reader removes the file of a removed tenant and makes none anew, and one tenant put back on the writer is fetched by the reader', async (t) => {
  const desk = await deskOf(t)
  const { app, dataFolder } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  const backup: Record<string, unknown> = Object(await command(app, dataFolder, 'data', { what: 'backup' }))
  await addOrder(app, north, 'after the backup')
  await level(app, near)
  assert.deepEqual(await titlesOf(near, north), ['a lamp', 'after the backup'])

  // North is put back on the writer: the reader is told to fetch that file, and holds it as the writer does.
  await command(app, dataFolder, 'data', { what: 'restore', file: String(backup.file), of: north })
  // The reader says at once that it holds the change, and hands a read of the file on until the file has arrived.
  await until('the reader holds the file that was put back', async () => {
    await beat(app)
    return near.at().n === app.at().n && logLines(folder, 'data file of a tenant was fetched').length === 1
  })
  assert.deepEqual(await titlesOf(near, north), ['a lamp'])
  assert.deepEqual(
    logLines(folder, 'data file of a tenant was fetched').map((one) => one.data.id),
    [north],
  )
  // The writer goes on writing the file, and the reader follows from the number of the fetch.
  await addOrder(app, north, 'after it was put back')
  await level(app, near)
  assert.deepEqual(await titlesOf(near, north), ['a lamp', 'after it was put back'])

  // The tenant is removed: the reader removes its file when it applies that change.
  assert.equal(hasFile(folder, south), true)
  await app.call('removeTeam', { team: south }, system)
  await level(app, near)
  assert.equal(hasFile(folder, south), false)
  assert.deepEqual(await titlesOf(near, south), [])
  assert.deepEqual(
    (await listed(near, folder)).files.map((one) => one.id),
    [north],
  )
  // A write for it is refused on the writer, and no file is made anew on either machine.
  assert.equal(await codeOf(app.call('addOrder', { team: south, title: 'for nobody' }, system)), 'T2104')
  await level(app, near)
  assert.equal(hasFile(folder, south), false)
})

test('[50-11] a reader that took over holds every file, and goes on writing them', async (t) => {
  const desk = await deskOf(t)
  const { app } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const teams: string[] = []
  for (let i = 0; i < 5; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `the order of ${i}`)
  }
  await level(app, near)
  await app.kill()
  await beat(near, 7)
  const took = await near.takeOver()
  assert.equal(near.role, 'writer')
  assert.equal(took.epoch.split('.')[0], '2')
  // Every file is there, listed in its directory, and written under the new epoch.
  assert.deepEqual(teamFilesIn(folder), [...teams].sort())
  assert.equal((await listed(near, folder)).files.length, 5)
  for (const [i, team] of teams.entries()) {
    assert.deepEqual(await titlesOf(near, team), [`the order of ${i}`])
    await addOrder(near, team, 'by the new writer')
    assert.deepEqual(await titlesOf(near, team), [`the order of ${i}`, 'by the new writer'])
  }
  assert.equal(near.at().n, took.n + 5)
})

test('[50-11] a file that is brought up on the writer, and one that is checked and held, are the same on the reader', async (t) => {
  const first = await deskBundle(t)
  const pair = await pairOf(t, first, dataPlace(t))
  const { writer, reader } = pair
  const until2 = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    // It waits for what it reads: the count only ends a wait that would never end, and a file thread of a loaded
    // computer takes longer than sixty beats.
    for (let i = 0; i < 600; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await until2('the reader is current', () => reader.app.at().current)
  const teams = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  for (const team of teams) await addOrder(writer.app, team, 'a lamp', { code: 'L1' })
  await until2('the reader holds the files', () => reader.app.at().n === writer.app.at().n)

  // The writer opens with a version in which `code` must hold a value: every file is checked and held, and then
  // brought up. Each of those writes of a file thread reaches the reader as a change of that file.
  const next: App = await pair.reopen(await deskBundle(t, { codeRequired: true }))
  await until2('the writer brought every file up', async () =>
    (await listed(next, writer.dataFolder)).files.every((one) => !one.behind),
  )
  await until2(
    'the reader follows the new version and holds every write',
    () => reader.app.at().current && reader.app.at().n === next.at().n && reader.app.description.app.name === 'desk',
  )
  // The reader keeps such a change first and applies it on a file thread: it holds the number before the file.
  await until2('the reader brought every file up', async () =>
    (await listed(reader.app, reader.dataFolder)).files.every((one) => !one.behind),
  )
  assert.equal((await listed(reader.app, reader.dataFolder)).files.length, 2)
  await addOrder(next, teams[0], 'a desk', { code: 'D1' })
  await until2('the reader holds the new order', () => reader.app.at().n === next.at().n)
  assert.deepEqual(
    (await ordersOf(reader.app, teams[0])).map((row) => [row.title, row.code]),
    [
      ['a lamp', 'L1'],
      ['a desk', 'D1'],
    ],
  )
  // With both closed, each file on the reader is as the writer holds it: its rows, its columns, and its layout.
  await pair.close()
  for (const team of teams)
    assert.deepEqual(heldIn(reader.dataFolder, team), heldIn(writer.dataFolder, team), `the file of ${team}`)
})

const rows = 300_000

/**
 * A writer and a near reader of the desk with a small file and a large one, after the writer was opened with a
 * version that rebuilds the table of every file, and has brought every file up.
 */
async function rebuilt(t: TestContext) {
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t))
  const { writer, reader } = pair
  const until3 = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 2000; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await until3('the reader is current', () => reader.app.at().current)
  const [small, large] = [await addTeam(writer.app, 'Small'), await addTeam(writer.app, 'Large')]
  await addOrder(writer.app, small, 'a lamp')
  await addOrder(writer.app, large, 'the first')
  for (let from = 1; from <= rows; from += 100_000)
    await writer.app.call('fill', { team: large, from, to: from + 99_999 }, system)
  await until3('the reader holds the files', () => reader.app.at().n === writer.app.at().n)
  // `total` of `orders` becomes a text: the table of every file is rebuilt, 300,000 rows in one of them. The writer
  // brings the small file up first, and each file that it brought up reaches the reader as a change of that file.
  const next: App = await pair.reopen(await deskBundle(t, { totalText: true }))
  await until3('the writer brought every file up', async () =>
    (await listed(next, writer.dataFolder)).files.every((one) => !one.behind),
  )
  /** The row of one file in the directory of the reader, as it stands now. */
  const mine = async (team: string) =>
    (await listed(pair.reader.app, reader.dataFolder)).files.find((one) => one.id === team)
  /** How many calls of `countOrders` each machine has answered itself: the writer, and the reader. */
  const counted = (): number[] => [writer.dataFolder, reader.dataFolder].map((one) => callsIn(one, 'countOrders'))
  /** Holds the large file of the reader, with both machines closed, against the one of the writer. */
  const same = (): void => {
    for (const sql of [
      "SELECT name, type FROM pragma_table_info('orders') ORDER BY name",
      'SELECT count(*) AS n, typeof("total") AS t FROM "orders" GROUP BY t',
      `SELECT "key", "value" FROM "_t_meta" WHERE "key" IN ('fingerprint', 'n', 'epoch') ORDER BY "key"`,
    ])
      assert.deepEqual(
        readFile(fileOf(reader.dataFolder, large), sql),
        readFile(fileOf(writer.dataFolder, large), sql),
        sql,
      )
    assert.deepEqual(heldIn(reader.dataFolder, small), heldIn(writer.dataFolder, small))
  }
  return { pair, next, small, large, until3, mine, counted, same }
}

test('[50-11] a reader that is asked for a file that is behind hands the request on, and a large file that is brought up holds back no write of another tenant on the reader', async (t) => {
  const { pair, next, small, large, until3, mine, counted, same } = await rebuilt(t)
  const { reader } = pair
  // A write of another tenant on the writer is answered once the reader holds it, while the reader still
  // rebuilds the large file: the reader said that it holds the change of the large file when it had kept it.
  await addOrder(next, small, 'beside')
  await until3('the reader holds the write of the small file in that file', async () => {
    const one = await mine(small)
    return reader.app.at().n === next.at().n && one?.behind === false && one.writes === next.at().n
  })
  assert.equal((await mine(large))?.behind, true, 'the large file is still being brought up on the reader')
  // The reader answers a read of the small file itself.
  const before = counted()
  assert.equal(await reader.app.call('countOrders', { team: small }, system), 2)
  assert.deepEqual(counted(), [before[0], before[1] + 1])
  // Asked for the file that is behind, it hands the request to the writer, which answers it.
  assert.equal(await reader.app.call('countOrders', { team: large }, system), rows + 1)
  assert.deepEqual(counted(), [before[0] + 1, before[1] + 1])

  // Once the large file is brought up on the reader, the reader answers for it too, and holds it as the writer does.
  await until3('the reader brought the large file up', async () => (await mine(large))?.behind === false)
  assert.equal(await reader.app.call('countOrders', { team: large }, system), rows + 1)
  assert.deepEqual(counted(), [before[0] + 1, before[1] + 2])
  assert.deepEqual(logLines(reader.dataFolder, 'data file of a tenant was fetched'), [])
  await pair.close()
  same()
})

test('[50-11] a reader that is stopped while it brings a large file up applies the change from its kept record when it starts again, and fetches nothing', async (t) => {
  const { pair, next, large, until3, mine, counted, same } = await rebuilt(t)
  // The reader kept the change of the large file and said that it holds it, and its file thread still works. The
  // writer may count once more meanwhile: the reader holds that too.
  await until3('the reader holds every change of the writer', () => pair.reader.app.at().n === next.at().n)
  assert.equal((await mine(large))?.behind, true, 'the large file is still being brought up on the reader')
  await pair.restartReader()
  // It applied the change that it had kept before it answered anything: the file stands at the running layout.
  assert.equal((await mine(large))?.behind, false)
  await until3('the reader holds every change of the writer', () => pair.reader.app.at().n === next.at().n)
  await until3('the reader is current', () => pair.reader.app.at().current)
  const before = counted()
  assert.equal(await pair.reader.app.call('countOrders', { team: large }, system), rows + 1)
  assert.deepEqual(counted(), [before[0], before[1] + 1])
  for (const piece of ['data file of a tenant was fetched', 'fetched anew'])
    assert.deepEqual(logLines(pair.reader.dataFolder, piece), [], piece)
  await pair.close()
  same()
})

/**
 * A writer of the desk with a near reader, after a power cut of the writer: its shared file stands where a mark
 * stood, five writes back, and the file of a tenant kept every write. The reader holds them all, and is cut off.
 */
async function cutBack(t: TestContext) {
  const desk = await deskOf(t)
  const { app } = desk
  const near = await app.reader()
  await current(app, near)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'kept')
  const mark = await app.mark()
  for (let i = 0; i < 5; i++) await addOrder(app, north, `lost ${i}`)
  await level(app, near)
  const held = near.at().n
  near.cut()
  await app.kill()
  const titles = ['kept', 'lost 0', 'lost 1', 'lost 2', 'lost 3', 'lost 4']
  return { desk, app, near, north, mark, held, titles }
}

test('[50-11] a writer that lost the last writes of its shared file while the file of a tenant kept a later number stands back for a near reader that holds them', async (t) => {
  const { app, near, north, mark, held, titles } = await cutBack(t)
  await app.restart({ at: mark })
  // Numbers are missing between its kept changes and the number that the file of North holds: it counts as
  // holding the number below the first missing one.
  assert.equal(app.at().n, held - 5)
  near.join()
  await until(
    'the writer stands back',
    async () => {
      await beat(app)
      return (await codeOf(app.call('addOrder', { team: north, title: 'refused' }, system))) === 'T0029'
    },
    20,
  )
  assert.equal(app.at().n, held - 5)
  assert.deepEqual(
    app.machines().map((one) => [one.role, one.n]),
    [['writer', held - 5]],
  )
  // A person says that the reader goes on: it takes over with every write that was answered.
  await beat(near, 7)
  const took = await near.takeOver()
  assert.equal(took.epoch.split('.')[0], '2')
  assert.deepEqual(await titlesOf(near, north), titles)
})

test('[50-11] a writer that lost writes of its shared file and stands back for nobody goes on under a new epoch, and a reader that comes back then fetches the data anew', async (t) => {
  const { desk, app, near, north, mark, held, titles } = await cutBack(t)
  const folder = readerFolder(desk, 2)
  await near.kill()
  await app.restart({ at: mark })
  assert.deepEqual([app.at().n, app.at().epoch.split('.')[0]], [held - 5, '1'])
  // It waits for the near reader that it names, for as long as that reader may be current. Then it goes on with
  // what it holds, as after a file was put back: under a new epoch, with every write that its files kept.
  await beat(app, 8)
  await addOrder(app, north, 'after the cut')
  assert.equal(app.at().epoch.split('.')[0], '2')
  assert.ok(app.at().n > held, `${app.at().n} is above ${held}`)
  assert.deepEqual(await titlesOf(app, north), [...titles, 'after the cut'])
  // No place of a reader fits any more: the reader that comes back fetches the data anew, and holds every file.
  near.join()
  await near.restart({ reads: app })
  await until('the reader fetched the data anew and is current', async () => {
    await beat(app)
    return near.at().current && near.at().n === app.at().n
  })
  assert.equal(logLines(folder, 'The data of the writer was fetched anew').length, 1)
  assert.deepEqual(await titlesOf(near, north), [...titles, 'after the cut'])
  await addOrder(app, north, 'and on')
  await level(app, near)
  assert.deepEqual(await titlesOf(near, north), [...titles, 'after the cut', 'and on'])
  // The reader may hold what its writer lacks: what it held is kept beside its data, the shared file under the
  // number that the machine held, and its folder of files beside it, with every write that it held in them.
  const kept = readdirSync(folder).filter((name) => name.startsWith('lost.'))
  assert.deepEqual(kept.sort(), [`lost.1.${held}.db`, `lost.1.${held}.tenants`])
  const lostFile = join(folder, `lost.1.${held}.tenants`, 'teams', north.slice(-2), `${north}.db`)
  assert.deepEqual(
    readFile(lostFile, 'SELECT "title" FROM "orders" ORDER BY "id"').map((row) => row.title),
    titles,
  )
  assert.deepEqual(
    logLines(folder, 'was kept beside the data').map((one) => [one.data.file, one.data.files]),
    [[`lost.1.${held}.db`, `lost.1.${held}.tenants`]],
  )
})

test('[50-11] a writer that goes on after it lost writes makes the mark of the sweep anew, so that every file is swept when it is next opened', async (t) => {
  const desk = await deskOf(t)
  const { app, dataFolder } = desk
  const near = await app.reader()
  await current(app, near)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  await addOrder(app, north, 'kept')
  await addOrder(app, south, 'of South')
  const mark = await app.mark()
  for (let i = 0; i < 5; i++) await addOrder(app, north, `lost ${i}`)
  await level(app, near)
  await near.kill()
  await app.kill()
  /** The count of removals as the shared file tells it, read beside the engine. */
  const removals = (): string[] =>
    readFile(join(dataFolder, 'data.db'), `SELECT "value" FROM "_t_meta" WHERE "key" = 'removals'`).map((row) =>
      String(row.value),
    )
  /** The count that the file of a team says it was last swept at, read beside the engine. */
  const sweptAt = (team: string): string =>
    readFile(fileOf(dataFolder, team), `SELECT "value" FROM "_t_meta" WHERE "key" = 'swept'`)
      .map((row) => String(row.value))
      .join()
  await app.restart({ at: mark })
  const before = removals()
  const southBefore = sweptAt(south)
  // The writer waits for its near reader as long as that reader may be current, and then goes on with what it holds.
  await beat(app, 8)
  await addOrder(app, north, 'after the cut')
  assert.equal(app.at().epoch.split('.')[0], '2')
  assert.equal(removals().length, 1)
  assert.notDeepEqual(removals(), before)
  const made = String(Object(JSON.parse(removals()[0])).mark)
  assert.match(made, /^[0-9a-z]{26}$/)
  assert.equal(southBefore.includes(made), false)
  // The file of North was opened by that write, and swept there. The file of South is swept when it is next opened.
  assert.equal(sweptAt(north).includes(made), true, 'the file that was written stands at the new mark')
  assert.deepEqual(await titlesOf(app, south), ['of South'])
  assert.equal(sweptAt(south).includes(made), true, 'the file that was opened stands at the new mark')
})

test('[50-11] the pass that brings files up beside a writer that lost writes is no write of the app: the writer still stands back for the near reader that holds them', async (t) => {
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t))
  const { writer, reader } = pair
  /** Has beats pass until something holds, and fails with its name where it never does. */
  const beats = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await beats('the reader is current', () => reader.app.at().current)
  const north = await addTeam(writer.app, 'North')
  await addOrder(writer.app, north, 'kept')
  const mark = join(writer.dataFolder, '..', 'mark')
  await writer.app.snapshot(mark)
  for (let i = 0; i < 5; i++) await addOrder(writer.app, north, `lost ${i}`)
  await until('the reader holds every write', () => reader.app.at().n === writer.app.at().n)
  const held = reader.app.at().n
  // The power is cut: the shared file of the writer stands five writes back, and the file of North kept every
  // write. The writer opens with a version that rebuilds `orders`, so its pass brings the file of North up.
  const next: App = await pair.reopen(await deskBundle(t, { totalText: true }), () => {
    for (const beside of ['-wal', '-shm']) rmSync(join(writer.dataFolder, `data.db${beside}`), { force: true })
    cpSync(join(mark, 'data.db'), join(writer.dataFolder, 'data.db'))
  })
  await until('the pass brought the file of North up', async () =>
    (await listed(next, writer.dataFolder)).files.every((one) => !one.behind),
  )
  assert.equal(
    readFile(fileOf(writer.dataFolder, north), "SELECT type FROM pragma_table_info('orders') WHERE name = 'total'")[0]
      .type,
    'TEXT',
  )
  // The writes of the pass moved nothing of what the writer counts as holding, and it stands back for the reader.
  assert.ok(next.at().n < held, `${next.at().n} is below ${held}`)
  await beats(
    'the reader was told that it holds more than its writer',
    () => logLines(reader.dataFolder, 'holds more writes than its writer').length > 0,
  )
  assert.equal(await codeOf(next.call('addOrder', { team: north, title: 'refused' }, system)), 'T0029')
  assert.equal(next.at().epoch.split('.')[0], '1')
  assert.deepEqual(
    readdirSync(reader.dataFolder).filter((name) => name.startsWith('lost.')),
    [],
  )
  // A person says that the reader goes on: it takes over with every write that was answered.
  await pair.beat(7)
  const took = await reader.app.takeOver()
  assert.equal(took.epoch.split('.')[0], '2')
  assert.deepEqual(await titlesOf(reader.app, north), ['kept', 'lost 0', 'lost 1', 'lost 2', 'lost 3', 'lost 4'])
})

test('[50-11] a reader keeps a change that holds fetch first, and says so at once: while the file is fetched a write of another tenant is answered, the reader answers a read of that tenant itself and hands a read of the file on, and a reader that was stopped meanwhile fetches the file when it starts', async (t) => {
  // The test holds back each request by which the reader fetches the file of one tenant, and may have it fail.
  const fetches: string[] = []
  let held: Promise<void> | undefined
  let release = (): void => undefined
  let failing = false
  const hold = (): void => {
    held = new Promise<void>((done) => {
      release = done
    })
  }
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t), async (request) => {
    const { pathname, searchParams } = new URL(request.url)
    if (pathname !== '/_t/copy/data' || !searchParams.has('id')) return
    fetches.push(String(searchParams.get('id')))
    await held
    if (failing) throw new Error('the connection of the fetch broke')
  })
  const { writer, reader } = pair
  const beats = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 80; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  const fetchedBy = (): number => logLines(reader.dataFolder, 'data file of a tenant was fetched').length
  const level = (): Promise<void> =>
    until('the reader holds what the writer holds', () => pair.reader.app.at().n === writer.app.at().n)
  await beats('the reader is current', () => reader.app.at().current)
  const [north, south] = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  await addOrder(writer.app, north, 'a lamp')
  await addOrder(writer.app, south, 'a desk')
  const backup: Record<string, unknown> = Object(
    await command(writer.app, writer.dataFolder, 'data', { what: 'backup' }),
  )
  await addOrder(writer.app, north, 'after the backup')
  await level()

  // North is put back on the writer, and its file does not arrive on the reader for now.
  hold()
  const putBack = { what: 'restore', file: String(backup.file), of: north }
  await command(writer.app, writer.dataFolder, 'data', putBack)
  await until('the reader asked for the file', () => fetches.length === 1)
  // The reader said that it holds the change: a write of another tenant is settled, and answered.
  let answered = false
  const write = addOrder(writer.app, south, 'while North is fetched').then(() => {
    answered = true
  })
  await until('a write of another tenant was answered while the file was fetched', () => answered)
  await write
  // It was answered because the reader holds it, and not because the writer stopped waiting for the reader.
  await level()
  assert.equal(reader.app.at().current, true, 'the reader stays current while the file is fetched')
  assert.equal(fetchedBy(), 0)
  /** Whether the directory of the reader marks the file of North as open, read beside the engine. */
  const marked = (): unknown =>
    readFile(join(reader.dataFolder, 'data.db'), `SELECT "open" FROM "_t_tenants" WHERE "rowId" = '${north}'`)[0]?.open
  assert.equal(marked(), 1, 'the row of the file is marked until the file is held')
  // The reader answers a read of South itself, and hands a read of the file that it does not hold yet on.
  const counted = (): number[] => [writer.dataFolder, reader.dataFolder].map((one) => callsIn(one, 'countOrders'))
  const before = counted()
  assert.equal(await reader.app.call('countOrders', { team: south }, system), 2)
  assert.deepEqual(counted(), [before[0], before[1] + 1])
  assert.equal(await reader.app.call('countOrders', { team: north }, system), 1)
  assert.deepEqual(counted(), [before[0] + 1, before[1] + 1])
  // The file arrives: the reader holds it as the writer does, and its row is marked no more.
  release()
  await until('the reader holds the file that was put back', () => fetchedBy() === 1)
  assert.deepEqual(await titlesOf(reader.app, north), ['a lamp'])
  await until('the row of the file is marked no more', () => marked() === 0)

  // The file is put back once more, and the reader is stopped while it fetches: the fetch ends with the reader.
  await addOrder(writer.app, north, 'written again')
  await level()
  hold()
  await command(writer.app, writer.dataFolder, 'data', putBack)
  await until('the reader asked for the file again', () => fetches.length === 2)
  const stopped = reader.app
  const restarting = pair.restartReader()
  await until('the reader is closed', () => {
    try {
      stopped.at()
      return false
    } catch {
      return true
    }
  })
  failing = true
  release()
  await restarting
  failing = false
  held = undefined
  // It kept the change, and its row of the file is marked: when it starts it fetches the file, and holds it.
  await beats('the reader that started again fetched the file', () => fetchedBy() === 2)
  await beats('the reader is current again', () => pair.reader.app.at().current)
  assert.equal(pair.reader.app.at().n, writer.app.at().n)
  assert.deepEqual(await titlesOf(pair.reader.app, north), ['a lamp'])
  assert.equal(await pair.reader.app.call('countOrders', { team: north }, system), 1)
  assert.deepEqual(fetches, [north, north, north])
})

test('[50-11] a reader that fetches the data anew and keeps nothing of what it held removes its files of tenants, and holds those of the data it fetched', async (t) => {
  const desk = await deskOf(t)
  const { app, dataFolder } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const north = await addTeam(app, 'North')
  await addOrder(app, north, 'a lamp')
  const mark = await app.mark()
  const south = await addTeam(app, 'South')
  await addOrder(app, south, 'a desk')
  await addOrder(app, north, 'after the mark')
  await level(app, near)
  assert.deepEqual(teamFilesIn(folder), [north, south].sort())
  // The data is put back on the writer: what a reader holds was given up on purpose, and each fetches the data anew.
  await app.back(mark)
  await until('the reader fetched the data anew', async () => {
    await beat(app)
    return logLines(folder, 'The data of the writer was fetched anew').length === 1 && near.at().current
  })
  assert.deepEqual(teamFilesIn(folder), teamFilesIn(dataFolder))
  assert.deepEqual(teamFilesIn(folder), [north])
  assert.deepEqual(
    readdirSync(folder).filter((name) => name.startsWith('lost.')),
    [],
  )
  assert.deepEqual(await titlesOf(near, north), ['a lamp'])
  assert.deepEqual(await titlesOf(near, south), [])
  assert.deepEqual(
    (await listed(near, folder)).files.map((one) => one.id),
    [north],
  )
})

test('[50-11] a reader whose running version is the first with a tenant table keeps the files of tenants from then on', async (t) => {
  // The version before keeps no file: the reader was opened with no files of tenants, and holds no directory.
  const pair = await pairOf(t, await deskBundle(t, { noFiles: true }), dataPlace(t))
  const { writer, reader } = pair
  const until4 = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 200; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await until4('the reader is current', () => reader.app.at().current)
  const north = await addTeam(writer.app, 'North')
  await until4('the reader holds the team', () => reader.app.at().n === writer.app.at().n)
  assert.deepEqual((await listed(reader.app, reader.dataFolder)).files, [])

  // The writer opens with the first version in which `orders` is a tenant table, with the team as the tenant, and writes the file of a team.
  const next: App = await pair.reopen(await deskBundle(t))
  const order = await addOrder(next, north, 'a lamp')
  await next.call('addLine', { team: north, order, qty: 2 }, system)
  await until4(
    'the reader follows the new version and holds every write',
    () => reader.app.at().current && reader.app.at().n === next.at().n,
  )
  assert.equal(Object.hasOwn(reader.app.description.tables, 'orders'), true)
  // The reader made the file of that team, lists it in a directory of its own, and answers a read of it itself.
  assert.equal(hasFile(reader.dataFolder, north), true)
  assert.deepEqual(
    (await listed(reader.app, reader.dataFolder)).files.map((one) => [one.id, one.tables, one.behind]),
    [[north, ['lines', 'orders'], false]],
  )
  const before = callsIn(reader.dataFolder, 'countOrders')
  assert.equal(await reader.app.call('countOrders', { team: north }, system), 1)
  assert.equal(callsIn(reader.dataFolder, 'countOrders'), before + 1)
  const heavy: Record<string, unknown>[] = Object(await reader.app.call('heavyOrders', { team: north }, system))
  assert.deepEqual(
    heavy.map((row) => row.title),
    ['a lamp'],
  )
  await addOrder(next, north, 'a desk')
  await until4('the reader holds the next order', () => reader.app.at().n === next.at().n)
  await pair.close()
  assert.deepEqual(heldIn(reader.dataFolder, north), heldIn(writer.dataFolder, north))
  assert.deepEqual(
    readFile(join(reader.dataFolder, 'data.db'), 'SELECT "tableName", "rowId", "open" FROM "_t_tenants"').map((row) => [
      row.tableName,
      row.rowId,
      row.open,
    ]),
    [['teams', north, 0]],
  )
})
