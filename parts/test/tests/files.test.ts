import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import {
  addOrder,
  addTeam,
  appIn,
  besideOf,
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
  openOn,
  ordersOf,
  readerFolder,
  readFile,
  titlesOf,
  writeFile,
} from './desks.ts'
import { codeOf, current, level, moment, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The names of the columns of one table of a data file that no engine holds open, in their order. */
const columnsOf = (file: string, table: string): string[] =>
  readFile(file, `SELECT name FROM pragma_table_info('${table}')`).map((row) => String(row.name))

test('[50-6] a file is opened by the first plan or write that names its tenant, is listed with its layout and its size, and is closed once more than openFiles are open and after fileCloseAfter', async (t) => {
  const { app, dataFolder } = await deskOf(t, { openFiles: 2 })
  const [north, south, east, west, none] = [
    await addTeam(app, 'North'),
    await addTeam(app, 'South'),
    await addTeam(app, 'East'),
    await addTeam(app, 'West'),
    await addTeam(app, 'Nobody'),
  ]
  // A tenant that wrote nothing has no file, and a read makes none: the directory lists nothing of it.
  assert.deepEqual(await titlesOf(app, none), [])
  assert.deepEqual((await listed(app, dataFolder)).files, [])
  assert.deepEqual(teamFilesIn(dataFolder), [])

  const first = await addOrder(app, north, 'a lamp')
  await addOrder(app, south, 'a desk')
  const two = (await listed(app, dataFolder)).files
  assert.deepEqual(two.map((one) => one.id).sort(), [north, south].sort())
  for (const one of two) {
    assert.equal(one.table, 'teams')
    assert.equal(one.open, true)
    assert.deepEqual([one.behind, one.unswept, one.failed], [false, false, undefined])
    assert.deepEqual(one.tables, ['orders'])
    assert.match(one.layout, /^[0-9a-f]{16,}$/)
    assert.ok(one.size >= 20 * 1024, `a file holds ${one.size} bytes`)
    assert.ok(one.writes > 0)
  }
  assert.equal(new Set(two.map((one) => one.layout)).size, 1, 'every file stands at the running layout')
  // A table is made in a file with its first row, and the directory says which tables a file holds.
  await app.call('addLine', { team: north, order: first, qty: 2 }, system)
  const withLines = (await listed(app, dataFolder)).files.find((one) => one.id === north)
  assert.deepEqual(withLines?.tables, ['lines', 'orders'])

  // No more than two files are open: the one that was used longest ago is closed first, and leaves nothing beside it.
  await addOrder(app, east, 'a chair')
  await addOrder(app, west, 'a shelf')
  const four = (await listed(app, dataFolder)).files
  assert.deepEqual(
    four
      .filter((one) => one.open)
      .map((one) => one.id)
      .sort(),
    [east, west].sort(),
  )
  assert.deepEqual([besideOf(dataFolder, north), besideOf(dataFolder, south)], [[], []])
  // A read opens a closed file again, and closes another for it.
  assert.deepEqual(await titlesOf(app, north), ['a lamp'])
  const afterRead = (await listed(app, dataFolder)).files.filter((one) => one.open).map((one) => one.id)
  assert.deepEqual(afterRead.sort(), [north, west].sort())

  // A quiet file is closed after `fileCloseAfter`, and every write is there afterwards.
  app.clock.advance('2 minutes')
  await moment()
  const quiet = (await listed(app, dataFolder)).files
  assert.deepEqual(
    quiet.map((one) => one.open),
    [false, false, false, false],
  )
  for (const team of [north, south, east, west]) assert.deepEqual(besideOf(dataFolder, team), [])
  assert.deepEqual(await Promise.all([north, south, east, west].map((team) => titlesOf(app, team))), [
    ['a lamp'],
    ['a desk'],
    ['a chair'],
    ['a shelf'],
  ])
})

test('[16-4@4] _t_tenants holds exactly its columns in the shared file of an app that keeps files of tenants, and an app that keeps none holds no such table and no folder of files', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  await addOrder(app, await addTeam(app, 'North'), 'a lamp')
  // The file is closed in order once nothing asked for it for its time: its row says what it holds then.
  app.clock.advance('2 minutes')
  await moment()
  assert.deepEqual(columnsOf(join(dataFolder, 'data.db'), '_t_tenants'), [
    ...['tableName', 'rowId', 'layout', 'tables', 'writes', 'lastId', 'size', 'swept', 'closedAt', 'dueAt'],
    ...['versions', 'waits', 'runs', 'open', 'failed', 'fillAt', 'fillsOf', 'fills'],
  ])
  const [row] = readFile(join(dataFolder, 'data.db'), 'SELECT * FROM "_t_tenants"')
  assert.equal(row.tableName, 'teams')
  assert.deepEqual([row.open, row.runs, row.failed], [0, 0, null])
  assert.deepEqual(JSON.parse(String(row.tables)), ['orders'])
  assert.ok(Number(row.closedAt) > 0 && Number(row.size) > 0 && Number(row.writes) > 0)
  assert.match(String(row.lastId), /^[0-9a-hjkmnp-tv-z]{26}$/)

  // An app with no tenant table is as it was: no directory, and no folder for files.
  const plain = await appIn(t, copyOf(t, 'shop'))
  assert.equal((await plain.app.rows('orders')).length, 3)
  await plain.app.kill()
  assert.equal(existsSync(join(plain.dataFolder, 'tenants')), false)
  assert.deepEqual(
    readFile(join(plain.dataFolder, 'data.db'), "SELECT name FROM sqlite_master WHERE name = '_t_tenants'"),
    [],
  )
})

test('[50-6] a query in code that names a file which is behind is carried out again once the file is brought up, and answers once; a change is undone and carried out again; a heavy read answers by the new layout; and an app that opens with a new bundle brings every file up', async (t) => {
  const first = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 24; i++) {
    const team = await addTeam(first.app, `team ${i}`)
    teams.push(team)
    await addOrder(first.app, team, `first of ${i}`)
    await addOrder(first.app, team, `second of ${i}`)
  }
  const before = (await listed(first.app, first.dataFolder)).files
  await first.app.kill()

  // The next version names `title` of `orders` anew: every file is behind, and the pass begins when the app opens.
  // The time of a call runs over its wait for a file, and is not what this test holds: it has room for a slow computer.
  const roomy = { renamed: true, queryTime: '1 minute', changeTime: '1 minute' }
  const { app, dataFolder } = await openOn(t, await deskBundle(t, roomy), first.dataFolder)
  const [counted, added, heavy] = [teams[3], teams[9], teams[15]]
  const asked = await Promise.all([
    app.call('countOrders', { team: counted }, system),
    app.call('addCounted', { team: added }, system),
    app.call('heavyOrders', { team: heavy }, system),
  ])
  // The query caught the error of its read, and is answered by its second pass all the same.
  assert.equal(asked[0], 2)
  // The change read two orders and added a third, once.
  assert.equal(asked[1], 3)
  assert.deepEqual(await titlesOf(app, added), [`first of 9`, `second of 9`, 'order 3'])
  // The heavy read was handed its file brought up: it answers the rows by the new layout.
  const rows: Record<string, unknown>[] = Object(asked[2])
  assert.deepEqual(
    rows.map((row) => [row.name, row.title]),
    [
      ['first of 15', undefined],
      ['second of 15', undefined],
    ],
  )
  // The log names each file that a call waited for, and the time. The heavy read is not among them for sure: its
  // thread may start after the pass has reached its file.
  const waited = logLines(dataFolder, 'waited for a data file')
  for (const team of [counted, added]) {
    const line = waited.find((one) => one.data.id === team)
    assert.ok(line, `the log names the file of ${team}`)
    assert.equal(line.data.table, 'teams')
    assert.equal(typeof line.data.ms, 'number')
  }

  // The pass reaches every file, also one that nobody opens.
  await until(
    'every file is brought up',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    2000,
  )
  const after = (await listed(app, dataFolder)).files
  assert.equal(after.length, 24)
  assert.equal(new Set(after.map((one) => one.layout)).size, 1)
  assert.notEqual(after[0].layout, before[0].layout)
  assert.deepEqual((await listed(app, dataFolder, { behind: true })).files, [])
  for (const one of after) assert.ok(one.writes > (before.find((was) => was.id === one.id)?.writes ?? 0), one.id)
  assert.deepEqual(
    (await ordersOf(app, teams[20])).map((row) => row.name),
    ['first of 20', 'second of 20'],
  )
})

test('[50-6] [16-2@4] the time of a call is one, from its start over every pass and over the wait for its file between them: a change that is in time in each pass and not in both is T0008, and writes nothing', async (t) => {
  const first = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 24; i++) {
    teams.push(await addTeam(first.app, `team ${i}`))
    await addOrder(first.app, teams[i], `first of ${i}`)
  }
  await first.app.kill()
  // A change has 600 ms. Every file is behind when the app opens, and the pass reaches the last team last.
  const next = await deskBundle(t, { renamed: true, changeTime: '600 ms' })
  const { app, dataFolder } = await openOn(t, next, first.dataFolder)
  const last = teams[23]
  // The change works 350 ms in each pass: its first pass finds the file behind, and its second ends past its time.
  assert.equal(await codeOf(app.call('addSlowly', { team: last, ms: 350 }, system)), 'T0008')
  const waited = logLines(dataFolder, 'waited for a data file').map((one) => one.data.id)
  assert.deepEqual(waited, [last], 'the call waited for its file, and was carried out again')
  await until(
    'every file is brought up',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    2000,
  )
  // Nothing of it was written, and with its file ready the same change is in time.
  assert.deepEqual(await titlesOf(app, last), ['first of 23'])
  assert.equal(await app.call('addSlowly', { team: last, ms: 350 }, system), 2)
  assert.deepEqual(await titlesOf(app, last), ['first of 23', 'order 2'])
})

test('[50-6] an app that opens ends a pass that was under way first: after a kill in the pass of a change that names a column anew, a bundle that states that `was` no more opens, and every file holds its values under the new name', async (t) => {
  const bundle = await deskBundle(t)
  const renamed = await deskBundle(t, { renamed: true, filesAtOnce: 1 })
  const statedNoMore = await deskBundle(t, { renamedBefore: true })
  const dataFolder = dataPlace(t)
  const program = join(import.meta.dirname, 'killed', 'desk.ts')
  const args = [bundle, dataFolder, 'pass', renamed, statedNoMore]
  const killed = await runKilled(program, { times: 1, when: 'written', seed: 50, args })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const told = JSON.parse(/^told: (.*)$/m.exec(again.out)?.[1] ?? '{}')
  // The kill came inside the pass: some files held the column under its new name, and the others under the old one.
  assert.ok(told.before.name > 0 && told.before.title > 0, JSON.stringify(told.before))
  assert.equal(told.before.name + told.before.title, 30)
  // The opening was not refused, and each file holds its two orders under the new name.
  assert.deepEqual(told.after, { name: 30, title: 0 })
  assert.equal(told.behind, 0)
  for (const [i, team] of told.teams.entries())
    assert.deepEqual(told.names[team], [`first of ${i}`, `second of ${i}`], `team ${i}`)
})

test('[50-6] [16-2@4] an app that opens with a new bundle is refused by one misfit in one file, with T2001 that names the tenant and the count, and nothing is changed', async (t) => {
  const first = await deskOf(t)
  const [north, south, east] = [
    await addTeam(first.app, 'North'),
    await addTeam(first.app, 'South'),
    await addTeam(first.app, 'East'),
  ]
  await addOrder(first.app, north, 'a lamp', { code: 'L1' })
  await addOrder(first.app, south, 'a desk', { code: 'D1' })
  await addOrder(first.app, south, 'a chair')
  await addOrder(first.app, east, 'a shelf', { code: 'S1' })
  const before = (await listed(first.app, first.dataFolder)).files
  await first.app.kill()

  // `code` must hold a value from now on, and one order of South holds none.
  const required = await deskBundle(t, { codeRequired: true })
  const refused = await openOn(t, required, first.dataFolder).then(
    () => undefined,
    (error: unknown) => Object(error),
  )
  assert.equal(refused?.code, 'T2001')
  assert.match(String(refused?.message), new RegExp(`1 row of \`orders\`.*\`orders\\.code\`.*teams ${south}`))
  // Nothing was changed: the version before opens, finds every file where it stood, and writes a row without the column.
  await first.app.restart()
  const after = (await listed(first.app, first.dataFolder)).files
  assert.deepEqual(
    after.map((one) => [one.id, one.layout, one.behind]),
    before.map((one) => [one.id, one.layout, false]),
  )
  await addOrder(first.app, north, 'a rug')
  assert.deepEqual(await titlesOf(first.app, north), ['a lamp', 'a rug'])
})

test('[50-6] an app that opens with a new bundle that every file fits brings every file up, and a write is then held to the new layout', async (t) => {
  const first = await deskOf(t)
  const teams = [await addTeam(first.app, 'North'), await addTeam(first.app, 'South')]
  for (const team of teams) await addOrder(first.app, team, 'a lamp', { code: 'L1' })
  await first.app.kill()
  const { app, dataFolder } = await openOn(t, await deskBundle(t, { codeRequired: true }), first.dataFolder)
  await until(
    'every file is brought up',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    2000,
  )
  assert.equal(typeof (await codeOf(app.call('addOrder', { team: teams[0], title: 'no code' }, system))), 'string')
  await addOrder(app, teams[0], 'a desk', { code: 'D1' })
  assert.deepEqual(await titlesOf(app, teams[0]), ['a lamp', 'a desk'])
})

test('[50-6] the upkeep removes a file whose tenant is gone, gives a row to a file that has none, and removes what lies under tenants/.tmp', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south, east] = [await addTeam(app, 'North'), await addTeam(app, 'South'), await addTeam(app, 'East')]
  for (const team of [north, south, east]) await addOrder(app, team, `an order of ${team}`)
  await app.call('addLine', { team: south, order: idOf((await ordersOf(app, south))[0]), qty: 1 }, system)
  const before = (await listed(app, dataFolder)).files.find((one) => one.id === south)
  await app.kill()

  // With no engine running: the row of North is gone, the directory lost its row of South, and a half copy was left.
  const shared = join(dataFolder, 'data.db')
  writeFile(shared, 'DELETE FROM "teams" WHERE "id" = ?', north)
  writeFile(shared, 'DELETE FROM "_t_tenants" WHERE "rowId" = ?', south)
  mkdirSync(join(dataFolder, 'tenants', '.tmp'), { recursive: true })
  writeFileSync(join(dataFolder, 'tenants', '.tmp', `${east}.db`), 'half a copy')

  // The upkeep runs when the engine starts.
  await app.restart()
  assert.equal(hasFile(dataFolder, north), false)
  assert.equal(existsSync(join(dataFolder, 'tenants', '.tmp', `${east}.db`)), false)
  const after = (await listed(app, dataFolder)).files
  assert.deepEqual(after.map((one) => one.id).sort(), [south, east].sort())
  const south2 = after.find((one) => one.id === south)
  // The row of South was made anew from what the file says of itself.
  assert.deepEqual(
    [south2?.table, south2?.tables, south2?.layout, south2?.writes, south2?.behind],
    ['teams', ['lines', 'orders'], before?.layout, before?.writes, false],
  )
  assert.deepEqual(await titlesOf(app, south), [`an order of ${south}`])

  // `--stray` runs it at once, and says what it found and did.
  mkdirSync(join(dataFolder, 'tenants', '.tmp'), { recursive: true })
  writeFileSync(join(dataFolder, 'tenants', '.tmp', 'left.db'), 'half a copy')
  const { stray } = await listed(app, dataFolder, { stray: true })
  assert.deepEqual(stray, { removed: [], listed: [], folded: [], refused: [], temporary: 1 })
  assert.equal(existsSync(join(dataFolder, 'tenants', '.tmp', 'left.db')), false)
})

test('[50-6] after a kill the engine reads the files that were marked open and no others, a write that was committed before the kill is there after it, what the kill left beside a file is folded into it, and what lies under tenants/.tmp is removed', async (t) => {
  const bundle = await deskBundle(t, { openFiles: 2 })
  const dataFolder = dataPlace(t)
  const program = join(import.meta.dirname, 'killed', 'desk.ts')
  const killed = await runKilled(program, { times: 1, when: 'written', seed: 50, args: [bundle, dataFolder, 'open'] })
  assert.equal(killed.kills, 1)
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const told = JSON.parse(/^told: (.*)$/m.exec(again.out)?.[1] ?? '{}')
  const [one, two, three, four]: string[] = told.teams
  // The two files that were written last stood open when the program was killed, and SQLite kept its files beside them.
  assert.deepEqual(told.besideBefore, { [one]: [], [two]: [], [three]: ['-wal', '-shm'], [four]: ['-wal', '-shm'] })
  // The engine that started after the kill read those two, and no other.
  assert.deepEqual(told.open.sort(), [three, four].sort())
  assert.deepEqual(told.read.sort(), [three, four].sort())
  // Every write that was answered before the kill is there.
  assert.deepEqual(told.titles, {
    [one]: ['first of 1'],
    [two]: ['first of 2'],
    [three]: ['first of 3', 'second of 3'],
    [four]: ['first of 4', 'second of 4'],
  })
  assert.equal(told.temporary, false)
  // Once the engine has closed, no file has anything beside it.
  for (const team of told.teams) assert.deepEqual(besideOf(dataFolder, team), [], team)
  assert.equal(existsSync(fileOf(dataFolder, one)), true)
})

test('[50-6] an id made after a start with the clock set back is above an id in a closed file', async (t) => {
  const bundle = await deskBundle(t)
  const dataFolder = dataPlace(t)
  const program = join(import.meta.dirname, 'killed', 'desk.ts')
  const killed = await runKilled(program, { times: 1, when: 'written', seed: 50, args: [bundle, dataFolder, 'ids'] })
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  const told = JSON.parse(/^told: (.*)$/m.exec(again.out)?.[1] ?? '{}')
  // The newest id of the first start stands in a file that was closed, and that the second start did not open.
  assert.deepEqual(told.open, [])
  assert.ok(told.late > told.newest, `${told.late} was made after ${told.newest}`)
})

test('[50-6] an app that opens says in its log where three file handles for each of openFiles are more than the system gives the program', async (t) => {
  // The test reads the bound of this program as the system states it, and sets `openFiles` by it: Linux says it
  // in a file of the program, the other systems by their shell, and Windows states none for the files of a store.
  let stated = ''
  if (process.platform === 'linux')
    stated = /^Max open files\s+(\S+)/m.exec(readFileSync('/proc/self/limits', 'utf8'))?.[1] ?? ''
  else if (process.platform !== 'win32') stated = execFileSync('/bin/sh', ['-c', 'ulimit -n'], { encoding: 'utf8' })
  const bound = /^\d+$/.test(stated.trim()) ? Number(stated.trim()) : undefined
  const openFiles = bound ?? 1_000_000_000
  const { dataFolder } = await openOn(t, await deskBundle(t, { openFiles }), dataPlace(t))
  const said = logLines(dataFolder, 'more than the system gives this program')
  // A system that states no bound holds the app to none. With one, as many open files as the bound are three times too many.
  if (bound === undefined) assert.deepEqual(said, [])
  else {
    assert.equal(said.length, 1)
    assert.deepEqual([said[0].data.openFiles, said[0].data.handles], [bound, bound])
  }
  // An app that asks for no more than the system gives says nothing.
  const fits = await openOn(t, await deskBundle(t, { openFiles: 2 }), dataPlace(t))
  assert.deepEqual(logLines(fits.dataFolder, 'more than the system gives this program'), [])
})

test('[50-6] an action that names a file which is behind waits for it within its promise, and answers by the file as it was brought up', async (t) => {
  const first = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 12; i++) {
    teams.push(await addTeam(first.app, `team ${i}`))
    await addOrder(first.app, teams[i], `first of ${i}`)
  }
  await first.app.kill()
  const next = await deskBundle(t, { renamed: true, filesAtOnce: 1 })
  const { app, dataFolder } = await openOn(t, next, first.dataFolder)
  const last = teams[11]
  assert.equal(await app.call('countLater', { team: last }, system), 1)
  // The action was carried out once: its promise waited for the file, and the log names the file and the time.
  const waited = logLines(dataFolder, 'waited for a data file').filter((one) => one.data.id === last)
  assert.equal(waited.length, 1)
  assert.equal(typeof waited[0].data.ms, 'number')
  assert.equal(callsIn(dataFolder, 'countLater'), 1)
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === last)?.behind, false)
})

test('[50-6] an action whose rule reads a file that is behind waits for the file, as its body does: the rule is asked again once the file is brought up, and the action is carried out once', async (t) => {
  const first = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 12; i++) {
    teams.push(await addTeam(first.app, `team ${i}`))
    await addOrder(first.app, teams[i], `first of ${i}`)
  }
  // Ada is a member of the last team, and of no other: the rule of `orders` lets her read its file alone.
  const last = teams[11]
  const ada = await first.app.user({ name: 'Ada', roles: [] })
  await first.app.write([{ add: 'members', values: { team: last, user: ada.user?.id } }], { as: 'system' })
  await first.app.kill()
  const next = await deskBundle(t, { renamed: true, filesAtOnce: 1, queryTime: '1 minute' })
  const { app, dataFolder } = await openOn(t, next, first.dataFolder)
  // The pass brings one file at a time up, and the file of the last team last: the rule finds it behind.
  assert.equal(await app.call('countRuled', { team: last }, { as: ada }), 1)
  assert.equal(callsIn(dataFolder, 'countRuled'), 1)
  assert.equal((await listed(app, dataFolder)).files.find((one) => one.id === last)?.behind, false)
  // The rule still holds once the file is ready: a team that Ada is no member of is refused, and no file is opened.
  assert.equal(await codeOf(app.call('countRuled', { team: teams[0] }, { as: ada })), 'T3101')
})

test('[50-6] [16-2@4] a file that cannot be brought up is marked failed with its error and answers T0009, the pass ends without it, and --retry brings it up once the cause is gone', async (t) => {
  const first = await deskOf(t)
  const teams: string[] = []
  for (let i = 0; i < 12; i++) {
    teams.push(await addTeam(first.app, `team ${i}`))
    await addOrder(first.app, teams[i], `first of ${i}`, { code: `C${i}` })
  }
  await first.app.kill()
  // `code` must hold a value from now on. The opening checks every file, and each fits.
  const next = await deskBundle(t, { codeRequired: true, filesAtOnce: 1 })
  const { app, dataFolder } = await openOn(t, next, first.dataFolder)
  // Before the pass reaches the last file, a hand takes the code of its order away, round every rule.
  const last = teams[11]
  writeFile(fileOf(dataFolder, last), 'UPDATE "orders" SET "code" = NULL')
  await until(
    'the pass has ended without the file',
    async () => {
      const behind = (await listed(app, dataFolder, { behind: true })).files
      return behind.length === 1 && behind[0].failed !== undefined
    },
    2000,
  )
  const [failed] = (await listed(app, dataFolder, { behind: true })).files
  assert.deepEqual([failed.id, failed.failed?.code, failed.open], [last, 'T2001', false])
  assert.match(String(failed.failed?.message), new RegExp(`1 row of \`orders\`.*teams ${last}`))
  assert.equal(logLines(dataFolder, 'could not be brought up').length, 1)
  // Its requests answer T0009, and those of every other file are answered.
  assert.equal(await codeOf(app.call('listOrders', { team: last }, system)), 'T0009')
  assert.equal(await codeOf(app.call('addOrder', { team: last, title: 'refused', code: 'R' }, system)), 'T0009')
  assert.deepEqual(await titlesOf(app, teams[0]), ['first of 0'])
  // While the cause stands, a retry fails again and the file stays failed.
  assert.deepEqual((await listed(app, dataFolder, { retry: last })).retried?.ok, false)
  assert.equal((await listed(app, dataFolder, { behind: true })).files[0]?.failed?.code, 'T2001')
  // With the cause gone the retry brings the file up, and its requests are answered again.
  writeFile(fileOf(dataFolder, last), `UPDATE "orders" SET "code" = 'C11'`)
  assert.deepEqual((await listed(app, dataFolder, { retry: last })).retried, { id: last, ok: true })
  assert.deepEqual((await listed(app, dataFolder, { behind: true })).files, [])
  assert.deepEqual(await titlesOf(app, last), ['first of 11'])
})

test('[50-6] the upkeep is done again every upkeepEvery by the clock of the app, and a reader removes what lies under tenants/.tmp and nothing else', async (t) => {
  const desk = await deskOf(t)
  const { app, dataFolder } = desk
  const near = await app.reader()
  await current(app, near)
  const folder = readerFolder(desk, 2)
  const [north, gone] = [await addTeam(app, 'North'), await addTeam(app, 'Gone')]
  await addOrder(app, north, 'a lamp')
  await addOrder(app, gone, 'a desk')
  await level(app, near)
  // Both machines close their files. Then, with no word to either engine: a half copy under `tenants/.tmp/` of each,
  // and the row of one team taken out of the shared file of each, so that its file is the file of nobody.
  app.clock.advance('2 minutes')
  await moment(20)
  for (const one of [dataFolder, folder]) {
    mkdirSync(join(one, 'tenants', '.tmp'), { recursive: true })
    writeFileSync(join(one, 'tenants', '.tmp', 'half.db'), 'half a copy')
    writeFile(join(one, 'data.db'), 'DELETE FROM "teams" WHERE "id" = ?', gone)
    assert.equal(hasFile(one, gone), true)
  }
  app.clock.advance('1 day')
  await moment(20)
  // The writer holds the disk against its directory both ways.
  assert.equal(existsSync(join(dataFolder, 'tenants', '.tmp', 'half.db')), false)
  assert.equal(hasFile(dataFolder, gone), false)
  assert.equal(hasFile(dataFolder, north), true)
  // A reader writes no file of its own accord: it removes what is temporary, and leaves the rest to its writer.
  assert.equal(existsSync(join(folder, 'tenants', '.tmp', 'half.db')), false)
  assert.equal(hasFile(folder, gone), true)
  assert.equal(hasFile(folder, north), true)
})

test('[50-6] tenant tables have tenants of two tables: each file stands under its table, is listed with it, and is behind by the layout of the tenant tables of that table alone', async (t) => {
  const first = await deskOf(t, { shops: true })
  const north = await addTeam(first.app, 'North')
  await addOrder(first.app, north, 'a lamp')
  const shop = idOf(await first.app.call('addShop', { name: 'Corner' }, system))
  await first.app.call('addStock', { shop, item: 'nails' }, system)
  const before = (await listed(first.app, first.dataFolder)).files
  assert.deepEqual(before.map((one) => [one.table, one.id, one.tables]).sort(), [
    ['shops', shop, ['stock']],
    ['teams', north, ['orders']],
  ])
  assert.notEqual(before[0].layout, before[1].layout)
  assert.equal(existsSync(join(first.dataFolder, 'tenants', 'shops', shop.slice(-2), `${shop}.db`)), true)
  assert.equal(hasFile(first.dataFolder, north), true)
  const rows = (table: string, of: string): Promise<unknown> =>
    command(first.app, first.dataFolder, 'data', { what: 'rows', table, of })
  assert.deepEqual(
    Object(await rows('stock', shop)).map((row: Record<string, unknown>) => row.item),
    ['nails'],
  )
  // An id names the tenant of one table alone: the stock of a team is no row.
  assert.deepEqual(await rows('stock', north), [])
  await first.app.kill()

  // The next version names a column of `orders` anew: the file of the team is behind, and the file of the shop is not.
  const next = await deskBundle(t, { shops: true, renamed: true })
  const { app, dataFolder } = await openOn(t, next, first.dataFolder)
  await until(
    'every file is brought up',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    2000,
  )
  const after = (await listed(app, dataFolder)).files
  const [shopBefore, shopAfter] = [before, after].map((files) => files.find((one) => one.id === shop))
  const [teamBefore, teamAfter] = [before, after].map((files) => files.find((one) => one.id === north))
  assert.deepEqual([shopAfter?.layout, shopAfter?.writes], [shopBefore?.layout, shopBefore?.writes])
  assert.notEqual(teamAfter?.layout, teamBefore?.layout)
  assert.ok((teamAfter?.writes ?? 0) > (teamBefore?.writes ?? 0))
  const stock: Record<string, unknown>[] = Object(await app.call('listStock', { shop }, system))
  assert.deepEqual(
    stock.map((row) => row.item),
    ['nails'],
  )
  assert.deepEqual(
    (await ordersOf(app, north)).map((row) => row.name),
    ['a lamp'],
  )
})

test('[50-4@4] a heavy read of a closed file that is unswept answers no row that is gone, and --sweep reaches a file that nobody opens', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const [north, south] = [await addTeam(app, 'North'), await addTeam(app, 'South')]
  const caller = await app.user({ name: 'Ada', roles: [] })
  const ada = caller.kind === 'user' ? (caller.user?.id ?? '') : ''
  for (const team of [north, south]) {
    await addOrder(app, team, 'placed by Ada', { placedBy: ada })
    await addOrder(app, team, 'placed by nobody')
  }
  // Both files are closed when the person is removed: neither is swept in that write.
  app.clock.advance('2 minutes')
  await moment()
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => [one.open, one.unswept]),
    [
      [false, false],
      [false, false],
    ],
  )
  await app.call('removeUser', { user: ada }, system)
  const unswept = (await listed(app, dataFolder, { unswept: true })).files
  assert.deepEqual(unswept.map((one) => one.id).sort(), [north, south].sort())

  // The heavy read finds its file closed and unswept: the file is swept before the read is handed to a query thread.
  const heavy: Record<string, unknown>[] = Object(await app.call('heavyOrders', { team: north }, system))
  assert.deepEqual(
    heavy.map((row) => row.title),
    ['placed by nobody'],
  )
  assert.deepEqual(
    (await listed(app, dataFolder, { unswept: true })).files.map((one) => one.id),
    [south],
  )
  // The pass of a removal opens and sweeps what is left.
  assert.equal((await listed(app, dataFolder, { sweep: true })).swept, 1)
  assert.deepEqual((await listed(app, dataFolder, { unswept: true })).files, [])
  await app.kill()
  assert.deepEqual(
    readFile(fileOf(dataFolder, south), 'SELECT "title" FROM "orders"').map((row) => row.title),
    ['placed by nobody'],
  )
})
