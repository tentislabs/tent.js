import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, fileOf, hasFile, readFile } from './desks.ts'
import { moment, until } from './many.ts'
import { copyOf } from './projects.ts'

const system = { as: 'system' } as const

/** The id of the version that an app runs. */
const running = (app: TestApp): string | undefined => app.versions().find((one) => one.running)?.id

/** Answers what a promise was refused with, or nothing where it was kept. */
const refusalOf = (work: Promise<unknown>): Promise<Record<string, unknown> | undefined> =>
  work.then(
    () => undefined,
    (error: unknown) => Object(error),
  )

/** Answers what says whether a promise has ended. */
function watched(work: Promise<unknown>): () => boolean {
  let ended = false
  const end = (): void => {
    ended = true
  }
  work.then(end, end)
  return () => ended
}

const shared = '  // where the notes live\n'
const tenanted = "  tenant: 'team',\n"

/** The project of the notes in a folder of the test, as it keeps the notes in the shared file, with what builds it. */
function projectOf(t: TestContext) {
  const folder = copyOf(t, 'moving')
  const tables = join(folder, 'tables.ts')
  let bundles = 0
  return {
    folder,
    /** Has the project make the notes a tenant table, or keep them in the shared file again. */
    keep(where: 'tenant' | 'shared'): void {
      const text = readFileSync(tables, 'utf8')
      const [from, to] = where === 'tenant' ? [shared, tenanted] : [tenanted, shared]
      assert.ok(text.includes(from), `the tables hold ${JSON.stringify(from)}`)
      writeFileSync(tables, text.replace(from, to))
    },
    /** Builds the project as it stands into a folder of its own, and answers that folder. */
    async bundle(): Promise<string> {
      const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', `bundle-${++bundles}`) })
      assert.deepEqual(
        built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
        [],
      )
      return built.bundleFolder
    },
  }
}

/** Adds so many teams, as the system, and answers their ids. */
async function teamsOf(app: TestApp, count: number): Promise<string[]> {
  const teams: string[] = []
  for (let i = 0; i < count; i++)
    teams.push(String(Object(await app.call('addTeam', { name: `team ${i}` }, { as: { kind: 'system' } })).id))
  return teams
}

/** Every note of the app, in the order of the ids: each with its team, its body and its two moments. */
async function notesOf(app: TestApp): Promise<unknown[][]> {
  const rows = await app.rows('notes')
  return rows
    .map((row) => [String(row.id), row.team, row.body, row.code ?? null, Number(row.createdAt), Number(row.updatedAt)])
    .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1))
}

/** How many notes one data file holds, read with no engine: none where it holds no such table, or is not there. */
function countIn(file: string): number {
  if (!existsSync(file)) return 0
  try {
    return Number(readFile(file, 'SELECT count(*) AS "n" FROM "notes"')[0]?.n ?? 0)
  } catch {
    return 0
  }
}

/** Whether the shared file of a data folder notes a move, read with no engine. */
const movesIn = (dataFolder: string): boolean =>
  readFile(join(dataFolder, 'data.db'), `SELECT "value" FROM "_t_meta" WHERE "key" = 'move'`).some(
    (row) => JSON.parse(String(row.value)) !== null,
  )

test('[50-7] a table of 10,000 rows is moved into the files of its tenants by a switch with move, and back by another; reads of that table go on meanwhile and writes wait; and a file that the move back emptied is removed by the upkeep', async (t) => {
  const project = projectOf(t)
  const sharedBundle = await project.bundle()
  const { app, dataFolder } = await appIn(t, project.folder)
  const first = String(running(app))
  const teams = await teamsOf(app, 20)
  for (let part = 0; part < 10; part++)
    await app.write(
      Array.from({ length: 1000 }, (_, i) => ({
        add: 'notes',
        values: { team: teams[i % 20], body: `note ${part * 1000 + i}`, code: `code ${part * 1000 + i}` },
      })),
      system,
    )
  const before = await notesOf(app)
  assert.equal(before.length, 10_000)
  project.keep('tenant')
  const kept = await app.add(await project.bundle())

  // A version in which a table gains `tenant` while it holds rows is not taken as it is: its finding names the way.
  const refused = await refusalOf(app.switch(kept))
  assert.deepEqual([refused?.code, String(refused?.fix).includes('--move'), running(app)], ['T2001', true, first])

  // With `move` the rows are added where they go, a tenant at a time. Meanwhile a read of the table is answered
  // from where the rows still stand, and a write of it waits.
  const moving = app.switch(kept, { move: true })
  const ended = watched(moving)
  // The write is sent once the move is noted: one that came before it wrote a row that moves with the others.
  await until('the move is noted', () => movesIn(dataFolder) || ended(), 4000)
  const late = refusalOf(app.write([{ add: 'notes', values: { team: teams[0], body: 'late' } }], system))
  const lateEnded = watched(late)
  let reads = 0
  while (!ended()) {
    const stood = running(app) === first
    const rows = await app.read({ from: 'notes', limit: 3 }, system).then(
      (read) => (Array.isArray(read) ? read.length : -1),
      () => -1,
    )
    if (stood && running(app) === first) {
      assert.equal(rows, 3)
      assert.equal(lateEnded(), false)
      reads++
    }
    await moment(1)
  }
  assert.ok(reads > 0, 'a read was answered while the rows moved')
  const moved = await moving
  assert.deepEqual([moved.refused, moved.hard, running(app)], [undefined, true, kept])
  await late
  // Every row is in the file of its tenant, with its id and its two moments, and none is left in the shared file.
  const after = (await notesOf(app)).filter((row) => row[2] !== 'late')
  assert.deepEqual(after, before)
  assert.equal(countIn(join(dataFolder, 'data.db')), 0)
  await until('every file is closed or read', () => teams.every((team) => hasFile(dataFolder, team)))
  assert.equal(movesIn(dataFolder), false)

  // And back, by another switch with `move`: the version before was dropped by the hard switch, and is added again.
  assert.equal(await app.add(sharedBundle), first)
  const back = await app.switch(first, { move: true })
  assert.deepEqual([back.refused, running(app)], [undefined, first])
  assert.deepEqual(
    (await notesOf(app)).filter((row) => row[2] !== 'late'),
    before,
  )
  assert.ok(countIn(join(dataFolder, 'data.db')) >= 10_000)
  // No tenant table names the teams any more: the upkeep removes each file that the move emptied.
  await until(
    'the rows are taken out of every file',
    () => teams.every((team) => countIn(fileOf(dataFolder, team)) === 0),
    4000,
  )
  await until('the move has ended', () => !movesIn(dataFolder), 4000)
  app.clock.advance('1 day')
  await until('the upkeep removed the files', () => teams.every((team) => !hasFile(dataFolder, team)), 4000)
})

test('[50-7] a kill in the middle of a move leaves every row where it was and none twice, and the move is made whole afterwards', async (t) => {
  const project = projectOf(t)
  const { app, dataFolder } = await appIn(t, project.folder)
  const first = String(running(app))
  const teams = await teamsOf(app, 20)
  for (let part = 0; part < 10; part++)
    await app.write(
      Array.from({ length: 1000 }, (_, i) => ({
        add: 'notes',
        values: { team: teams[i % 20], body: `note ${part * 1000 + i}` },
      })),
      system,
    )
  const before = await notesOf(app)
  project.keep('tenant')
  const bundle = await project.bundle()
  const kept = await app.add(bundle)
  const moving = refusalOf(app.switch(kept, { move: true }))
  // Some tenants hold their rows in their file already, and the others do not yet.
  await until('the move has reached a file', () => teams.some((team) => countIn(fileOf(dataFolder, team)) > 0), 4000)
  await app.kill()
  await moving
  assert.ok(teams.some((team) => countIn(fileOf(dataFolder, team)) > 0))
  assert.equal(movesIn(dataFolder), true)
  // The engine opens with the version it had, and removes what the move added: every row is where it was, once.
  await app.restart()
  assert.equal(running(app), first)
  assert.deepEqual(await notesOf(app), before)
  assert.equal(countIn(join(dataFolder, 'data.db')), 10_000)
  assert.deepEqual(
    teams.map((team) => countIn(fileOf(dataFolder, team))),
    teams.map(() => 0),
  )
  assert.equal(movesIn(dataFolder), false)
  // The move is then made whole.
  const again = await app.add(bundle)
  await app.switch(again, { move: true })
  assert.deepEqual(await notesOf(app), before)
  assert.equal(countIn(join(dataFolder, 'data.db')), 0)
})

test('[50-7] a move that a unique rule refuses is undone, naming the table, the tenant and the count, and asked for dry it counts the same', async (t) => {
  const project = projectOf(t)
  project.keep('tenant')
  const { app, dataFolder } = await appIn(t, project.folder)
  const first = String(running(app))
  const [north, south, east] = await teamsOf(app, 3)
  // A code is the only one of its kind in the file of its team: two teams hold the same one.
  await app.write([{ add: 'notes', of: north, values: { body: 'a', code: 'X' } }], system)
  await app.write([{ add: 'notes', of: north, values: { body: 'b', code: 'Y' } }], system)
  await app.write([{ add: 'notes', of: south, values: { body: 'c', code: 'X' } }], system)
  await app.write([{ add: 'notes', of: east, values: { body: 'd', code: 'Z' } }], system)
  const before = await notesOf(app)
  project.keep('shared')
  const whole = await app.add(await project.bundle())
  for (const how of [{ move: true, dry: true }, { move: true }]) {
    const refused = await refusalOf(app.switch(whole, how))
    assert.equal(refused?.code, 'T2001', JSON.stringify(how))
    // In the whole app the code of the second team is taken: its one row cannot be added.
    assert.match(String(refused?.message), new RegExp(`1 row of \`notes\`.*teams ${south}`), JSON.stringify(how))
    assert.equal(running(app), first)
    assert.deepEqual(await notesOf(app), before)
    assert.equal(countIn(join(dataFolder, 'data.db')), 0)
    assert.equal(movesIn(dataFolder), false)
  }
  // With the code changed the move is taken.
  const theirs = before.find((row) => row[1] === south)
  await app.write([{ change: 'notes', of: south, id: String(theirs?.[0]), values: { code: 'W' } }], system)
  await app.switch(whole, { move: true })
  assert.equal((await notesOf(app)).length, 4)
  assert.equal(countIn(join(dataFolder, 'data.db')), 4)
})
