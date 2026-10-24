import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import type { App } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import {
  addOrder,
  addTeam,
  dataPlace,
  deskBundle,
  deskOf,
  fileOf,
  listed,
  logLines,
  ordersOf,
  pairOf,
  readFile,
  titlesOf,
  writeFile,
} from './desks.ts'
import { codeOf, moment, until } from './many.ts'

const system = { as: { kind: 'system' } } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** Answers what a promise was refused with, or nothing where it was kept. */
const refusalOf = (work: Promise<unknown>): Promise<Record<string, unknown> | undefined> =>
  work.then(
    () => undefined,
    (error: unknown) => Object(error),
  )

test('[50-5@6] app.switch is refused where one file holds a misfit, naming the tenant and the count, and the old version then writes a row without that column; with the misfit mended the switch is taken, and its pass reaches a file that nobody opens', async (t) => {
  const { app, dataFolder } = await deskOf(t)
  const first = running(app)
  const [north, south, east] = [await addTeam(app, 'North'), await addTeam(app, 'South'), await addTeam(app, 'East')]
  await addOrder(app, north, 'a lamp', { code: 'L1' })
  await addOrder(app, south, 'a desk', { code: 'D1' })
  const chair = await addOrder(app, south, 'a chair')
  await addOrder(app, east, 'a shelf', { code: 'S1' })
  const before = (await listed(app, dataFolder)).files

  // `code` must hold a value from the next version on, and one order of South holds none.
  const required = await app.add(await deskBundle(t, { codeRequired: true }))
  const refused = await refusalOf(app.switch(required))
  assert.equal(refused?.code, 'T2001')
  assert.match(String(refused?.message), new RegExp(`1 row of \`orders\`.*\`orders\\.code\`.*teams ${south}`))
  // Nothing was changed: the version before runs, every file stands where it stood, and it writes a row without the column.
  assert.equal(running(app), first)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => [one.id, one.layout, one.behind]),
    before.map((one) => [one.id, one.layout, false]),
  )
  const rug = await addOrder(app, north, 'a rug')
  assert.deepEqual(await titlesOf(app, north), ['a lamp', 'a rug'])
  // Asked for dry, the switch counts the same misfits, of two files by now, and changes nothing.
  assert.equal((await refusalOf(app.switch(required, { dry: true })))?.code, 'T2001')

  // With every row mended, the files are closed, so that nobody holds one open, and the switch is taken.
  await app.write([{ change: 'orders', of: south, id: chair, values: { code: 'C1' } }], { as: 'system' })
  await app.write([{ change: 'orders', of: north, id: rug, values: { code: 'R1' } }], { as: 'system' })
  app.clock.advance('2 minutes')
  await until('every file is closed', async () => (await listed(app, dataFolder)).files.every((one) => !one.open))
  assert.deepEqual(await app.switch(required, { dry: true }).then((dry) => [dry.refused, dry.behind]), [undefined, 0])
  const taken = await app.switch(required)
  assert.deepEqual([taken.refused, taken.behind, running(app)], [undefined, 3, required])
  // The pass brings every file up, with no request that names one.
  await until(
    'every file is brought up',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    2000,
  )
  assert.equal(logLines(dataFolder, 'The pass over the data files of tenants has ended').length, 1)
  // A write is held to the new layout from then on.
  assert.equal(typeof (await codeOf(app.call('addOrder', { team: east, title: 'no code' }, system))), 'string')
  await addOrder(app, east, 'a stool', { code: 'T1' })
  assert.deepEqual(await titlesOf(app, east), ['a shelf', 'a stool'])
})

test("[50-5@6] a second switch answers refused: 'behind' until the pass of the first has ended, and is taken then", async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const teams: string[] = []
  for (let i = 0; i < 12; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `first of ${i}`, { code: `C${i}` })
  }
  const required = await app.add(await deskBundle(t, { codeRequired: true, filesAtOnce: 1 }))
  const renamed = await app.add(await deskBundle(t, { codeRequired: true, renamed: true, filesAtOnce: 1 }))
  // A switch that is taken answers how many files its pass began with.
  const taken = await app.switch(required)
  assert.deepEqual([taken.refused, taken.behind], [undefined, 12])
  // While that pass has not ended, a switch that changes a tenant table is not taken, and changes nothing.
  const second = await app.switch(renamed)
  assert.equal(second.refused, 'behind')
  assert.ok(Number(second.behind) > 0 && Number(second.behind) <= 12, `behind: ${second.behind}`)
  assert.equal(running(app), required)
  // A program waits by asking for the count, which changes nothing either.
  await until(
    'the pass of the first switch has ended',
    async () => (await app.switch(renamed, { dry: true })).behind === 0,
    4000,
  )
  assert.equal(running(app), required)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.behind),
    teams.map(() => false),
  )
  // Then the second switch is taken: a column that goes on under another name, in every file.
  const third = await app.switch(renamed)
  assert.deepEqual([third.refused, third.hard, running(app)], [undefined, true, renamed])
  await until(
    'every file is brought up again',
    async () => (await listed(app, dataFolder)).files.every((one) => !one.behind),
    4000,
  )
  for (const [i, team] of teams.entries()) {
    const [order] = await ordersOf(app, team)
    assert.deepEqual([order.name, 'title' in order], [`first of ${i}`, false])
  }
})

test("[50-5@6] after a switch a file that cannot be brought up is marked failed, the pass ends without it, a switch that changes a tenant table answers refused: 'behind' meanwhile, and --retry brings the file up once the cause is gone", async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const teams: string[] = []
  // Many files, brought up one at a time: the pass is far from its last file when the hand reaches it.
  for (let i = 0; i < 40; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `first of ${i}`, { code: `C${i}` })
  }
  const required = await app.add(await deskBundle(t, { codeRequired: true, filesAtOnce: 1 }))
  const renamed = await app.add(await deskBundle(t, { codeRequired: true, renamed: true, filesAtOnce: 1 }))
  app.clock.advance('2 minutes')
  await until('every file is closed', async () => (await listed(app, dataFolder)).files.every((one) => !one.open))
  await app.switch(required)
  // Before the pass reaches one file, a hand takes the code of its order away, round every rule.
  // The file that the pass writes at this moment refuses the hand, and one that it has brought up refuses the
  // value: the hand takes the first file, from the end of the directory, that takes its write.
  const behind = (await listed(app, dataFolder, { behind: true })).files.map((one) => one.id).reverse()
  const last =
    behind.find((team) => {
      try {
        writeFile(fileOf(dataFolder, team), 'UPDATE "orders" SET "code" = NULL')
        return true
      } catch {
        return false
      }
    }) ?? ''
  assert.ok(teams.includes(last))
  await until(
    'the pass has ended without the file',
    async () => {
      const behind = (await listed(app, dataFolder, { behind: true })).files
      return behind.length === 1 && behind[0].failed !== undefined
    },
    4000,
  )
  const [failed] = (await listed(app, dataFolder, { behind: true })).files
  // The file is refused with the count of its rows that do not fit. In one run of some it is refused by the
  // store instead, with the code of a value that does not fit its column: the count was read before the hand wrote.
  const code = String(failed.failed?.code)
  assert.deepEqual([failed.id, ['T2001', 'T2107'].includes(code)], [last, true], JSON.stringify(failed.failed))
  if (code === 'T2001') assert.match(String(failed.failed?.message), new RegExp(`1 row of \`orders\`.*teams ${last}`))
  // Its requests answer T0009, and those of every other file are answered.
  assert.equal(await codeOf(app.call('listOrders', { team: last }, system)), 'T0009')
  const other = teams.find((team) => team !== last) ?? ''
  assert.equal((await titlesOf(app, other)).length, 1)
  // A file that failed is behind: the next switch that changes a tenant table is not taken.
  const second = await app.switch(renamed)
  assert.deepEqual([second.refused, second.behind, running(app)], ['behind', 1, required])
  // With the cause gone the retry brings the file up, and the switch is taken.
  writeFile(fileOf(dataFolder, last), `UPDATE "orders" SET "code" = 'C'`)
  assert.deepEqual((await listed(app, dataFolder, { retry: last })).retried, { id: last, ok: true })
  await moment()
  assert.equal((await app.switch(renamed)).refused, undefined)
  assert.equal(running(app), renamed)
})

/** How many holds the data file of a team keeps, read with no engine. */
function holdsOf(dataFolder: string, team: string): number {
  try {
    const [row] = readFile(fileOf(dataFolder, team), `SELECT "value" FROM "_t_meta" WHERE "key" = 'holds'`)
    const held: unknown = row ? JSON.parse(String(row.value)) : []
    return Array.isArray(held) ? held.length : 0
  } catch {
    // A file thread writes the file at this moment: what it holds is not known until the next look.
    return -1
  }
}

/** The check that the shared file of a data folder names as standing, read with no engine, or nothing. */
function checkIn(dataFolder: string): unknown {
  const [row] = readFile(join(dataFolder, 'data.db'), `SELECT "value" FROM "_t_meta" WHERE "key" = 'check'`)
  return row ? (JSON.parse(String(row.value)) ?? undefined) : undefined
}

/** Adds so many teams, each with one order that holds a code. */
async function teamsOf(app: TestApp, count: number): Promise<string[]> {
  const teams: string[] = []
  for (let i = 0; i < count; i++) {
    teams.push(await addTeam(app, `team ${i}`))
    await addOrder(app, teams[i], `first of ${i}`, { code: `C${i}` })
  }
  return teams
}

test('[50-5@6] while the check of a switch stands, a file that passed is held to its steps: a write of the old version that would break one is T2107; the misfit of a later file refuses the switch, and then no hold counts, none is left in any file, and the old version writes that row', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = running(app)
  const teams = await teamsOf(app, 60)
  // The files are checked in the order of the directory: the one that does not fit is the last of them.
  const order = (await listed(app, dataFolder)).files.map((one) => one.id)
  const [early, last] = [order[0], order.at(-1) ?? '']
  await addOrder(app, last, 'no code')
  const required = await app.add(await deskBundle(t, { codeRequired: true, filesAtOnce: 1 }))
  const switching = refusalOf(app.switch(required))
  // The first file was checked, fits, and is held, while the check goes on over the others.
  await until('the first file is held', () => holdsOf(dataFolder, early) > 0, 4000)
  assert.equal(Object(checkIn(dataFolder)).version, required)
  const held = await refusalOf(app.call('addOrder', { team: early, title: 'breaks the hold' }, system))
  assert.equal(held?.code, 'T2107')
  assert.equal(running(app), first)
  // A write that keeps to the step is taken meanwhile, by the old version.
  await addOrder(app, early, 'keeps to it', { code: 'K' })
  // The last file does not fit: the switch is refused, naming the tenant and the count.
  const refused = await switching
  assert.equal(refused?.code, 'T2001')
  assert.match(String(refused?.message), new RegExp(`1 row of \`orders\`.*\`orders\\.code\`.*teams ${last}`))
  assert.deepEqual([running(app), checkIn(dataFolder)], [first, undefined])
  // No hold outlives its check: the write that was refused is taken at once, and a pass takes the holds out of every file.
  await addOrder(app, early, 'breaks nothing now')
  assert.deepEqual(await titlesOf(app, early), [
    `first of ${teams.indexOf(early)}`,
    'keeps to it',
    'breaks nothing now',
  ])
  await until('no file keeps a hold', () => teams.every((team) => holdsOf(dataFolder, team) === 0), 4000)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.behind),
    teams.map(() => false),
  )
})

test('[50-5@6] after a kill during the check of a switch the engine opens with the version before, takes the check away with its holds, and the old version writes a row without the column', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = running(app)
  const teams = await teamsOf(app, 60)
  const [early] = (await listed(app, dataFolder)).files.map((one) => one.id)
  const required = await app.add(await deskBundle(t, { codeRequired: true, filesAtOnce: 1 }))
  const switching = refusalOf(app.switch(required))
  await until('the first file is held', () => holdsOf(dataFolder, early) > 0, 4000)
  assert.equal(Object(checkIn(dataFolder)).version, required)
  // The program is ended while the check stands: the shared file names it, and some files keep its holds.
  await app.kill()
  await switching
  assert.equal(Object(checkIn(dataFolder)).version, required)
  assert.ok(holdsOf(dataFolder, early) > 0)
  await app.restart()
  assert.deepEqual([running(app), checkIn(dataFolder)], [first, undefined])
  await addOrder(app, early, 'no code')
  await until('no file keeps a hold', () => teams.every((team) => holdsOf(dataFolder, team) === 0), 4000)
  assert.equal(logLines(dataFolder, 'A check of a switch stood when the engine stopped').length, 1)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => one.behind),
    teams.map(() => false),
  )
})

test('[50-5@6] a switch back to the layout that the pass under way came from is taken at once: the pass turns round, a file that was brought up is brought back, none keeps a hold, and the old version writes a row without the column in every file', async (t) => {
  const { app, dataFolder } = await deskOf(t, { filesAtOnce: 1 })
  const first = String(running(app))
  const teams = await teamsOf(app, 12)
  const required = await app.add(await deskBundle(t, { codeRequired: true, filesAtOnce: 1 }))
  const taken = await app.switch(required)
  assert.deepEqual([taken.refused, taken.behind], [undefined, 12])
  // The switch was hard, so the version before was dropped: it is added again, as a program that goes back adds it.
  assert.equal(await app.add(await deskBundle(t, { filesAtOnce: 1 })), first)
  // Its pass has not ended. Any other switch that changes a tenant table waits for it, and the one back does not.
  const back = await app.switch(first)
  assert.deepEqual([back.refused, running(app)], [undefined, first])
  await until(
    'the pass has turned round, and every file stands at the layout before',
    async () => (await app.switch(required, { dry: true }).catch(() => ({ behind: -1 }))).behind === 0,
    4000,
  )
  await until('no file keeps a hold', () => teams.every((team) => holdsOf(dataFolder, team) === 0), 4000)
  assert.deepEqual(
    (await listed(app, dataFolder)).files.map((one) => [one.behind, one.failed]),
    teams.map(() => [false, undefined]),
  )
  // Every file takes a row without the column again, also one that the pass had brought up.
  for (const [i, team] of teams.entries()) {
    await addOrder(app, team, 'no code')
    assert.deepEqual(await titlesOf(app, team), [`first of ${i}`, 'no code'], `team ${i}`)
  }
})

test('[50-11@6] a file that the check of a switch held on the writer, and let go again, is the same on the reader', async (t) => {
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t))
  const { writer, reader } = pair
  const until2 = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    // Many beats: a file thread of a loaded computer takes its time, and a beat is a moment.
    for (let i = 0; i < 600; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  await until2('the reader is current', () => reader.app.at().current)
  const teams = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  for (const team of teams) await addOrder(writer.app, team, 'a lamp', { code: 'L1' })
  const order = (await listed(writer.app, writer.dataFolder)).files.map((one) => one.id)
  const [early, last] = [order[0], order[1]]
  await addOrder(writer.app, last, 'no code')
  await until2('the reader holds the files', () => reader.app.at().n === writer.app.at().n)
  const before = writer.app.at().n

  // The first file fits and is held, the second does not: the switch is refused, and the hold is let go again.
  const required = await writer.app.add(await deskBundle(t, { codeRequired: true }))
  await until2('the reader holds the version', () => reader.app.versions().some((one) => one.id === required))
  assert.equal((await refusalOf(writer.app.switch(required)))?.code, 'T2001')
  await until2('the hold is let go on the writer', () => holdsOf(writer.dataFolder, early) === 0)
  // Each write of a file thread took a number of the app: the hold, and its letting go, beside the check itself.
  assert.ok(writer.app.at().n >= before + 2, `${before} to ${writer.app.at().n}`)
  await until2('the reader holds every write', () => reader.app.at().n === writer.app.at().n)
  await addOrder(writer.app, early, 'no code')
  await until2('the reader holds the new order', () => reader.app.at().n === writer.app.at().n)
  assert.deepEqual(await titlesOf(reader.app, early), ['a lamp', 'no code'])
  await pair.close()
  for (const team of teams)
    assert.deepEqual(heldIn(reader.dataFolder, team), heldIn(writer.dataFolder, team), `the file of ${team}`)
})

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

test('[50-11@6] a file that a switch on the writer checked and its pass brought up is the same on the reader, which runs the version', async (t) => {
  const pair = await pairOf(t, await deskBundle(t), dataPlace(t))
  const { writer, reader } = pair
  const until2 = async (what: string, holds: () => boolean | Promise<boolean>): Promise<void> => {
    for (let i = 0; i < 600; i++) {
      if (await holds()) return
      await pair.beat()
    }
    assert.fail(`never: ${what}`)
  }
  const runs = (app: App): string | undefined => app.versions().find((one) => one.running)?.id
  await until2('the reader is current', () => reader.app.at().current)
  const teams = [await addTeam(writer.app, 'North'), await addTeam(writer.app, 'South')]
  for (const team of teams) await addOrder(writer.app, team, 'a lamp', { code: 'L1' })
  await until2('the reader holds the files', () => reader.app.at().n === writer.app.at().n)

  // A version in which `code` must hold a value is added and switched to, with no machine opened anew.
  const required = await writer.app.add(await deskBundle(t, { codeRequired: true }))
  await until2('the reader holds the version', () => reader.app.versions().some((one) => one.id === required))
  const taken = await writer.app.switch(required)
  assert.deepEqual([taken.refused, taken.behind], [undefined, 2])
  await until2('the writer brought every file up', async () =>
    (await listed(writer.app, writer.dataFolder)).files.every((one) => !one.behind),
  )
  await until2(
    'the reader runs the version and holds every write',
    () => reader.app.at().current && reader.app.at().n === writer.app.at().n && runs(reader.app) === required,
  )
  await until2('the reader brought every file up', async () =>
    (await listed(reader.app, reader.dataFolder)).files.every((one) => !one.behind),
  )
  await addOrder(writer.app, teams[0], 'a desk', { code: 'D1' })
  await until2('the reader holds the new order', () => reader.app.at().n === writer.app.at().n)
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
